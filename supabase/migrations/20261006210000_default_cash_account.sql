-- Every family starts with a Cash account (现金), however the family is created, so cash
-- spending and receipts can be tracked from day one. It is an ordinary account: it can be
-- renamed, archived, or deleted while unused.

create or replace function public.tg_households_default_cash()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.accounts (household_id, name, type)
  values (new.id, '现金', 'cash')
  on conflict do nothing;
  return new;
end $$;

revoke all on function public.tg_households_default_cash() from public;

create trigger households_default_cash
  after insert on public.households
  for each row execute function public.tg_households_default_cash();

-- Existing families that have no Cash account get one (families that already have one,
-- or already use the name 现金, are left alone).
insert into public.accounts (household_id, name, type)
select h.id, '现金', 'cash'
from public.households h
where not exists (select 1 from public.accounts a where a.household_id = h.id and a.type = 'cash')
on conflict do nothing;
