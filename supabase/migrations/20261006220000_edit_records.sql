-- Editing records that have paybacks linked to them.
--
-- * A payback cannot be made smaller than what it already settles, and a spend cannot be made
--   to expect less than it has already received. A linked record cannot change type.
-- * When a spend's paid-back amount changes, its status is worked out again from its links
--   (for example Received goes back to Claimed when the claim grows).

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
  end if;
  return new;
end $$;

create trigger transactions_links_guard
  before update on public.transactions
  for each row execute function public.tg_transactions_links_guard();

create or replace function public.tg_transactions_recoverable_changed()
returns trigger language plpgsql as $$
begin
  perform public.recovery_resync(new.id);
  return null;
end $$;

create trigger transactions_recoverable_changed
  after update on public.transactions
  for each row
  when (old.recoverable_amount is distinct from new.recoverable_amount and new.kind = 'expense')
  execute function public.tg_transactions_recoverable_changed();
