-- =============================================================================
-- Category redesign, income, recoverable spend, ledgers, properties and people
-- Design of record: project doc design/expense-category-design.md (v5)
--
-- * Categories gain a kind (expense / income) and, on top-level rows, a nature:
--     expense: living (生活消费) / financial (财务支出) / pass_through (过手款)
--     income:  real (真实收入) / offset (冲减项)
--   Child categories inherit kind, nature and ledger scope from their parent.
-- * Income and expenses share the transactions table (transactions.kind).
--   Amounts are always positive; a refund is an income row in the 退款 category.
-- * recoverable_amount: the part of an expense someone will pay back (AA, claims,
--   pass-through). Reports use amount - recoverable_amount; min-spend uses amount.
-- * recovery_links: a payback (income) can be linked to the expenses it settles.
-- * Ledgers (账本): every transaction belongs to one. Daily ledger by default;
--   rental-property and trip ledgers can be added. Some categories are scoped to
--   one ledger type (trip-only, property-only).
-- * properties (房产) and people (成员, "spent for") tags.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Properties and people
-- -----------------------------------------------------------------------------
create table public.properties (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 60),
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, name)
);

-- Family members a transaction is "for" (kids included). Not the same as
-- public.members, which are the people who can sign in.
create table public.people (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 40),
  user_id       uuid references auth.users(id) on delete set null,
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, name)
);

-- -----------------------------------------------------------------------------
-- Ledgers (账本)
-- -----------------------------------------------------------------------------
create table public.ledgers (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households(id) on delete cascade,
  name                 text not null check (length(trim(name)) between 1 and 60),
  type                 text not null default 'daily' check (type in ('daily', 'property', 'trip', 'other')),
  counts_in_household  boolean not null,          -- include in household spend reports and budgets
  property_id          uuid,
  start_date           date,
  end_date             date,
  default_currency     char(3) check (default_currency ~ '^[A-Z]{3}$'),
  is_default           boolean not null default false,
  is_archived          boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, name),
  foreign key (property_id, household_id) references public.properties(id, household_id) on delete restrict,
  check (type <> 'property' or property_id is not null),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (not (is_default and is_archived))
);
create unique index ledgers_one_default_idx on public.ledgers (household_id) where is_default;

-- Rental-property ledgers are a separate profit-and-loss by default.
create or replace function public.tg_ledgers_defaults()
returns trigger language plpgsql as $$
begin
  if new.counts_in_household is null then
    new.counts_in_household := new.type <> 'property';
  end if;
  return new;
end $$;

create trigger ledgers_defaults
  before insert on public.ledgers
  for each row execute function public.tg_ledgers_defaults();

-- -----------------------------------------------------------------------------
-- Categories: kind, nature, ledger scope and behaviour flags
-- -----------------------------------------------------------------------------
alter table public.categories
  add column kind               text not null default 'expense' check (kind in ('expense', 'income')),
  add column nature             text check (nature in ('living', 'financial', 'pass_through', 'real', 'offset')),
  add column ledger_type        text check (ledger_type in ('daily', 'property', 'trip', 'other')),
  add column requires_property  boolean not null default false,  -- e.g. 租金
  add column requires_account   boolean not null default false,  -- paybacks must say which account received them
  add column is_recovery        boolean not null default false,  -- paybacks that settle recoverable spend
  add column reduces_min_spend  boolean not null default false;  -- e.g. 退款 back to a card

comment on column public.categories.is_excluded_from_reports is
  'Deprecated: superseded by nature. Not used; drop in a later release.';

-- Existing top-level rows (if any) predate natures: treat them as living expenses.
update public.categories set nature = 'living' where parent_id is null and nature is null;

alter table public.categories
  add constraint categories_nature_on_top_level
    check ((parent_id is null) = (nature is not null)),
  add constraint categories_nature_matches_kind
    check (nature is null
           or (kind = 'expense' and nature in ('living', 'financial', 'pass_through'))
           or (kind = 'income'  and nature in ('real', 'offset'))),
  add constraint categories_ledger_type_on_top_level
    check (parent_id is null or ledger_type is null);

