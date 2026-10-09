-- =============================================================================
-- Expensify — initial schema
-- One household (you + spouse) shares everything. Every row carries
-- household_id, and row-level security (RLS) limits access to members.
-- Money is numeric(12,2). Card numbers are never stored — last 4 digits only.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Households and members
-- -----------------------------------------------------------------------------
create table public.households (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) between 1 and 80),
  base_currency  char(3) not null default 'SGD',
  created_at     timestamptz not null default now()
);

create table public.members (
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null check (length(trim(display_name)) between 1 and 40),
  role          text not null default 'member' check (role in ('owner', 'member', 'viewer')),
  created_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)               -- one household per person keeps things simple
);

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token        text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  role         text not null default 'member' check (role in ('member', 'viewer')),
  created_by   uuid not null references auth.users(id) on delete cascade,
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_by  uuid references auth.users(id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Cards and other payment accounts
-- -----------------------------------------------------------------------------
create table public.accounts (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  name              text not null check (length(trim(name)) between 1 and 60),
  issuer            text,                       -- e.g. DBS, UOB, Citi
  network           text check (network in ('visa', 'mastercard', 'amex', 'unionpay', 'jcb', 'other')),
  last4             char(4) check (last4 ~ '^[0-9]{4}$'),
  type              text not null default 'credit'
                    check (type in ('credit', 'debit', 'cash', 'paynow', 'ewallet', 'other')),
  holder_user_id    uuid references auth.users(id) on delete set null,
  statement_day     smallint check (statement_day between 1 and 31),
  wallet_card_name  text,                       -- name shown in Apple Wallet, used by auto-capture later
  color             text,                       -- UI accent for the card
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, name)
);

-- Optional rules per card. A card can have none, or several (e.g. a min spend
-- plus a bonus cap). valid_from / valid_to keep history right when terms change.
create table public.spend_rules (
  id                          uuid primary key default gen_random_uuid(),
  household_id                uuid not null references public.households(id) on delete cascade,
  account_id                  uuid not null,
  kind                        text not null check (kind in ('min_spend', 'bonus_cap')),
  period                      text not null check (period in ('calendar_month', 'statement_cycle')),
  amount                      numeric(12,2) not null check (amount > 0),
  excluded_category_ids       uuid[] not null default '{}',
  excluded_merchant_patterns  text[] not null default '{}',
  valid_from                  date not null default current_date,
  valid_to                    date,
  note                        text,
  created_at                  timestamptz not null default now(),
  foreign key (account_id, household_id) references public.accounts(id, household_id) on delete cascade,
  check (valid_to is null or valid_to >= valid_from)
);

-- -----------------------------------------------------------------------------
-- Categories (two levels) and merchant auto-categorisation rules
-- -----------------------------------------------------------------------------
create table public.categories (
  id                        uuid primary key default gen_random_uuid(),
  household_id              uuid not null references public.households(id) on delete cascade,
  parent_id                 uuid,
  name                      text not null check (length(trim(name)) between 1 and 40),
  icon                      text,
  sort_order                integer not null default 0,
  is_excluded_from_reports  boolean not null default false,
  is_archived               boolean not null default false,
  created_at                timestamptz not null default now(),
  unique (id, household_id),
  unique nulls not distinct (household_id, parent_id, name),
  foreign key (parent_id, household_id) references public.categories(id, household_id) on delete cascade,
  check (parent_id is distinct from id)
);

create table public.merchant_rules (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  pattern       text not null check (length(trim(pattern)) between 1 and 100),  -- case-insensitive "contains"
  category_id   uuid,
  rename_to     text,
  priority      integer not null default 100,   -- lower runs first
  created_at    timestamptz not null default now(),
  foreign key (category_id, household_id) references public.categories(id, household_id) on delete cascade,
  unique (household_id, pattern)
);

-- -----------------------------------------------------------------------------
-- Receipts and transactions (the ledger)
-- -----------------------------------------------------------------------------
create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  image_path      text not null,                -- path in the private "receipts" storage bucket
  ocr_json        jsonb,
  ocr_confidence  numeric(4,3) check (ocr_confidence between 0 and 1),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (id, household_id)
);

