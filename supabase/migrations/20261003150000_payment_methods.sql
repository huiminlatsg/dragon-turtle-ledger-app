-- =============================================================================
-- Payment methods: account types, transfers, statements and reconciliation
-- Design of record: project doc design/expense-category-design.md (v6, section 11)
--
-- * Account types: credit_card, bank, debit_card (spends from its bank), stored_value, cash.
-- * Credit cards: statement day, due date (fixed day or N days after the statement),
--   credit limit, annual fee month, and a default for whether top-ups count to min-spend.
-- * Transfers between own accounts (card bill payment, top-ups, cash withdrawal) are a
--   third transaction kind. They are never spending or income.
-- * A top-up from a credit card carries its own counts_to_min_spend choice, prefilled from
--   the card's default (no).
-- * Statements and statement lines for any account; lines are matched to transactions;
--   a reconciled statement locks its matched transactions.
-- * Views: account balances, statement reconciliation, card statement payment status.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------
alter table public.accounts drop constraint accounts_type_check;
update public.accounts set type = case type
  when 'credit'  then 'credit_card'
  when 'debit'   then 'debit_card'
  when 'ewallet' then 'stored_value'
  when 'paynow'  then 'bank'
  when 'other'   then 'cash'
  else type end;
alter table public.accounts alter column type set default 'credit_card';
alter table public.accounts
  add constraint accounts_type_check
    check (type in ('credit_card', 'bank', 'debit_card', 'stored_value', 'cash'));

alter table public.accounts
  add column currency                   char(3) not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  add column due_day                    smallint check (due_day between 1 and 31),
  add column due_days_after_statement   smallint check (due_days_after_statement between 1 and 60),
  add column credit_limit               numeric(12,2) check (credit_limit > 0),
  add column annual_fee_month           smallint check (annual_fee_month between 1 and 12),
  add column topups_count_to_min_spend  boolean not null default false,
  add column funding_account_id         uuid,
  add column opening_balance            numeric(12,2) not null default 0,
  add column opening_balance_date       date,
  add foreign key (funding_account_id, household_id)
    references public.accounts(id, household_id) on delete restrict,
  add constraint accounts_due_one_way
    check (due_day is null or due_days_after_statement is null),
  add constraint accounts_card_settings_on_cards
    check (type = 'credit_card'
           or (due_day is null and due_days_after_statement is null
               and credit_limit is null and annual_fee_month is null
               and not topups_count_to_min_spend)),
  add constraint accounts_funding_for_debit_cards
    check ((type = 'debit_card') = (funding_account_id is not null));

comment on column public.accounts.opening_balance is
  'Balance on opening_balance_date. Credit cards: negative = amount owed.';

-- A debit card must draw on a bank account.
create or replace function public.tg_accounts_check()
returns trigger language plpgsql as $$
begin
  if new.funding_account_id is not null and not exists (
    select 1 from public.accounts where id = new.funding_account_id and type = 'bank'
  ) then
    raise exception 'a debit card must be linked to a bank account';
  end if;
  return new;
end $$;

create trigger accounts_check
  before insert or update on public.accounts
  for each row execute function public.tg_accounts_check();

-- -----------------------------------------------------------------------------
-- Transfers between own accounts
-- -----------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions
  add constraint transactions_kind_check check (kind in ('expense', 'income', 'transfer')),
  add column to_account_id uuid,
  add foreign key (to_account_id, household_id)
    references public.accounts(id, household_id) on delete restrict,
  add constraint transactions_transfer_shape
    check ((kind = 'transfer') = (to_account_id is not null)),
  add constraint transactions_transfer_accounts
    check (kind <> 'transfer' or (account_id is not null and account_id <> to_account_id)),
  add constraint transactions_transfer_uncategorised
    check (kind <> 'transfer' or category_id is null);

comment on column public.transactions.to_account_id is
  'Transfers only: the account money moved to. account_id is where it came from.';
comment on column public.transactions.counts_to_min_spend is
  'Spend: null = decide from the card''s rules. Transfers: whether a top-up from a credit card counts.';