-- Expense and income trees can both have a top-level 其他.
alter table public.categories drop constraint categories_household_id_parent_id_name_key;
alter table public.categories
  add constraint categories_household_kind_parent_name_key
    unique nulls not distinct (household_id, kind, parent_id, name);

-- Two levels at most, and a child shares its parent's kind.
create or replace function public.tg_categories_two_levels()
returns trigger language plpgsql as $$
declare
  p public.categories;
begin
  if new.parent_id is not null then
    select * into p from public.categories where id = new.parent_id;
    if p.parent_id is not null then
      raise exception 'categories can only be two levels deep';
    end if;
    new.kind := p.kind;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Transactions: kind, ledger, property, recoverable amount
-- -----------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_amount_check;
alter table public.transactions
  add constraint transactions_amount_positive check (amount > 0);

alter table public.transactions
  add column kind                   text not null default 'expense' check (kind in ('expense', 'income')),
  add column ledger_id              uuid,
  add column property_id            uuid,
  add column recoverable_amount     numeric(12,2),
  add column recovery_status        text check (recovery_status in ('to_submit', 'submitted', 'received')),
  add column recovery_submitted_at  date,
  add foreign key (ledger_id, household_id)   references public.ledgers(id, household_id)    on delete restrict,
  add foreign key (property_id, household_id) references public.properties(id, household_id) on delete restrict;

comment on column public.transactions.amount is
  'Always positive. kind says whether money went out (expense) or came in (income).';
comment on column public.transactions.recoverable_amount is
  'Part of an expense that will be paid back, in the transaction currency. 0 = none.';

create index transactions_ledger_txn_at_idx on public.transactions (ledger_id, txn_at desc);
create index transactions_recovery_idx on public.transactions (household_id, recovery_status)
  where recovery_status is not null;

-- Default ledgers for any households created before this migration.
insert into public.ledgers (household_id, name, type, counts_in_household, is_default)
select h.id, '日常账本', 'daily', true, true
from public.households h
where not exists (select 1 from public.ledgers l where l.household_id = h.id and l.is_default);

update public.transactions t
set ledger_id = l.id
from public.ledgers l
where l.household_id = t.household_id and l.is_default and t.ledger_id is null;

update public.transactions set recoverable_amount = 0 where recoverable_amount is null;

alter table public.transactions
  alter column ledger_id set not null,
  alter column recoverable_amount set not null,
  add constraint transactions_recoverable_range
    check (recoverable_amount >= 0 and recoverable_amount <= amount),
  add constraint transactions_recoverable_expense_only
    check (kind = 'expense' or recoverable_amount = 0),
  add constraint transactions_recovery_status_when_recoverable
    check ((recoverable_amount > 0) = (recovery_status is not null));

-- transactions(id, household_id) must be unique for the foreign keys below.
alter table public.transactions add constraint transactions_id_household_key unique (id, household_id);

-- People a transaction is for (many per transaction).
create table public.transaction_people (
  household_id    uuid not null references public.households(id) on delete cascade,
  transaction_id  uuid not null,
  person_id       uuid not null,
  primary key (transaction_id, person_id),
  foreign key (transaction_id, household_id) references public.transactions(id, household_id) on delete cascade,
  foreign key (person_id, household_id)      references public.people(id, household_id)      on delete cascade
);

-- Paybacks linked to the expenses they settle.
create table public.recovery_links (
  household_id  uuid not null references public.households(id) on delete cascade,
  income_id     uuid not null,
  expense_id    uuid not null,
  created_at    timestamptz not null default now(),
  primary key (income_id, expense_id),
  foreign key (income_id, household_id)  references public.transactions(id, household_id) on delete cascade,
  foreign key (expense_id, household_id) references public.transactions(id, household_id) on delete cascade
);
create index recovery_links_expense_idx on public.recovery_links (expense_id);

-- Defaults and rules that depend on the category and ledger.
create or replace function public.tg_transactions_defaults()
returns trigger language plpgsql as $$
declare
  cat     public.categories;
  top     public.categories;
  led     public.ledgers;