create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households(id) on delete cascade,
  account_id           uuid,                    -- null = cash / unknown
  spent_by             uuid references auth.users(id) on delete set null,
  created_by           uuid references auth.users(id) on delete set null default auth.uid(),
  txn_at               timestamptz not null default now(),
  amount               numeric(12,2) not null check (amount <> 0),  -- negative = refund
  currency             char(3) not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  amount_sgd           numeric(12,2) not null,
  merchant_raw         text,
  merchant             text,
  category_id          uuid,
  source               text not null default 'manual'
                       check (source in ('manual', 'applepay', 'email', 'receipt', 'statement', 'telegram')),
  status               text not null default 'confirmed'
                       check (status in ('pending', 'confirmed', 'posted')),
  counts_to_min_spend  boolean,                 -- null = decide from the card's rules
  notes                text,
  receipt_id           uuid,
  dedupe_key           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (account_id, household_id)  references public.accounts(id, household_id)   on delete restrict,
  foreign key (category_id, household_id) references public.categories(id, household_id) on delete set null (category_id),
  foreign key (receipt_id, household_id)  references public.receipts(id, household_id)   on delete set null (receipt_id)
);

create index transactions_household_txn_at_idx on public.transactions (household_id, txn_at desc);
create index transactions_account_txn_at_idx   on public.transactions (account_id, txn_at desc);
create index transactions_category_idx         on public.transactions (category_id);
create unique index transactions_dedupe_key_idx on public.transactions (household_id, dedupe_key) where dedupe_key is not null;

-- -----------------------------------------------------------------------------
-- Budgets (later phase) and ingest tokens (for automation, later phase)
-- -----------------------------------------------------------------------------
create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  category_id   uuid not null,
  month         date not null check (extract(day from month) = 1),
  amount        numeric(12,2) not null check (amount > 0),
  foreign key (category_id, household_id) references public.categories(id, household_id) on delete cascade,
  unique (household_id, category_id, month)
);

create table public.ingest_tokens (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  token_hash    text not null unique,           -- sha256 of the secret; the secret itself is never stored
  label         text not null,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create or replace function public.tg_transactions_defaults()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.amount_sgd is null and new.currency = 'SGD' then
    new.amount_sgd := new.amount;
  end if;
  if new.merchant is null then
    new.merchant := new.merchant_raw;
  end if;
  return new;
end $$;

create trigger transactions_defaults
  before insert or update on public.transactions
  for each row execute function public.tg_transactions_defaults();

-- A category's parent must itself be top-level (max two levels).
create or replace function public.tg_categories_two_levels()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.categories where id = new.parent_id and parent_id is not null
  ) then
    raise exception 'categories can only be two levels deep';
  end if;
  return new;
end $$;

create trigger categories_two_levels
  before insert or update on public.categories
  for each row execute function public.tg_categories_two_levels();

-- -----------------------------------------------------------------------------
-- Access helpers (security definer so RLS policies can call them cheaply)
-- -----------------------------------------------------------------------------
create or replace function public.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_write(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role in ('owner', 'member')
  );
$$;

