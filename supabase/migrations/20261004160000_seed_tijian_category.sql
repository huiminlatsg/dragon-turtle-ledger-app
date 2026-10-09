-- B-02: add the 体检 (health check-up) category under 医疗健康.
-- Needed before the history import (RTM D5): four historical check-ups are tagged to it
-- (2024-03, 2024-04 and two in 2025-04; all reimbursed in full).
-- 1) Existing families get 体检 right after 中医 (later children shift down one place).
-- 2) New families get it from the seed function below.

do $$
declare
  p record;
begin
  for p in
    select id, household_id from public.categories
    where kind = 'expense' and parent_id is null and name = '医疗健康'
  loop
    if not exists (
      select 1 from public.categories
      where household_id = p.household_id and parent_id = p.id and name = '体检'
    ) then
      update public.categories set sort_order = sort_order + 1
      where household_id = p.household_id and parent_id = p.id and sort_order >= 2;

      insert into public.categories (household_id, parent_id, kind, name, sort_order)
      values (p.household_id, p.id, 'expense', '体检', 2);
    end if;
  end loop;
end $$;

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
      (7,  'expense', 'living',       null,       '🩺', '医疗健康', array['中医', '体检', '牙医', '门诊', '药品', '眼镜', '养生保健', '医疗其他']),
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
