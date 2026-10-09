-- A payback can settle part of an expense.
--
-- Before: linking a payback marked the whole recoverable amount Received, so a S$20 payback against a
-- S$80 claim showed all S$80 as received.
-- Now: each link carries the amount it settles. An expense is Received only once its links add up to its
-- recoverable amount; until then it keeps its status (To claim / Claimed) and the pool counts what is left.

alter table public.recovery_links add column amount numeric(12,2);

-- Existing links meant "fully settled": give each the expense's recoverable amount.
update public.recovery_links rl
set amount = coalesce(nullif(e.recoverable_amount, 0), e.amount)
from public.transactions e
where e.id = rl.expense_id and e.household_id = rl.household_id;

alter table public.recovery_links
  alter column amount set not null,
  add constraint recovery_links_amount_positive check (amount > 0);

comment on column public.recovery_links.amount is
  'The part of the payback that settles this expense, in the transaction currency. Left empty on insert = as much as the expense still waits for, up to what the payback has left.';

-- Checks, and the default amount.
create or replace function public.tg_recovery_links_check()
returns trigger language plpgsql as $$
declare
  inc          public.transactions;
  exp          public.transactions;
  expense_left numeric;
  income_left  numeric;
begin
  select * into inc from public.transactions where id = new.income_id;
  select * into exp from public.transactions where id = new.expense_id;
  if inc.kind is distinct from 'income' then
    raise exception 'a payback link must start from an income';
  end if;
  if exp.kind is distinct from 'expense' then
    raise exception 'a payback can only be linked to spend';
  end if;

  expense_left := coalesce(nullif(exp.recoverable_amount, 0), exp.amount)
    - coalesce((select sum(amount) from public.recovery_links
                where expense_id = new.expense_id and (income_id, expense_id) is distinct from (new.income_id, new.expense_id)), 0);
  income_left := inc.amount
    - coalesce((select sum(amount) from public.recovery_links
                where income_id = new.income_id and (income_id, expense_id) is distinct from (new.income_id, new.expense_id)), 0);

  if new.amount is null then
    new.amount := least(expense_left, income_left);
    if new.amount <= 0 then
      raise exception 'nothing is left to settle on this payback or this expense';
    end if;
  end if;
  if new.amount > income_left then
    raise exception 'a payback cannot settle more than it received';
  end if;
  return new;
end $$;

-- Received when the links add up; back to Claimed when they no longer do.
create or replace function public.recovery_resync(p_expense uuid)
returns void language plpgsql as $$
declare
  exp public.transactions;
  got numeric;
begin
  select * into exp from public.transactions where id = p_expense;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into got from public.recovery_links where expense_id = p_expense;

  if exp.recoverable_amount = 0 then
    -- Refunds and fee waivers on ordinary spend: the payback makes that part recoverable and settled.
    if got > 0 then
      update public.transactions
      set recoverable_amount = least(got, exp.amount), recovery_status = 'received'
      where id = p_expense;
    end if;
  elsif got >= exp.recoverable_amount then
    update public.transactions set recovery_status = 'received'
    where id = p_expense and recovery_status is distinct from 'received';
  else
    update public.transactions set recovery_status = 'submitted'
    where id = p_expense and recovery_status = 'received';
  end if;
end $$;

create or replace function public.tg_recovery_links_sync()
returns trigger language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recovery_resync(new.expense_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    perform public.recovery_resync(old.expense_id);
  end if;
  return null;
end $$;

drop trigger recovery_links_removed on public.recovery_links;
drop function public.tg_recovery_links_removed();

create trigger recovery_links_sync
  after insert or update or delete on public.recovery_links
  for each row execute function public.tg_recovery_links_sync();

-- A claim is Received in full or part: the pool counts only what is still to come, and the part of a
-- payback not yet linked to any expense.
create or replace view public.v_recovery_pool with (security_invoker = true) as
with got as (
  select expense_id, sum(amount) as amt from public.recovery_links group by expense_id
), used as (
  select income_id, sum(amount) as amt from public.recovery_links group by income_id
), exp as (
  select r.household_id,
         sum(round(r.recoverable_sgd * greatest(r.recoverable_amount - coalesce(g.amt, 0), 0) / r.recoverable_amount, 2))
           filter (where r.recovery_status = 'to_submit') as to_submit,
         sum(round(r.recoverable_sgd * greatest(r.recoverable_amount - coalesce(g.amt, 0), 0) / r.recoverable_amount, 2))
           filter (where r.recovery_status = 'submitted') as submitted
  from public.v_transactions_report r
  left join got g on g.expense_id = r.id
  where r.kind = 'expense' and r.recoverable_amount > 0
  group by r.household_id
), pay as (
  select t.household_id,
         sum(round(t.amount_sgd * greatest(t.amount - coalesce(u.amt, 0), 0) / t.amount, 2)) as unlinked_paybacks
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.counts_against_pool
  left join used u on u.income_id = t.id
  where t.kind = 'income'
  group by t.household_id
)
select coalesce(e.household_id, p.household_id)                 as household_id,
       coalesce(e.to_submit, 0)                                  as to_submit_sgd,
       coalesce(e.submitted, 0)                                  as submitted_sgd,
       coalesce(p.unlinked_paybacks, 0)                          as unlinked_paybacks_sgd,
       coalesce(e.submitted, 0) - coalesce(p.unlinked_paybacks, 0) as outstanding_sgd
from exp e full join pay p on p.household_id = e.household_id;