create index transactions_to_account_txn_at_idx on public.transactions (to_account_id, txn_at desc)
  where to_account_id is not null;

-- Same rules as before, plus transfers.
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
    if cat.requires_account and new.account_id is null then
      raise exception 'category % needs the account that received the money', cat.name;
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

-- -----------------------------------------------------------------------------
-- Statements and reconciliation
-- Signs follow the account holder: negative = money out / card charge,
-- positive = money in / card payment or refund.
-- -----------------------------------------------------------------------------
create table public.statements (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  account_id       uuid not null,
  period_start     date not null,
  period_end       date not null,
  opening_balance  numeric(12,2) not null,
  closing_balance  numeric(12,2) not null,
  due_date         date,                       -- credit cards; filled from the card's settings if blank
  minimum_payment  numeric(12,2) check (minimum_payment >= 0),
  file_path        text,                       -- path in the private storage bucket
  status           text not null default 'open' check (status in ('open', 'reconciled')),
  reconciled_at    timestamptz,
  created_at       timestamptz not null default now(),
  unique (id, household_id),
  unique (id, account_id),
  unique (account_id, period_end),
  foreign key (account_id, household_id) references public.accounts(id, household_id) on delete cascade,
  check (period_end >= period_start),
  check ((status = 'reconciled') = (reconciled_at is not null))
);

create table public.statement_lines (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  statement_id    uuid not null,
  account_id      uuid not null,
  line_date       date not null,
  description     text,
  amount          numeric(12,2) not null check (amount <> 0),
  transaction_id  uuid,
  created_at      timestamptz not null default now(),
  foreign key (statement_id, household_id)   references public.statements(id, household_id)   on delete cascade,
  foreign key (statement_id, account_id)     references public.statements(id, account_id)     on delete cascade,
  foreign key (transaction_id, household_id) references public.transactions(id, household_id) on delete set null (transaction_id)
);
-- A transaction matches at most one line per account (a transfer can match one on each side).
create unique index statement_lines_one_match_idx on public.statement_lines (account_id, transaction_id)
  where transaction_id is not null;
create index statement_lines_statement_idx on public.statement_lines (statement_id);

-- Card statements: default the due date from the card's settings.
create or replace function public.tg_statements_defaults()
returns trigger language plpgsql as $$
declare
  acc public.accounts;
  m   date;
  d   date;
begin
  select * into acc from public.accounts where id = new.account_id;
  if new.due_date is null and acc.type = 'credit_card' then
    if acc.due_days_after_statement is not null then
      new.due_date := new.period_end + acc.due_days_after_statement;
    elsif acc.due_day is not null then
      -- The first due_day after the statement date (clamped to short months).
      m := date_trunc('month', new.period_end)::date;
      d := m + least(acc.due_day, extract(day from (m + interval '1 month - 1 day'))::int) - 1;
      if d <= new.period_end then
        m := (m + interval '1 month')::date;
        d := m + least(acc.due_day, extract(day from (m + interval '1 month - 1 day'))::int) - 1;
      end if;
      new.due_date := d;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status = 'reconciled' and old.status = 'open' then
    if exists (select 1 from public.statement_lines where statement_id = new.id and transaction_id is null) then
      raise exception 'every statement line must be matched before reconciling';
    end if;
    if (select coalesce(sum(amount), 0) from public.statement_lines where statement_id = new.id)
       <> new.closing_balance - new.opening_balance then
      raise exception 'statement lines do not add up to the change in balance';
    end if;
  end if;
  return new;
end $$;

create trigger statements_defaults
  before insert or update on public.statements
  for each row execute function public.tg_statements_defaults();

-- A matched line must belong to a transaction on that account (either side of a transfer),
-- and lines cannot change once the statement is reconciled.
create or replace function public.tg_statement_lines_check()
returns trigger language plpgsql as $$
declare
  st_status text;