create or replace function public.is_owner(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- -----------------------------------------------------------------------------
-- Default categories, copied into each new household so they can be edited
-- -----------------------------------------------------------------------------
create or replace function public.seed_default_categories(hid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  parent_id uuid;
  r record;
begin
  for r in
    select * from (values
      (1,  'Food',                '🍜', array['Groceries', 'Dining out', 'Food delivery', 'Coffee & snacks']),
      (2,  'Transport',           '🚗', array['Grab / taxi', 'MRT / bus', 'Fuel', 'Parking & ERP', 'Car maintenance']),
      (3,  'Housing',             '🏠', array['Rent / mortgage', 'Conservancy / MCST', 'Repairs', 'Furnishing']),
      (4,  'Utilities & bills',   '💡', array['Electricity & water', 'Mobile', 'Internet', 'Subscriptions']),
      (5,  'Shopping',            '🛍️', array['Clothing', 'Electronics', 'Household items', 'Online marketplaces']),
      (6,  'Health',              '🩺', array['Clinic / GP', 'Dental', 'Pharmacy', 'Fitness']),
      (7,  'Family & kids',       '👨‍👩‍👧', array['School fees', 'Enrichment', 'Childcare', 'Allowance']),
      (8,  'Travel',              '✈️', array['Flights', 'Hotels', 'Overseas spend']),
      (9,  'Entertainment',       '🎬', array['Movies & events', 'Hobbies', 'Streaming']),
      (10, 'Insurance & finance', '🛡️', array['Premiums', 'Bank fees', 'Taxes']),
      (11, 'Gifts & giving',      '🎁', array['Gifts', 'Angbao', 'Donations']),
      (12, 'Other',               '📦', array['Uncategorised'])
    ) as t(sort_order, name, icon, children)
  loop
    insert into public.categories (household_id, name, icon, sort_order)
    values (hid, r.name, r.icon, r.sort_order)
    returning id into parent_id;

    insert into public.categories (household_id, parent_id, name, sort_order)
    select hid, parent_id, child, ord::int
    from unnest(r.children) with ordinality as c(child, ord);
  end loop;
end $$;

revoke all on function public.seed_default_categories(uuid) from public;

-- -----------------------------------------------------------------------------
-- RPCs the app calls for household setup
-- -----------------------------------------------------------------------------
create or replace function public.create_household(household_name text, my_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from public.members where user_id = uid) then
    raise exception 'you already belong to a household';
  end if;

  insert into public.households (name) values (household_name) returning id into hid;
  insert into public.members (household_id, user_id, display_name, role)
  values (hid, uid, my_display_name, 'owner');
  perform public.seed_default_categories(hid);
  return hid;
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
    raise exception 'only a household owner can invite';
  end if;
  insert into public.household_invites (household_id, role, created_by)
  values (hid, invite_role, uid)
  returning token into tok;
  return tok;
end $$;

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
    raise exception 'you already belong to a household';
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

revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.create_invite(text)          from public, anon;
revoke all on function public.accept_invite(text, text)    from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.create_invite(text)          to authenticated;
grant execute on function public.accept_invite(text, text)    to authenticated;

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
alter table public.households        enable row level security;
alter table public.members           enable row level security;
alter table public.household_invites enable row level security;
alter table public.accounts          enable row level security;
alter table public.spend_rules       enable row level security;
alter table public.categories        enable row level security;
alter table public.merchant_rules    enable row level security;
alter table public.receipts          enable row level security;
alter table public.transactions      enable row level security;
alter table public.budgets           enable row level security;
alter table public.ingest_tokens     enable row level security;

-- Households: members read; owners rename. Created only through create_household().
create policy households_select on public.households for select to authenticated using (public.is_member(id));
create policy households_update on public.households for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

-- Members: everyone in the household sees each other; you can edit your own name;
-- owners manage roles and removals. Joining happens only through the RPCs.
create policy members_select on public.members for select to authenticated using (public.is_member(household_id));
create policy members_update_self on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and role = (select m.role from public.members m where m.user_id = auth.uid()));
create policy members_update_owner on public.members for update to authenticated
  using (public.is_owner(household_id)) with check (public.is_owner(household_id));
create policy members_delete_owner on public.members for delete to authenticated
  using (public.is_owner(household_id) and user_id <> auth.uid());

-- Invites: owners see and revoke their household's invites.
create policy invites_select on public.household_invites for select to authenticated using (public.is_owner(household_id));
create policy invites_delete on public.household_invites for delete to authenticated using (public.is_owner(household_id));

-- Shared data tables: members read, owners/members write.
do $$
declare t text;
begin
  foreach t in array array['accounts', 'spend_rules', 'categories', 'merchant_rules', 'receipts', 'transactions', 'budgets']
  loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(household_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.can_write(household_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.can_write(household_id)) with check (public.can_write(household_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.can_write(household_id))', t);
  end loop;
end $$;

-- Ingest tokens: each person manages only their own.
create policy ingest_tokens_select on public.ingest_tokens for select to authenticated using (user_id = auth.uid());
create policy ingest_tokens_insert on public.ingest_tokens for insert to authenticated
  with check (user_id = auth.uid() and public.can_write(household_id));
create policy ingest_tokens_update on public.ingest_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ingest_tokens_delete on public.ingest_tokens for delete to authenticated using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Privileges: nothing for anonymous visitors; RLS decides for signed-in users.
-- -----------------------------------------------------------------------------
-- Supabase no longer exposes new tables to the API automatically, so grants are explicit.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
revoke all on function public.is_member(uuid), public.can_write(uuid), public.is_owner(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.can_write(uuid), public.is_owner(uuid) to authenticated;