begin
  new.updated_at := now();
  if new.amount_sgd is null and new.currency = 'SGD' then
    new.amount_sgd := new.amount;
  end if;
  if new.merchant is null then
    new.merchant := new.merchant_raw;
  end if;

  -- Ledger: the household's default ledger unless one is given.
  if new.ledger_id is null then
    select id into new.ledger_id from public.ledgers
    where household_id = new.household_id and is_default;
  end if;
  select * into led from public.ledgers where id = new.ledger_id;
  if led.type = 'property' and new.property_id is null then
    new.property_id := led.property_id;
  end if;

  -- Category: kind follows the category; scope and required fields are checked.
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

  -- Recoverable part: pass-through spend is fully recoverable unless stated.
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

-- A link marks the expense as received; removing the last link puts it back.
create or replace function public.tg_recovery_links_check()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.transactions
                 where id = new.income_id and kind = 'income') then
    raise exception 'a payback link must start from an income';
  end if;
  if not exists (select 1 from public.transactions
                 where id = new.expense_id and kind = 'expense' and recoverable_amount > 0) then
    raise exception 'a payback can only be linked to an expense with a recoverable amount';
  end if;
  update public.transactions set recovery_status = 'received'
  where id = new.expense_id and recovery_status is distinct from 'received';
  return new;
end $$;

create trigger recovery_links_check
  before insert on public.recovery_links
  for each row execute function public.tg_recovery_links_check();

create or replace function public.tg_recovery_links_removed()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.recovery_links where expense_id = old.expense_id) then
    update public.transactions set recovery_status = 'submitted'
    where id = old.expense_id and recovery_status = 'received';
  end if;
  return old;
end $$;

create trigger recovery_links_removed
  after delete on public.recovery_links
  for each row execute function public.tg_recovery_links_removed();

-- -----------------------------------------------------------------------------
-- Budgets: optional ledger; only spend that counts can be budgeted
-- -----------------------------------------------------------------------------
alter table public.budgets add column ledger_id uuid;
alter table public.budgets
  add foreign key (ledger_id, household_id) references public.ledgers(id, household_id) on delete cascade;
alter table public.budgets drop constraint budgets_household_id_category_id_month_key;
alter table public.budgets
  add constraint budgets_household_ledger_category_month_key
    unique nulls not distinct (household_id, ledger_id, category_id, month);

create or replace function public.tg_budgets_check()
returns trigger language plpgsql as $$
declare
  nat text;
  k   text;
begin
  select coalesce(p.nature, c.nature), c.kind into nat, k
  from public.categories c left join public.categories p on p.id = c.parent_id
  where c.id = new.category_id;
  if k <> 'expense' or nat = 'pass_through' then
    raise exception 'budgets are only for living and financial spend';
  end if;
  return new;
end $$;

create trigger budgets_check
  before insert or update on public.budgets
  for each row execute function public.tg_budgets_check();