begin
  select status into st_status from public.statements
  where id = coalesce(new.statement_id, old.statement_id);
  if st_status = 'reconciled' then
    raise exception 'statement is reconciled; reopen it to change lines';
  end if;
  if tg_op <> 'DELETE' and new.transaction_id is not null and not exists (
    select 1 from public.transactions t
    left join public.accounts a on a.id = t.account_id
    where t.id = new.transaction_id
      and new.account_id in (t.account_id, t.to_account_id, a.funding_account_id)
  ) then
    raise exception 'a statement line can only match a transaction on the same account';
  end if;
  return coalesce(new, old);
end $$;

create trigger statement_lines_check
  before insert or update or delete on public.statement_lines
  for each row execute function public.tg_statement_lines_check();

-- Transactions matched to a reconciled statement are locked.
create or replace function public.tg_transactions_reconciled_lock()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.statement_lines l
    join public.statements s on s.id = l.statement_id
    where l.transaction_id = old.id and s.status = 'reconciled'
  ) and (
    tg_op = 'DELETE'
    or new.amount     is distinct from old.amount
    or new.amount_sgd is distinct from old.amount_sgd
    or new.txn_at     is distinct from old.txn_at
    or new.account_id is distinct from old.account_id
    or new.to_account_id is distinct from old.to_account_id
    or new.kind       is distinct from old.kind
  ) then
    raise exception 'transaction is on a reconciled statement; reopen the statement to change it';
  end if;
  return coalesce(new, old);
end $$;

create trigger transactions_reconciled_lock
  before update or delete on public.transactions
  for each row execute function public.tg_transactions_reconciled_lock();

-- -----------------------------------------------------------------------------
-- Report views
-- -----------------------------------------------------------------------------

-- Transfers show with nature 'transfer' so spend and income totals ignore them.
create or replace view public.v_transactions_report with (security_invoker = true) as
select
  t.id,
  t.household_id,
  t.ledger_id,
  l.type                                           as ledger_type,
  l.counts_in_household,
  t.kind,
  t.txn_at,
  (date_trunc('month', t.txn_at at time zone 'Asia/Singapore'))::date as month,
  t.account_id,
  t.property_id,
  t.merchant,
  t.category_id,
  c.name                                           as category_name,
  coalesce(p.id, c.id)                             as top_category_id,
  coalesce(p.name, c.name)                         as top_category_name,
  case when t.kind = 'transfer' then 'transfer'
       else coalesce(p.nature, c.nature,
                     case when t.kind = 'expense' then 'living' else 'offset' end) end as nature,
  t.amount,
  t.currency,
  t.amount_sgd,
  t.recoverable_amount,
  t.recovery_status,
  round(t.amount_sgd * t.recoverable_amount / t.amount, 2)                as recoverable_sgd,
  t.amount_sgd - round(t.amount_sgd * t.recoverable_amount / t.amount, 2) as self_amount_sgd
from public.transactions t
join public.ledgers l on l.id = t.ledger_id
left join public.categories c on c.id = t.category_id
left join public.categories p on p.id = c.parent_id;

-- Min-spend lines now include top-ups from a card when they were chosen to count.
create or replace view public.v_min_spend_lines with (security_invoker = true) as
select t.household_id, t.account_id, t.id as transaction_id, t.txn_at,
       case when t.kind = 'income' then -t.amount_sgd else t.amount_sgd end as amount_sgd,
       t.category_id
from public.transactions t
left join public.categories c on c.id = t.category_id
where t.account_id is not null
  and (   (t.kind = 'expense'  and coalesce(t.counts_to_min_spend, true))
       or (t.kind = 'income'   and c.reduces_min_spend and coalesce(t.counts_to_min_spend, true))
       or (t.kind = 'transfer' and t.counts_to_min_spend));

