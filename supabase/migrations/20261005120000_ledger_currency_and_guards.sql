-- B-01 PR 1: ledgers.
-- * Every ledger has a currency (the ledger currency). Amounts entered in a ledger are in
--   this currency; a foreign amount is extra information only (added with expense entry).
-- * A rental-property ledger and its property tag are created together and stay 1:1.
-- * Guards: type, property and default flag never change; currency is locked once the
--   ledger has records; the default ledger cannot be deleted.
-- Accounts are shared by all ledgers of a family: balances, statements and min-spend never
-- filter by ledger, while reports group by ledger (see the tests).

-- 1. Ledger currency ----------------------------------------------------------------------
update public.ledgers set default_currency = 'SGD' where default_currency is null;
alter table public.ledgers
  alter column default_currency set default 'SGD',
  alter column default_currency set not null;
comment on column public.ledgers.default_currency is
  'Ledger currency: amounts entered in this ledger are in this currency.';

-- 2. One rental ledger per property -------------------------------------------------------
create unique index ledgers_one_per_property_idx on public.ledgers (property_id) where property_id is not null;

-- 3. Guards ---------------------------------------------------------------------------------
create or replace function public.tg_ledgers_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    -- Deleting a whole family cascades here; only block deleting the default ledger on its own.
    if old.is_default and exists (select 1 from public.households h where h.id = old.household_id) then
      raise exception 'the default ledger cannot be deleted';
    end if;
    return old;
  end if;

  if new.type is distinct from old.type then
    raise exception 'a ledger''s type cannot be changed';
  end if;
  if new.property_id is distinct from old.property_id then
    raise exception 'a ledger''s property cannot be changed';
  end if;
  if new.is_default is distinct from old.is_default then
    raise exception 'the default ledger cannot be changed';
  end if;
  if new.default_currency is distinct from old.default_currency
     and exists (select 1 from public.transactions t where t.ledger_id = old.id) then
    raise exception 'the currency cannot change once the ledger has records';
  end if;
  return new;
end $$;
revoke all on function public.tg_ledgers_guard() from public;

create trigger ledgers_guard
  before update or delete on public.ledgers
  for each row execute function public.tg_ledgers_guard();

-- A rental ledger and its property tag share one name.
create or replace function public.tg_ledgers_sync_property()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.properties set name = new.name
  where id = new.property_id and household_id = new.household_id and name is distinct from new.name;
  return null;
end $$;
revoke all on function public.tg_ledgers_sync_property() from public;

create trigger ledgers_sync_property
  after update of name on public.ledgers
  for each row when (new.property_id is not null)
  execute function public.tg_ledgers_sync_property();

-- 4. Create a ledger (and, for a rental ledger, its property tag) in one step -------------
create or replace function public.create_ledger(
  p_name text, p_type text, p_currency text default 'SGD', p_start date default null, p_end date default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  hid uuid;
  pid uuid;
  lid uuid;
  nm  text := trim(p_name);
begin
  select m.household_id into hid from public.members m where m.user_id = auth.uid();
  if hid is null then raise exception 'not a member of a family'; end if;
  if p_type not in ('trip', 'property', 'other') then
    raise exception 'ledger type must be trip, property or other';
  end if;

  if p_type = 'property' then
    select id into pid from public.properties where household_id = hid and name = nm;
    if pid is null then
      insert into public.properties (household_id, name) values (hid, nm) returning id into pid;
    end if;
  end if;

  insert into public.ledgers (household_id, name, type, default_currency, start_date, end_date, property_id)
  values (hid, nm, p_type, upper(coalesce(p_currency, 'SGD')),
          case when p_type = 'trip' then p_start end,
          case when p_type = 'trip' then p_end end,
          pid)
  returning id into lid;
  return lid;
end $$;
revoke all on function public.create_ledger(text, text, text, date, date) from public, anon;
grant execute on function public.create_ledger(text, text, text, date, date) to authenticated;