-- -----------------------------------------------------------------------------
-- Default categories (new households). Names are Chinese, per the design.
-- -----------------------------------------------------------------------------
create or replace function public.seed_default_categories(hid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  parent_id uuid;
  r record;
begin
  for r in
    select * from (values
      -- sort, kind, nature, ledger scope, icon, name, children
      (1,  'expense', 'living',       null,       '🏠', '住房',     array['房贷', '物业管理', '水电燃气', '通讯网络', '家政服务', '维修装修', '房产税', '印花税']),
      (2,  'expense', 'financial',    null,       '🛡️', '保险理财', array['储蓄/寿险', '投资基金', '医疗住院险', '其他保险']),
      (3,  'expense', 'financial',    null,       '🧾', '税费',     array['所得税', '手续费', '税费（历史未拆分）']),
      (4,  'expense', 'living',       null,       '🎒', '子女教育', array['课外班', '学费', '托管校车', '学杂教材', '幼儿教育']),
      (5,  'expense', 'pass_through', null,       '🤝', '代付款',   array['代付款', '出差', '话费', '交通', '餐费', '其他']),
      (6,  'expense', 'living',       null,       '🍜', '餐饮',     array['早餐', '午餐', '晚餐', '零食饮品', '餐饮其他']),
      (7,  'expense', 'living',       null,       '🩺', '医疗健康', array['中医', '牙医', '门诊', '药品', '眼镜', '养生保健', '医疗其他']),
      (8,  'expense', 'living',       null,       '🚗', '用车',     array['车贷', '车险', '路税', '加油', '停车过路', '保养维修']),
      (9,  'expense', 'living',       null,       '🛒', '买菜日用', array['超市', '生鲜', '日用杂货']),
      (10, 'expense', 'living',       null,       '🛍️', '购物',     array['服饰鞋包', '个护美容', '电子数码', '宝宝用品', '购物其他']),
      (11, 'expense', 'living',       null,       '🎬', '休闲娱乐', array['旅游度假', '娱乐活动', '年票', '运动健身']),
      (12, 'expense', 'living',       null,       '🎁', '人情往来', array['孝敬父母', '请客', '礼物', '礼金红包']),
      (13, 'expense', 'living',       null,       '🚇', '出行',     array['公共交通', '打车']),
      (14, 'expense', 'living',       null,       '📦', '其他',     array['生活其他', '漏记款']),
      (15, 'expense', 'living',       'trip',     '✈️', '旅行',     array['机票', '住宿', '签证保险', '门票活动', '伴手礼']),
      (16, 'expense', 'financial',    'property', '🔑', '出租成本', array['中介费', '家具电器', '清洁保养', '租客杂费', '出租其他']),
      (1,  'income',  'real',         null,       '📈', '投资收入', array['投资收益', '股息分红', '利息']),
      (2,  'income',  'real',         null,       '🏘️', '租金收入', array['租金']),
      (3,  'income',  'offset',       null,       '↩️', '回款类',   array['报销到账', '代付款收回', '退款', '手续费免除', '返现']),
      (4,  'income',  'offset',       null,       '📦', '其他',     array['漏记/差额平账'])
    ) as t(sort_order, kind, nature, ledger_type, icon, name, children)
  loop
    insert into public.categories (household_id, kind, nature, ledger_type, name, icon, sort_order)
    values (hid, r.kind, r.nature, r.ledger_type, r.name, r.icon, r.sort_order)
    returning id into parent_id;

    insert into public.categories (household_id, parent_id, kind, name, sort_order)
    select hid, parent_id, r.kind, child, ord::int
    from unnest(r.children) with ordinality as c(child, ord);
  end loop;

  -- Behaviour flags
  update public.categories c set requires_property = true
  from public.categories p
  where c.household_id = hid and c.parent_id = p.id and p.name = '租金收入' and c.name = '租金';

  update public.categories c
  set requires_account = true,
      is_recovery      = c.name in ('报销到账', '代付款收回', '退款', '手续费免除'),
      reduces_min_spend = c.name = '退款'
  from public.categories p
  where c.household_id = hid and c.parent_id = p.id and p.kind = 'income' and p.name = '回款类';
end $$;

revoke all on function public.seed_default_categories(uuid) from public;

-- Every new household gets a default daily ledger, however it is created.
create or replace function public.tg_households_default_ledger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ledgers (household_id, name, type, counts_in_household, is_default)
  values (new.id, '日常账本', 'daily', true, true);
  return new;
end $$;

revoke all on function public.tg_households_default_ledger() from public;

create trigger households_default_ledger
  after insert on public.households
  for each row execute function public.tg_households_default_ledger();

-- -----------------------------------------------------------------------------
-- Report views (security_invoker: each reader only sees their household)
-- -----------------------------------------------------------------------------

-- One row per transaction with the numbers reports need.
--   self_amount_sgd: what the household itself bore (expense) or received (income).
--   Uncategorised expenses count as living; uncategorised income as offset.
create view public.v_transactions_report with (security_invoker = true) as
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
  coalesce(p.nature, c.nature,
           case when t.kind = 'expense' then 'living' else 'offset' end) as nature,
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

-- Monthly totals by ledger and nature.
create view public.v_monthly_summary with (security_invoker = true) as
select household_id, ledger_id, ledger_type, counts_in_household, month, kind, nature,
       sum(self_amount_sgd) as self_amount_sgd,
       sum(amount_sgd)      as gross_amount_sgd,
       count(*)             as txn_count
from public.v_transactions_report
group by household_id, ledger_id, ledger_type, counts_in_household, month, kind, nature;

-- Money waiting to come back (待回款池).
--   to_submit:   recoverable, not yet claimed
--   submitted:   claimed, waiting for the money
--   unlinked_paybacks: paybacks recorded without linking them to expenses
--   outstanding: submitted - unlinked_paybacks
create view public.v_recovery_pool with (security_invoker = true) as
with exp as (
  select household_id,
         sum(recoverable_sgd) filter (where recovery_status = 'to_submit') as to_submit,
         sum(recoverable_sgd) filter (where recovery_status = 'submitted') as submitted
  from public.v_transactions_report
  where kind = 'expense' and recoverable_amount > 0
  group by household_id
), pay as (
  select t.household_id, sum(t.amount_sgd) as unlinked_paybacks
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.is_recovery
  where t.kind = 'income'
    and not exists (select 1 from public.recovery_links rl where rl.income_id = t.id)
  group by t.household_id
)
select coalesce(e.household_id, p.household_id)                 as household_id,
       coalesce(e.to_submit, 0)                                  as to_submit_sgd,
       coalesce(e.submitted, 0)                                  as submitted_sgd,
       coalesce(p.unlinked_paybacks, 0)                          as unlinked_paybacks_sgd,
       coalesce(e.submitted, 0) - coalesce(p.unlinked_paybacks, 0) as outstanding_sgd
from exp e full join pay p on p.household_id = e.household_id;

-- Each payback against the expenses it is linked to (shows short or over payment).
create view public.v_recovery_matches with (security_invoker = true) as
select i.household_id,
       i.id                                      as income_id,
       i.txn_at,
       i.amount_sgd                              as received_sgd,
       coalesce(sum(r.recoverable_sgd), 0)       as linked_recoverable_sgd,
       i.amount_sgd - coalesce(sum(r.recoverable_sgd), 0) as difference_sgd,
       count(rl.expense_id)                      as linked_expenses
from public.transactions i
left join public.recovery_links rl on rl.income_id = i.id
left join public.v_transactions_report r on r.id = rl.expense_id
where i.kind = 'income'
group by i.household_id, i.id, i.txn_at, i.amount_sgd;

-- Card spend lines for min-spend: card spend counts in full; refunds back to
-- the card count against it; rebates and other income do not count.
-- The app sums these over the card's period (calendar month or statement cycle).
create view public.v_min_spend_lines with (security_invoker = true) as
select t.household_id, t.account_id, t.id as transaction_id, t.txn_at,
       case when t.kind = 'expense' then t.amount_sgd else -t.amount_sgd end as amount_sgd,
       t.category_id
from public.transactions t
left join public.categories c on c.id = t.category_id
where t.account_id is not null
  and coalesce(t.counts_to_min_spend, true)
  and (t.kind = 'expense' or c.reduces_min_spend);

-- Profit and loss per property, by month (rental ledgers and property-tagged spend).
create view public.v_property_pnl with (security_invoker = true) as
select household_id, property_id, month,
       coalesce(sum(self_amount_sgd) filter (where kind = 'income' and nature = 'real'), 0) as income_sgd,
       coalesce(sum(self_amount_sgd) filter (where kind = 'expense'), 0)                    as cost_sgd,
       coalesce(sum(self_amount_sgd) filter (where kind = 'income' and nature = 'real'), 0)
     - coalesce(sum(self_amount_sgd) filter (where kind = 'expense'), 0)                    as net_sgd
from public.v_transactions_report
where property_id is not null
group by household_id, property_id, month;

-- -----------------------------------------------------------------------------
-- Row-level security and privileges for the new tables and views
-- -----------------------------------------------------------------------------
alter table public.properties         enable row level security;
alter table public.people             enable row level security;
alter table public.ledgers            enable row level security;
alter table public.transaction_people enable row level security;
alter table public.recovery_links     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['properties', 'people', 'ledgers', 'transaction_people', 'recovery_links']
  loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(household_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.can_write(household_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.can_write(household_id)) with check (public.can_write(household_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.can_write(household_id))', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated, service_role', t);
  end loop;
end $$;

revoke all on public.v_transactions_report, public.v_monthly_summary, public.v_recovery_pool,
              public.v_recovery_matches, public.v_min_spend_lines, public.v_property_pnl from anon;
grant select on public.v_transactions_report, public.v_monthly_summary, public.v_recovery_pool,
               public.v_recovery_matches, public.v_min_spend_lines, public.v_property_pnl
  to authenticated, service_role;