-- Each transaction's effect on each account it touches, in that account's currency.
-- Debit-card spend lands on the bank account behind the card.
create view public.v_account_movements with (security_invoker = true) as
with legs as (
  select t.household_id, t.id as transaction_id, t.txn_at, t.account_id,
         case when t.kind = 'income' then 1 else -1 end as sign,
         t.amount, t.currency, t.amount_sgd
  from public.transactions t where t.account_id is not null
  union all
  select t.household_id, t.id, t.txn_at, t.to_account_id, 1, t.amount, t.currency, t.amount_sgd
  from public.transactions t where t.to_account_id is not null
)
select g.household_id, g.transaction_id, g.txn_at,
       coalesce(a.funding_account_id, a.id) as account_id,
       g.account_id                         as via_account_id,
       g.sign * case when g.currency = b.currency then g.amount else g.amount_sgd end as amount
from legs g
join public.accounts a on a.id = g.account_id
join public.accounts b on b.id = coalesce(a.funding_account_id, a.id);

-- Current balance per account (cards: negative = owed). Debit cards roll into their bank.
create view public.v_account_balances with (security_invoker = true) as
select a.household_id, a.id as account_id, a.name, a.type, a.currency,
       a.opening_balance + coalesce(sum(m.amount) filter (
         where a.opening_balance_date is null
            or (m.txn_at at time zone 'Asia/Singapore')::date > a.opening_balance_date), 0) as balance
from public.accounts a
left join public.v_account_movements m on m.account_id = a.id
where a.type <> 'debit_card'
group by a.household_id, a.id, a.name, a.type, a.currency, a.opening_balance;

-- Statement check: do the lines add up, and what is still unmatched?
create view public.v_statement_check with (security_invoker = true) as
select s.household_id, s.id as statement_id, s.account_id, s.period_start, s.period_end, s.status,
       s.closing_balance - s.opening_balance                          as expected_change,
       coalesce(sum(l.amount), 0)                                     as lines_total,
       s.closing_balance - s.opening_balance - coalesce(sum(l.amount), 0) as lines_difference,
       count(l.id) filter (where l.transaction_id is null)            as unmatched_lines,
       (select count(*) from public.v_account_movements m
        where m.account_id = s.account_id
          and (m.txn_at at time zone 'Asia/Singapore')::date between s.period_start and s.period_end
          and not exists (select 1 from public.statement_lines x
                          where x.account_id = s.account_id and x.transaction_id = m.transaction_id)
       )                                                              as unmatched_transactions
from public.statements s
left join public.statement_lines l on l.statement_id = s.id
group by s.household_id, s.id;

-- Card statements: amount due, paid so far (transfers into the card after the statement), status.
create view public.v_card_statement_status with (security_invoker = true) as
select s.household_id, s.id as statement_id, s.account_id, s.period_end as statement_date, s.due_date,
       greatest(-s.closing_balance, 0)                              as amount_due,
       s.minimum_payment,
       coalesce(sum(t.amount), 0)                                   as paid,
       case when coalesce(sum(t.amount), 0) >= greatest(-s.closing_balance, 0) then 'paid'
            when coalesce(sum(t.amount), 0) > 0                      then 'part_paid'
            else 'unpaid' end                                       as payment_status
from public.statements s
join public.accounts a on a.id = s.account_id and a.type = 'credit_card'
left join public.transactions t
  on t.kind = 'transfer' and t.to_account_id = s.account_id
 and (t.txn_at at time zone 'Asia/Singapore')::date > s.period_end
 and (s.due_date is null or (t.txn_at at time zone 'Asia/Singapore')::date <= s.due_date)
group by s.household_id, s.id, s.account_id, s.period_end, s.due_date, s.closing_balance, s.minimum_payment;

-- -----------------------------------------------------------------------------
-- Row-level security and privileges
-- -----------------------------------------------------------------------------
alter table public.statements      enable row level security;
alter table public.statement_lines enable row level security;

do $$
declare t text;
begin
  foreach t in array array['statements', 'statement_lines']
  loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(household_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.can_write(household_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.can_write(household_id)) with check (public.can_write(household_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.can_write(household_id))', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated, service_role', t);
  end loop;
end $$;

revoke all on public.v_account_movements, public.v_account_balances,
              public.v_statement_check, public.v_card_statement_status from anon;
grant select on public.v_account_movements, public.v_account_balances,
               public.v_statement_check, public.v_card_statement_status
  to authenticated, service_role;
