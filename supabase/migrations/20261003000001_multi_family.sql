-- =============================================================================
-- Several families on one app.
--
-- Each family (table: households) already sees only its own data through
-- row-level security. This adds:
--   * app admins: may create "new family" invite links and see headline
--     counts per family — never any family's expenses, cards or bills.
--   * invite-only family creation: the first person to create a family becomes
--     the admin; after that, a new family needs a one-time invite from an admin.
-- A person still belongs to exactly one family (members.user_id is unique).
-- =============================================================================

create table public.app_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.family_invites (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  note              text check (length(note) <= 80),         -- e.g. "Mum & Dad"
  created_by        uuid not null references auth.users(id) on delete cascade,
  expires_at        timestamptz not null default now() + interval '14 days',
  used_by           uuid references auth.users(id) on delete set null,
  used_at           timestamptz,
  used_household_id uuid references public.households(id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table public.app_admins     enable row level security;
alter table public.family_invites enable row level security;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- Admins can see who the admins are, and manage family invites. Nobody else sees either table.
create policy app_admins_select on public.app_admins for select to authenticated using (public.is_app_admin());
create policy family_invites_select on public.family_invites for select to authenticated using (public.is_app_admin());
create policy family_invites_delete on public.family_invites for delete to authenticated
  using (public.is_app_admin() and used_at is null);

revoke all on public.app_admins, public.family_invites from anon;
grant select on public.app_admins to authenticated, service_role;
grant select, delete on public.family_invites to authenticated;
grant select, insert, update, delete on public.app_admins, public.family_invites to service_role;

-- -----------------------------------------------------------------------------
-- Creating a family now needs an invite (except the very first one).
-- -----------------------------------------------------------------------------
drop function public.create_household(text, text);

create or replace function public.create_household(
  household_name   text,
  my_display_name  text,
  family_invite    text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := auth.uid();
  hid   uuid;
  inv   public.family_invites;
  first boolean;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from public.members where user_id = uid) then
    raise exception 'you already belong to a family';
  end if;

  -- Until an admin exists, the first family's creator becomes admin (no invite needed).
  -- The lock stops two simultaneous first sign-ups both becoming admin.
  perform pg_advisory_xact_lock(hashtext('expensify.create_household'));
  first := not exists (select 1 from public.app_admins);

  if not first then
    select * into inv from public.family_invites
    where token = family_invite and used_at is null and expires_at > now()
    for update;
    if inv.id is null then
      raise exception 'a valid family invite is needed to start a new family';
    end if;
  end if;

  insert into public.households (name) values (household_name) returning id into hid;
  insert into public.members (household_id, user_id, display_name, role)
  values (hid, uid, my_display_name, 'owner');
  perform public.seed_default_categories(hid);

  if first then
    insert into public.app_admins (user_id) values (uid) on conflict do nothing;
  else
    update public.family_invites
    set used_by = uid, used_at = now(), used_household_id = hid
    where id = inv.id;
  end if;

  return hid;
end $$;

create or replace function public.create_family_invite(invite_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if not public.is_app_admin() then
    raise exception 'only an app admin can invite a new family';
  end if;
  insert into public.family_invites (note, created_by)
  values (invite_note, auth.uid())
  returning token into tok;
  return tok;
end $$;

-- Headline numbers for the admin page. Deliberately no amounts, merchants or names of expenses.
create or replace function public.admin_overview()
returns table (
  family_name    text,
  created_at     timestamptz,
  member_count   bigint,
  transactions   bigint,
  last_activity  timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then
    raise exception 'only an app admin can see the overview';
  end if;
  return query
    select h.name,
           h.created_at,
           (select count(*) from public.members m where m.household_id = h.id),
           (select count(*) from public.transactions t where t.household_id = h.id),
           (select max(t.created_at) from public.transactions t where t.household_id = h.id)
    from public.households h
    order by h.created_at;
end $$;

-- A family invite can be checked before sign-up finishes, without revealing anything else.
create or replace function public.check_family_invite(family_invite text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_invites
    where token = family_invite and used_at is null and expires_at > now()
  );
$$;

revoke all on function public.is_app_admin()                    from public, anon;
revoke all on function public.create_household(text, text, text) from public, anon;
revoke all on function public.create_family_invite(text)          from public, anon;
revoke all on function public.admin_overview()                    from public, anon;
revoke all on function public.check_family_invite(text)           from public, anon;
grant execute on function public.is_app_admin()                    to authenticated;
grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.create_family_invite(text)          to authenticated;
grant execute on function public.admin_overview()                    to authenticated;
grant execute on function public.check_family_invite(text)           to authenticated;

-- Wording: errors from joining now say "family" too.
create or replace function public.accept_invite(invite_token text, my_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.household_invites;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from public.members where user_id = uid) then
    raise exception 'you already belong to a family';
  end if;

  select * into inv from public.household_invites
  where token = invite_token and accepted_at is null and expires_at > now()
  for update;
  if inv.id is null then
    raise exception 'invite is invalid, used or expired';
  end if;

  insert into public.members (household_id, user_id, display_name, role)
  values (inv.household_id, uid, my_display_name, inv.role);
  update public.household_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.household_id;
end $$;

create or replace function public.create_invite(invite_role text default 'member')
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  tok text;
begin
  select household_id into hid from public.members where user_id = uid and role = 'owner';
  if hid is null then
    raise exception 'only a family owner can invite';
  end if;
  insert into public.household_invites (household_id, role, created_by)
  values (hid, invite_role, uid)
  returning token into tok;
  return tok;
end $$;
