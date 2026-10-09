-- =============================================================================
-- Fixes from the requirement traceability check (design/rtm-v0.4.0.md)
--
-- G5  Rent is not household income: 租金收入 becomes a rental-only group, so rent is
--     recorded only in a rental-property ledger (its own P&L, outside household totals).
-- G1  Card statement status: count every payment until the next statement, and show
--     paid late / overdue instead of leaving a late-paid statement "unpaid".
-- G2  Payback pool: only unlinked 报销到账 / 代付款收回 reduce it. A refund or fee
--     waiver reduces it only when linked to the spend it settles.
-- G3  Linking a payback to spend with nothing recoverable (e.g. a fee waiver) makes the
--     spend recoverable up to the payback amount, instead of refusing the link.
-- Card fees: annual fees and late fees / interest are charged to the card but never count
--     to min-spend; a later waiver (手续费免除) linked to the fee cancels it as spend and
--     leaves min-spend unchanged. New 税费 categories 卡年费 and 滞纳金利息.
-- =============================================================================

-- G5: rent only in rental ledgers (existing families and new ones).
update public.categories set ledger_type = 'property'
where kind = 'income' and parent_id is null and name = '租金收入';

-- G2: which paybacks reduce the pool without being linked.
alter table public.categories
  add column counts_against_pool boolean not null default false;
comment on column public.categories.counts_against_pool is
  'Unlinked paybacks in this category reduce the outstanding payback pool (报销到账, 代付款收回).';

update public.categories c set counts_against_pool = true
from public.categories p
where c.parent_id = p.id and p.kind = 'income' and p.name = '回款类'
  and c.name in ('报销到账', '代付款收回');

-- Card fees never count to min-spend.
alter table public.categories
  add column counts_to_min_spend boolean not null default true;
comment on column public.categories.counts_to_min_spend is
  'false = spend in this category never counts to a card''s min-spend (fees, interest).';

-- New 税费 categories for existing families, after 手续费.
update public.categories c set sort_order = c.sort_order + 2
from public.categories p
where c.parent_id = p.id and p.kind = 'expense' and p.name = '税费' and c.name = '税费（历史未拆分）';
insert into public.categories (household_id, parent_id, kind, name, sort_order)
select p.household_id, p.id, 'expense', v.name, v.ord
from public.categories p
cross join (values ('卡年费', 3), ('滞纳金利息', 4)) as v(name, ord)
where p.kind = 'expense' and p.parent_id is null and p.name = '税费'
on conflict do nothing;

update public.categories c set counts_to_min_spend = false
from public.categories p
where c.parent_id = p.id and p.kind = 'expense' and p.name = '税费'
  and c.name in ('手续费', '卡年费', '滞纳金利息');

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
      (3,  'expense', 'financial',    null,       '🧾', '税费',     array['所得税', '手续费', '卡年费', '滞纳金利息', '税费（历史未拆分）']),
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
      (2,  'income',  'real',         'property', '🏘️', '租金收入', array['租金']),
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
      counts_against_pool = c.name in ('报销到账', '代付款收回'),
      reduces_min_spend = c.name = '退款'
  from public.categories p
  where c.household_id = hid and c.parent_id = p.id and p.kind = 'income' and p.name = '回款类';

  update public.categories c set counts_to_min_spend = false
  from public.categories p
  where c.household_id = hid and c.parent_id = p.id and p.kind = 'expense' and p.name = '税费'
    and c.name in ('手续费', '卡年费', '滞纳金利息');
end $$;

revoke all on function public.seed_default_categories(uuid) from public;

create or replace view public.v_recovery_pool with (security_invoker = true) as
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
  join public.categories c on c.id = t.category_id and c.counts_against_pool
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

-- G3: linking a payback to spend with nothing recoverable makes it recoverable.
create or replace function public.tg_recovery_links_check()
returns trigger language plpgsql as $$
declare
  inc public.transactions;
  exp public.transactions;
begin
  select * into inc from public.transactions where id = new.income_id;
  select * into exp from public.transactions where id = new.expense_id;
  if inc.kind is distinct from 'income' then
    raise exception 'a payback link must start from an income';
  end if;
  if exp.kind is distinct from 'expense' then
    raise exception 'a payback can only be linked to spend';
  end if;
  if exp.recoverable_amount = 0 then
    update public.transactions
    set recoverable_amount = least(inc.amount, exp.amount), recovery_status = 'received'
    where id = new.expense_id;
  else
    update public.transactions set recovery_status = 'received'
    where id = new.expense_id and recovery_status is distinct from 'received';
  end if;
  return new;
end $$;

-- Card fees: same rules as before, plus fee categories never count to min-spend.
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


-- G1: card statement status over the whole period until the next statement.
drop view public.v_card_statement_status;
create view public.v_card_statement_status with (security_invoker = true) as
with st as (
  select s.*,
         lead(s.period_end) over (partition by s.account_id order by s.period_end) as next_statement_date
  from public.statements s
  join public.accounts a on a.id = s.account_id and a.type = 'credit_card'
), pay as (
  select st.id as statement_id,
         coalesce(sum(t.amount), 0) as paid,
         coalesce(sum(t.amount) filter (
           where st.due_date is null
              or (t.txn_at at time zone 'Asia/Singapore')::date <= st.due_date), 0) as paid_by_due_date
  from st
  left join public.transactions t
    on t.kind = 'transfer' and t.to_account_id = st.account_id
   and (t.txn_at at time zone 'Asia/Singapore')::date > st.period_end
   and (st.next_statement_date is null
        or (t.txn_at at time zone 'Asia/Singapore')::date <= st.next_statement_date)
  group by st.id
)
select st.household_id, st.id as statement_id, st.account_id, st.period_end as statement_date, st.due_date,
       greatest(-st.closing_balance, 0) as amount_due,
       st.minimum_payment,
       p.paid,
       p.paid_by_due_date,
       case
         when p.paid >= greatest(-st.closing_balance, 0)
           then case when p.paid_by_due_date >= greatest(-st.closing_balance, 0) then 'paid' else 'paid_late' end
         when st.due_date is not null and (now() at time zone 'Asia/Singapore')::date > st.due_date then 'overdue'
         when p.paid > 0 then 'part_paid'
         else 'unpaid'
       end as payment_status
from st join pay p on p.statement_id = st.id;

revoke all on public.v_card_statement_status from anon;
grant select on public.v_card_statement_status to authenticated, service_role;
