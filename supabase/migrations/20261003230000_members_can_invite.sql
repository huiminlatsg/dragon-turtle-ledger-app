-- Every family member has full access, including inviting others to the family.
-- (Previously only the family's creator could create invite links.)
create or replace function public.create_invite(invite_role text default 'member')
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  tok text;
begin
  select household_id into hid from public.members where user_id = uid and role in ('owner', 'member');
  if hid is null then
    raise exception 'only a family member can invite';
  end if;
  insert into public.household_invites (household_id, role, created_by)
  values (hid, invite_role, uid)
  returning token into tok;
  return tok;
end $$;
