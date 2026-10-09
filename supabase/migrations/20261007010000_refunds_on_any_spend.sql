-- Refunds and fee waivers can be linked to any spend, and can arrive in parts.
--
-- Before: a payback could only settle spend that was claimed (to be paid back). A refund on ordinary
-- spend could be linked, but a second part refund on the same spend was refused, and deleting the
-- refund left the spend looking like an open claim.
-- Now: linking a payback to spend with nothing recoverable makes that part recoverable and received
-- (as before) and remembers it was made by the link (`recoverable_from_link`). Further paybacks can
-- extend it up to the spend amount; when the last link goes, the spend is ordinary spend again.
-- Spend the person marked as recoverable themselves keeps its own rules (a payback settles up to the claim).

alter table public.transactions
  add column recoverable_from_link boolean not null default false;

comment on column public.transactions.recoverable_from_link is
  'The recoverable amount was created by linking a refund or waiver to ordinary spend (not ticked by the person). It follows the links.';

-- Checks, and the default amount.
create or replace function public.tg_recovery_links_check()
returns trigger language plpgsql as $$
declare
  inc          public.transactions;
  exp          public.transactions;
  expense_cap  numeric;
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

  -- A claim the person made settles up to the claim; ordinary spend (or spend made recoverable by a refund) up to its amount.
  expense_cap := case when exp.recoverable_amount > 0 and not exp.recoverable_from_link then exp.recoverable_amount else exp.amount end;
  expense_left := expense_cap
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
  if new.amount > expense_left then
    raise exception 'a payback cannot settle more than the spend still waits for';
  end if;
  return new;
end $$;

-- Received when the links add up; back to Claimed when they no longer do; and refunds on ordinary spend
-- make that part recoverable, grow with further refunds, and disappear with the last link.
create or replace function public.recovery_resync(p_expense uuid)
returns void language plpgsql as $$
declare
  exp public.transactions;
  got numeric;
begin
  select * into exp from public.transactions where id = p_expense;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into got from public.recovery_links where expense_id = p_expense;

  -- Marks the updates below as made by the links, not by a person editing the record.
  perform set_config('app.recovery_sync', '1', true);

  if exp.recoverable_amount = 0 then
    if got > 0 then
      update public.transactions
      set recoverable_amount = least(got, exp.amount), recovery_status = 'received', recoverable_from_link = true
      where id = p_expense;
    end if;
  elsif exp.recoverable_from_link then
    if got = 0 then
      update public.transactions
      set recoverable_amount = 0, recovery_status = null, recoverable_from_link = false
      where id = p_expense;
    elsif least(got, exp.amount) <> exp.recoverable_amount then
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

  perform set_config('app.recovery_sync', '', true);
end $$;

-- Guard on edits (see 20261006220000), plus: a person changing the recoverable amount makes it their own claim.
create or replace function public.tg_transactions_links_guard()
returns trigger language plpgsql as $$
declare
  settles  numeric;
  received numeric;
begin
  if old.kind = 'income' then
    select coalesce(sum(amount), 0) into settles from public.recovery_links where income_id = new.id;
    if settles > 0 then
      if new.kind is distinct from 'income' then
        raise exception 'a payback linked to spend cannot change type; remove its links first';
      end if;
      if new.amount < settles then
        raise exception 'a payback cannot be smaller than the part it already settles';
      end if;
    end if;
  elsif old.kind = 'expense' then
    select coalesce(sum(amount), 0) into received from public.recovery_links where expense_id = new.id;
    if received > 0 then
      if new.kind is distinct from 'expense' then
        raise exception 'spend with paybacks linked cannot change type; remove the links first';
      end if;
      if new.recoverable_amount < received then
        raise exception 'the paid-back amount cannot be less than what has already been received';
      end if;
    end if;
    if new.recoverable_amount is distinct from old.recoverable_amount
       and coalesce(current_setting('app.recovery_sync', true), '') <> '1' then
      new.recoverable_from_link := false;
    end if;
  end if;
  return new;
end $$;
