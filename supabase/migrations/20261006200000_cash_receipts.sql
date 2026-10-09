-- Money can be received in cash.
--
-- Paybacks, refunds and rent used to demand the account that received the money, so cash could not be
-- recorded. An entry with no account now means cash. (A family can still add a Cash account if it wants cash
-- tracked as a balance.) categories.requires_account stays in the table but is no longer enforced.

comment on column public.categories.requires_account is
  'Deprecated: no longer enforced. An entry with no account means cash.';

create or replace function public.tg_transactions_defaults()
returns trigger language plpgsql as $$
declare
  cat     public.categories;
  top     public.categories;
  led     public.ledgers;
  src     public.accounts;
begin
  new.updated_at := now();
  if new.amount_sgd is null and new.currency = 'SGD' then
    new.amount_sgd := new.amount;
  end if;
  if new.merchant is null then
    new.merchant := new.merchant_raw;
  end if;

  if new.ledger_id is null then
    select id into new.ledger_id from public.ledgers
    where household_id = new.household_id and is_default;
  end if;
  select * into led from public.ledgers where id = new.ledger_id;
  if led.type = 'property' and new.property_id is null then
    new.property_id := led.property_id;
  end if;

  -- A transfer has a destination account and no category.
  if new.to_account_id is not null then
    new.kind := 'transfer';
  end if;
  if new.kind = 'transfer' then
    if new.category_id is not null then
      raise exception 'a transfer between your own accounts has no category';
    end if;
    -- Top-ups from a credit card: counts to min-spend only if chosen (default from the card).
    select * into src from public.accounts where id = new.account_id;
    if src.type = 'credit_card' then
      if new.counts_to_min_spend is null then
        new.counts_to_min_spend := src.topups_count_to_min_spend;
      end if;
    else
      new.counts_to_min_spend := false;
    end if;
    new.recoverable_amount := 0;
    new.recovery_status := null;
    return new;
  end if;

  if new.category_id is not null then
    select * into cat from public.categories where id = new.category_id;
    if cat.parent_id is null then
      top := cat;
    else
      select * into top from public.categories where id = cat.parent_id;
    end if;
    new.kind := cat.kind;
    if top.ledger_type is not null and top.ledger_type is distinct from led.type then
      raise exception 'category % can only be used in % ledgers', cat.name, top.ledger_type;
    end if;
    if cat.requires_property and new.property_id is null then
      raise exception 'category % needs a property', cat.name;
    end if;
    -- Fees and interest never count to a card's min-spend.
    if new.kind = 'expense' and not cat.counts_to_min_spend then
      new.counts_to_min_spend := false;
    end if;
  end if;

  if new.recoverable_amount is null then
    if new.kind = 'expense' and top.nature = 'pass_through' then
      new.recoverable_amount := new.amount;
    else
      new.recoverable_amount := 0;
    end if;
  end if;
  if new.recoverable_amount > 0 and new.recovery_status is null then
    new.recovery_status := 'to_submit';
  elsif new.recoverable_amount = 0 then
    new.recovery_status := null;
  end if;
  return new;
end $$;
