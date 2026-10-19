-- =============================================================================
-- Database security and behaviour tests.
-- Runs in one transaction and rolls back, so it leaves no data behind.
-- Usage: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
-- Any failed check raises an exception and exits non-zero.
-- =============================================================================
begin;

-- ---------- helpers ----------------------------------------------------------
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;

create function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL (no error raised): %', label;
exception
  when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok - % (%)', label, sqlerrm;
  when others then
    raise notice 'ok - % (%)', label, sqlerrm;
end $$;

grant execute on function pg_temp.check(boolean, text) to authenticated, anon;
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon;

-- Test users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'dan@test.local'),
  ('00000000-0000-0000-0000-00000000000e', 'erin@test.local');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- ---------- Alice sets up a household ----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into ids select 'hh_alice', public.create_household('Test family', 'Alice')::text;

select pg_temp.check((select count(*) from public.categories where parent_id is null and kind = 'expense') = 16,
  'new household gets 16 expense top-level categories');
select pg_temp.check((select count(*) from public.categories where parent_id is null and kind = 'income') = 4,
  'new household gets 4 income top-level categories');
select pg_temp.check((select count(*) from public.categories where parent_id is not null) = 87,
  'new household gets 87 sub-categories');
select pg_temp.check((select count(*) from public.categories c join public.categories p on p.id = c.parent_id
                      where p.kind = 'expense' and p.name = '医疗健康' and c.name = '体检' and c.sort_order = 2) = 1,
  'new household gets 体检 under 医疗健康, right after 中医');
select pg_temp.check((select string_agg(c.name, ',' order by c.sort_order) from public.categories c
                      join public.categories p on p.id = c.parent_id
                      where p.kind = 'expense' and p.name = '医疗健康')
                      = '中医,体检,牙医,门诊,药品,眼镜,养生保健,医疗其他',
  '医疗健康 children are in the designed order');
select pg_temp.check((select count(*) from public.categories c join public.categories p on p.id = c.parent_id
                      where c.kind <> p.kind) = 0,
  'sub-categories share their parent''s kind');
select pg_temp.check((select string_agg(name, ',' order by name) from public.ledgers) = '日常账本',
  'new household gets a default daily ledger');
select pg_temp.check((select role from public.members where user_id = auth.uid()) = 'owner',
  'creator is owner');
select pg_temp.check(public.is_app_admin(), 'first family''s creator becomes app admin');
select pg_temp.expect_error($$ select public.create_household('Second', 'Alice') $$,
  'cannot create a second household');

insert into public.accounts (household_id, name, issuer, network, last4, statement_day)
values ((select v::uuid from ids where k = 'hh_alice'), 'DBS Woman''s World', 'DBS', 'mastercard', '1234', 25)
returning id::text as v \gset acct_
insert into ids values ('acct_alice', :'acct_v');

select pg_temp.expect_error(format(
  $$ insert into public.accounts (household_id, name, last4) values (%L, 'Bad', '12ab') $$,
  (select v from ids where k = 'hh_alice')), 'last4 must be four digits');

insert into public.transactions (household_id, account_id, spent_by, amount, merchant_raw, category_id)
values (
  (select v::uuid from ids where k = 'hh_alice'),
  (select v::uuid from ids where k = 'acct_alice'),
  auth.uid(), 12.50, 'TOAST BOX',
  (select id from public.categories where name = '零食饮品'));

select pg_temp.check((select amount_sgd from public.transactions limit 1) = 12.50,
  'amount_sgd defaults to amount for SGD');
select pg_temp.check((select merchant from public.transactions limit 1) = 'TOAST BOX',
  'merchant defaults to merchant_raw');
select pg_temp.check((select created_by from public.transactions limit 1) = auth.uid(),
  'created_by defaults to the signed-in user');
select pg_temp.check((select ledger_id from public.transactions limit 1) = (select id from public.ledgers where is_default),
  'transactions go to the default ledger');
select pg_temp.check((select recoverable_amount from public.transactions limit 1) = 0
                 and (select recovery_status from public.transactions limit 1) is null,
  'ordinary spend has nothing recoverable');

select pg_temp.expect_error(format(
  $$ insert into public.categories (household_id, parent_id, name) values (%L, %L, 'Too deep') $$,
  (select v from ids where k = 'hh_alice'),
  (select id from public.categories where name = '超市')), 'categories are at most two levels');

insert into ids select 'invite', public.create_invite('member');
insert into ids select 'invite_viewer', public.create_invite('viewer');
insert into ids select 'family_invite', public.create_family_invite('Carol''s family');
insert into ids select 'family_invite_2', public.create_family_invite('Spare');

select pg_temp.check((select count(*) from public.family_invites) = 2, 'admin sees family invites');
select pg_temp.check((select count(*) from public.admin_overview()) = 1, 'admin overview lists families');
select pg_temp.check((select member_count from public.admin_overview() where family_name = 'Test family') = 1,
  'admin overview counts members');

-- ---------- Bob, not yet a member, sees nothing --------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select pg_temp.check((select count(*) from public.households) = 0,   'outsider sees no households');
select pg_temp.check((select count(*) from public.transactions) = 0, 'outsider sees no transactions');
select pg_temp.check((select count(*) from public.categories) = 0,   'outsider sees no categories');
select pg_temp.check((select count(*) from public.household_invites) = 0, 'outsider sees no invites');
select pg_temp.check((select count(*) from public.ledgers) = 0, 'outsider sees no ledgers');
select pg_temp.check((select count(*) from public.v_transactions_report) = 0, 'outsider sees nothing in report views');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, amount) values (%L, 5) $$,
  (select v from ids where k = 'hh_alice')), 'outsider cannot add a transaction');
select pg_temp.expect_error($$ select public.create_invite('member') $$, 'non-owner cannot create invites');
select pg_temp.expect_error($$ select public.create_family_invite('x') $$, 'non-admin cannot create family invites');
select pg_temp.expect_error($$ select * from public.admin_overview() $$, 'non-admin cannot see the admin overview');
select pg_temp.check((select count(*) from public.family_invites) = 0, 'non-admin sees no family invites');
select pg_temp.check(public.check_family_invite((select v from ids where k = 'family_invite')),
  'a family invite can be checked before joining');

-- ---------- Bob joins with the invite -----------------------------------------
select pg_temp.check(public.accept_invite((select v from ids where k = 'invite'), 'Bob')
  = (select v::uuid from ids where k = 'hh_alice'), 'invite joins the right household');
select pg_temp.check((select count(*) from public.transactions) = 1, 'spouse sees shared transactions');

insert into public.transactions (household_id, amount, merchant_raw, category_id)
values ((select v::uuid from ids where k = 'hh_alice'), 40, 'NTUC FAIRPRICE',
        (select id from public.categories where name = '超市'));
select pg_temp.check((select count(*) from public.transactions) = 2, 'spouse can add transactions');
select pg_temp.check(length(public.create_invite('member')) > 20, 'any family member can create an invite link');

select pg_temp.expect_error($$ update public.members set role = 'owner' where user_id = auth.uid() $$,
  'member cannot promote themselves to owner');

update public.members set display_name = 'Bobby' where user_id = auth.uid();
select pg_temp.check((select display_name from public.members where user_id = auth.uid()) = 'Bobby',
  'member can rename themselves');

-- ---------- Carol: a different household is fully isolated -------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select pg_temp.expect_error(format($$ select public.accept_invite(%L, 'Carol') $$,
  (select v from ids where k = 'invite')), 'used invite cannot be reused');

select pg_temp.expect_error($$ select public.create_household('Carol home', 'Carol') $$,
  'a new family needs an invite once an admin exists');
select pg_temp.expect_error($$ select public.create_household('Carol home', 'Carol', 'not-a-real-token') $$,
  'a fake family invite is rejected');
insert into ids select 'hh_carol',
  public.create_household('Carol home', 'Carol', (select v from ids where k = 'family_invite'))::text;
select pg_temp.check(not public.is_app_admin(), 'invited family owner is not an app admin');
select pg_temp.check((select count(*) from public.categories where parent_id is null) = 20,
  'invited family gets its own default categories');
select pg_temp.check((select count(*) from public.ledgers where is_default) = 1,
  'invited family gets its own default ledger');
select pg_temp.check((select count(*) from public.transactions) = 0, 'other household sees none of our transactions');
select pg_temp.check((select count(*) from public.accounts) = 1 and (select type from public.accounts) = 'cash',
  'a new family starts with one Cash account and sees none of our cards');
select pg_temp.check((select name from public.accounts) = '现金', 'the starting Cash account is named 现金');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, account_id, amount, category_id) values (%L, %L, 1, %L) $$,
  (select v from ids where k = 'hh_carol'), (select v from ids where k = 'acct_alice'),
  (select id from public.categories where name = '超市')),
  'cannot attach another household''s card to a transaction');

-- ---------- Erin cannot reuse Carol's family invite ---------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
select pg_temp.expect_error(format($$ select public.create_household('Erin', 'Erin', %L) $$,
  (select v from ids where k = 'family_invite')), 'a used family invite cannot be reused');

-- ---------- Admin sees counts, never another family's expenses ---------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select pg_temp.check((select count(*) from public.admin_overview()) = 2, 'admin overview shows both families');
select pg_temp.check((select used_at is not null from public.family_invites where note = 'Carol''s family'),
  'admin sees the family invite was used');
select pg_temp.check((select count(*) from public.households) = 1, 'admin cannot read other families');
select pg_temp.check((select count(*) from public.categories where household_id <> (select v::uuid from ids where k = 'hh_alice')) = 0,
  'admin cannot read other families'' categories');

-- ---------- Dan joins as viewer: read-only ------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select public.accept_invite((select v from ids where k = 'invite_viewer'), 'Dan');
select pg_temp.check((select count(*) from public.transactions) = 2, 'viewer can read');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, amount) values (%L, 1) $$,
  (select v from ids where k = 'hh_alice')), 'viewer cannot add transactions');
delete from public.transactions;
select pg_temp.check((select count(*) from public.transactions) = 2, 'viewer cannot delete transactions');
select pg_temp.expect_error(format(
  $$ insert into public.ledgers (household_id, name, type) values (%L, 'Trip', 'trip') $$,
  (select v from ids where k = 'hh_alice')), 'viewer cannot add ledgers');

-- ---------- Alice: income, recoverable spend, paybacks, ledgers --------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
create function pg_temp.cat(top_name text, child text) returns uuid language sql as $$
  select c.id from public.categories c join public.categories p on p.id = c.parent_id
  where p.name = top_name and c.name = child;
$$;
grant execute on function pg_temp.cat(text, text) to authenticated;

-- AA dinner: paid 300 on the card, friends will pay back 240.
insert into public.transactions (household_id, account_id, amount, category_id, recoverable_amount, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), (select v::uuid from ids where k = 'acct_alice'),
        300, pg_temp.cat('餐饮', '晚餐'), 240, 'AA DINNER')
returning id::text as v \gset aa_
insert into ids values ('aa', :'aa_v');
select pg_temp.check((select recovery_status from public.transactions where merchant = 'AA DINNER') = 'to_submit',
  'recoverable spend starts as to_submit');
select pg_temp.check((select self_amount_sgd from public.v_transactions_report where merchant = 'AA DINNER') = 60,
  'report counts only the self-paid part');

-- Pass-through spend is fully recoverable by default.
insert into public.transactions (household_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), 80, pg_temp.cat('代付款', '出差'), 'TRIP TAXI');
select pg_temp.check((select recoverable_amount from public.transactions where merchant = 'TRIP TAXI') = 80,
  'pass-through spend defaults to fully recoverable');
select pg_temp.check((select nature from public.v_transactions_report where merchant = 'TRIP TAXI') = 'pass_through',
  'report shows the parent category''s nature');

select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, amount, category_id, recoverable_amount) values (%L, 10, %L, 11) $$,
  (select v from ids where k = 'hh_alice'), pg_temp.cat('餐饮', '午餐')),
  'recoverable amount cannot exceed the amount');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, amount, category_id) values (%L, -5, %L) $$,
  (select v from ids where k = 'hh_alice'), pg_temp.cat('餐饮', '午餐')),
  'amounts must be positive');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, amount, category_id, recoverable_amount, account_id) values (%L, 10, %L, 5, %L) $$,
  (select v from ids where k = 'hh_alice'), pg_temp.cat('投资收入', '利息'), (select v from ids where k = 'acct_alice')),
  'income cannot have a recoverable amount');
-- Money can be received in cash: a payback with no account is accepted.
insert into public.transactions (household_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), 10, pg_temp.cat('回款类', '退款'), 'CASH REFUND');
select pg_temp.check((select account_id is null and kind = 'income' from public.transactions where merchant = 'CASH REFUND'),
  'a payback with no account is recorded as cash');

update public.transactions set recovery_status = 'submitted' where merchant in ('AA DINNER', 'TRIP TAXI');
select pg_temp.check((select submitted_sgd from public.v_recovery_pool) = 320,
  'pool holds only the recoverable parts');

-- Friends pay back 240 by bank transfer, linked to the dinner.
insert into public.accounts (household_id, name, type)
values ((select v::uuid from ids where k = 'hh_alice'), 'DBS savings', 'bank')
returning id::text as v \gset bank_
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'bank_v', 240, pg_temp.cat('回款类', '代付款收回'), 'FRIENDS')
returning id::text as v \gset back_
select pg_temp.check((select kind from public.transactions where merchant = 'FRIENDS') = 'income',
  'kind follows the category');
insert into public.recovery_links (household_id, income_id, expense_id)
values ((select v::uuid from ids where k = 'hh_alice'), :'back_v', (select v::uuid from ids where k = 'aa'));
select pg_temp.check((select recovery_status from public.transactions where merchant = 'AA DINNER') = 'received',
  'linking a payback marks the expense received');
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = 80,
  'pool drops by the linked amount and keeps no tail');
select pg_temp.check((select difference_sgd from public.v_recovery_matches where income_id = :'back_v') = 0,
  'payback matches the linked recoverable amount');
delete from public.recovery_links where income_id = :'back_v';
select pg_temp.check((select recovery_status from public.transactions where merchant = 'AA DINNER') = 'submitted',
  'removing the link puts the expense back to submitted');
-- A fee waiver linked to a fee makes the fee recoverable and settled.
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'bank_v', 20, pg_temp.cat('税费', '手续费'), 'BANK FEE')
returning id::text as v \gset fee_
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'bank_v', 20, pg_temp.cat('回款类', '手续费免除'), 'FEE WAIVED')
returning id::text as v \gset waive_
insert into public.recovery_links (household_id, income_id, expense_id)
values ((select v::uuid from ids where k = 'hh_alice'), :'waive_v', :'fee_v');
select pg_temp.check((select recoverable_amount = 20 and recovery_status = 'received'
                      from public.transactions where id = :'fee_v'),
  'linking a waiver to a fee makes the fee recoverable and received');
select pg_temp.check((select self_amount_sgd from public.v_transactions_report where id = :'fee_v') = 0,
  'a waived fee is no longer counted as spend');

-- Min-spend: card spend in full, refunds to the card count against it, rebates do not.
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw) values
  ((select v::uuid from ids where k = 'hh_alice'), (select v::uuid from ids where k = 'acct_alice'), 20, pg_temp.cat('回款类', '退款'), 'REFUND'),
  ((select v::uuid from ids where k = 'hh_alice'), (select v::uuid from ids where k = 'acct_alice'), 15, pg_temp.cat('回款类', '返现'), 'REBATE');
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = 80,
  'unlinked refunds and fee waivers do not reduce the payback pool');
select pg_temp.check((select sum(amount_sgd) from public.v_min_spend_lines
                      where account_id = (select v::uuid from ids where k = 'acct_alice')) = 12.50 + 300 - 20,
  'min-spend counts card spend in full, minus refunds, ignoring rebates');

-- Ledgers: trip-only categories, rental property ledgers.
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, amount, category_id) values (%L, 500, %L) $$,
  (select v from ids where k = 'hh_alice'), pg_temp.cat('旅行', '机票')),
  'trip-only categories cannot be used in the daily ledger');
insert into public.ledgers (household_id, name, type, start_date, end_date, default_currency)
values ((select v::uuid from ids where k = 'hh_alice'), '2027 日本游', 'trip', '2027-03-01', '2027-03-10', 'JPY')
returning id::text as v \gset trip_
insert into public.transactions (household_id, ledger_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'trip_v', 500, pg_temp.cat('旅行', '机票'), 'SQ');
select pg_temp.check((select counts_in_household from public.ledgers where type = 'trip'),
  'trip ledgers count in the household by default');

select pg_temp.expect_error(format(
  $$ insert into public.ledgers (household_id, name, type) values (%L, 'Rental', 'property') $$,
  (select v from ids where k = 'hh_alice')), 'property ledgers need a property');
insert into public.properties (household_id, name)
values ((select v::uuid from ids where k = 'hh_alice'), 'Test unit')
returning id::text as v \gset prop_
insert into public.ledgers (household_id, name, type, property_id)
values ((select v::uuid from ids where k = 'hh_alice'), 'Test 出租', 'property', :'prop_v')
returning id::text as v \gset rent_
select pg_temp.check(not (select counts_in_household from public.ledgers where type = 'property'),
  'rental ledgers are a separate P&L by default');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, account_id, amount, category_id) values (%L, %L, 3000, %L) $$,
  (select v from ids where k = 'hh_alice'), :'bank_v', pg_temp.cat('租金收入', '租金')),
  'rent can only be recorded in a rental ledger (not household income)');
insert into public.transactions (household_id, ledger_id, account_id, amount, category_id, txn_at) values
  ((select v::uuid from ids where k = 'hh_alice'), :'rent_v', :'bank_v', 3000, pg_temp.cat('租金收入', '租金'), '2026-11-05'),
  ((select v::uuid from ids where k = 'hh_alice'), :'rent_v', :'bank_v', 400, pg_temp.cat('住房', '维修装修'), '2026-11-08');
select pg_temp.check((select net_sgd from public.v_property_pnl where month = '2026-11-01') = 2600,
  'property P&L nets rent against costs, tagged from the ledger');

-- People tags and budgets.
insert into public.people (household_id, name) values ((select v::uuid from ids where k = 'hh_alice'), 'Kid')
returning id::text as v \gset kid_
insert into public.transaction_people (household_id, transaction_id, person_id)
values ((select v::uuid from ids where k = 'hh_alice'), (select v::uuid from ids where k = 'aa'), :'kid_v');
select pg_temp.check((select count(*) from public.transaction_people) = 1, 'transactions can be tagged with people');
insert into public.budgets (household_id, category_id, month, amount)
values ((select v::uuid from ids where k = 'hh_alice'), (select id from public.categories where name = '餐饮' and parent_id is null), '2026-11-01', 2000);
select pg_temp.expect_error(format(
  $$ insert into public.budgets (household_id, category_id, month, amount) values (%L, %L, '2026-11-01', 100) $$,
  (select v from ids where k = 'hh_alice'), (select id from public.categories where name = '代付款' and parent_id is null)),
  'pass-through spend cannot be budgeted');

-- Payment methods: cards, bank, debit card, stored value, transfers, statements.
insert into public.accounts (household_id, name, type, opening_balance, opening_balance_date)
values ((select v::uuid from ids where k = 'hh_alice'), 'OCBC 360', 'bank', 1000, '2026-10-31')
returning id::text as v \gset ocbc_
insert into public.accounts (household_id, name, type, issuer, statement_day, due_day, opening_balance_date)
values ((select v::uuid from ids where k = 'hh_alice'), 'Citi Rewards', 'credit_card', 'Citi', 30, 5, '2026-10-31')
returning id::text as v \gset citi_
insert into public.accounts (household_id, name, type, opening_balance_date)
values ((select v::uuid from ids where k = 'hh_alice'), 'GrabPay', 'stored_value', '2026-10-31')
returning id::text as v \gset grab_
insert into public.accounts (household_id, name, type, funding_account_id)
values ((select v::uuid from ids where k = 'hh_alice'), 'OCBC debit', 'debit_card', :'ocbc_v')
returning id::text as v \gset odebit_

-- Nicknames: optional, 1 to 40 characters, never blank.
update public.accounts set nickname = 'CitiCashback' where id = :'citi_v';
select pg_temp.check((select nickname from public.accounts where id = :'citi_v') = 'CitiCashback', 'an account can carry a nickname');
select pg_temp.check((select nickname from public.accounts where id = :'ocbc_v') is null, 'a nickname is optional');
select pg_temp.expect_error(format($$ update public.accounts set nickname = '   ' where id = %L $$, :'citi_v'), 'a nickname cannot be blank');
select pg_temp.expect_error(format($$ update public.accounts set nickname = %L where id = %L $$, repeat('x', 41), :'citi_v'), 'a nickname is at most 40 characters');

select pg_temp.expect_error(format(
  $$ insert into public.accounts (household_id, name, type, funding_account_id) values (%L, 'Bad debit', 'debit_card', %L) $$,
  (select v from ids where k = 'hh_alice'), :'citi_v'), 'a debit card must draw on a bank account');
select pg_temp.expect_error(format(
  $$ insert into public.accounts (household_id, name, type, due_day) values (%L, 'Bad bank', 'bank', 5) $$,
  (select v from ids where k = 'hh_alice')), 'due dates are only for credit cards');

insert into public.transactions (household_id, account_id, amount, category_id, txn_at, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 100, pg_temp.cat('餐饮', '午餐'), '2026-11-03 12:00+08', 'CITI LUNCH')
returning id::text as v \gset t1_
insert into public.transactions (household_id, account_id, to_account_id, amount, txn_at)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', :'grab_v', 50, '2026-11-04 12:00+08')
returning id::text as v \gset t2_
insert into public.transactions (household_id, account_id, to_account_id, amount, txn_at, counts_to_min_spend)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', :'grab_v', 30, '2026-11-05 12:00+08', true)
returning id::text as v \gset t3_
insert into public.transactions (household_id, account_id, amount, category_id, txn_at, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'grab_v', 20, pg_temp.cat('出行', '打车'), '2026-11-06 12:00+08', 'GRAB RIDE')
returning id::text as v \gset t4_
insert into public.transactions (household_id, account_id, amount, category_id, txn_at)
values ((select v::uuid from ids where k = 'hh_alice'), :'odebit_v', 40, pg_temp.cat('买菜日用', '超市'), '2026-11-07 12:00+08');

select pg_temp.check((select kind from public.transactions where id = :'t2_v') = 'transfer',
  'a transaction with a destination account is a transfer');
select pg_temp.check(not (select counts_to_min_spend from public.transactions where id = :'t2_v'),
  'card top-ups do not count to min-spend by default');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, account_id, to_account_id, amount, category_id) values (%L, %L, %L, 10, %L) $$,
  (select v from ids where k = 'hh_alice'), :'ocbc_v', :'grab_v', pg_temp.cat('出行', '打车')),
  'transfers have no category');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, account_id, to_account_id, amount) values (%L, %L, %L, 10) $$,
  (select v from ids where k = 'hh_alice'), :'ocbc_v', :'ocbc_v'),
  'cannot transfer to the same account');
select pg_temp.check((select sum(amount_sgd) from public.v_min_spend_lines where account_id = :'citi_v') = 130,
  'min-spend counts card spend and only the top-up chosen to count');
select pg_temp.check((select balance from public.v_account_balances where account_id = :'citi_v') = -180,
  'card balance is what is owed, including top-ups');
select pg_temp.check((select balance from public.v_account_balances where account_id = :'grab_v') = 60,
  'stored value = top-ups minus spend');
select pg_temp.check((select balance from public.v_account_balances where account_id = :'ocbc_v') = 960,
  'debit card spend comes out of its bank account');
select pg_temp.check((select count(*) from public.v_transactions_report
                      where nature = 'transfer' and account_id = :'citi_v') = 2,
  'reports mark transfers separately from spend');

-- Card statement: due date from the card, reconcile, lock, pay.
insert into public.statements (household_id, account_id, period_start, period_end, opening_balance, closing_balance)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', '2026-11-01', '2026-11-30', 0, -180)
returning id::text as v \gset st_
select pg_temp.check((select due_date from public.statements where id = :'st_v') = '2026-12-05',
  'statement due date comes from the card''s due day');
insert into public.statement_lines (household_id, statement_id, account_id, line_date, description, amount, transaction_id) values
  ((select v::uuid from ids where k = 'hh_alice'), :'st_v', :'citi_v', '2026-11-03', 'LUNCH',   -100, :'t1_v'),
  ((select v::uuid from ids where k = 'hh_alice'), :'st_v', :'citi_v', '2026-11-04', 'GRABPAY', -50,  :'t2_v'),
  ((select v::uuid from ids where k = 'hh_alice'), :'st_v', :'citi_v', '2026-11-05', 'GRABPAY', -30,  null);
select pg_temp.check((select unmatched_lines = 1 and unmatched_transactions = 1 and lines_difference = 0
                      from public.v_statement_check where statement_id = :'st_v'),
  'statement check shows what is still unmatched');
select pg_temp.expect_error(format($$ update public.statements set status = 'reconciled', reconciled_at = now() where id = %L $$, :'st_v'),
  'cannot reconcile with unmatched lines');
select pg_temp.expect_error(format(
  $$ update public.statement_lines set transaction_id = %L where statement_id = %L and transaction_id is null $$, :'t4_v', :'st_v'),
  'a line cannot match a transaction on another account');
update public.statement_lines set transaction_id = :'t3_v' where statement_id = :'st_v' and transaction_id is null;
update public.statements set status = 'reconciled', reconciled_at = now() where id = :'st_v';
select pg_temp.check((select status from public.statements where id = :'st_v') = 'reconciled', 'statement reconciles once everything matches');
select pg_temp.expect_error(format($$ update public.transactions set amount = 99 where id = %L $$, :'t1_v'),
  'reconciled transactions are locked');
select pg_temp.check((select payment_status from public.v_card_statement_status where statement_id = :'st_v') = 'unpaid',
  'card statement starts unpaid');
insert into public.transactions (household_id, account_id, to_account_id, amount, txn_at)
values ((select v::uuid from ids where k = 'hh_alice'), :'ocbc_v', :'citi_v', 180, '2026-12-02 09:00+08');
select pg_temp.check((select payment_status from public.v_card_statement_status where statement_id = :'st_v') = 'paid',
  'a bill payment transfer marks the statement paid');
select pg_temp.check((select balance from public.v_account_balances where account_id = :'citi_v') = 0
                 and (select balance from public.v_account_balances where account_id = :'ocbc_v') = 780,
  'bill payment moves money from bank to card, not counted as spend');
insert into public.statements (household_id, account_id, period_start, period_end, opening_balance, closing_balance)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', '2026-12-01', '2026-12-31', 0, -50)
returning id::text as v \gset st2_
insert into public.transactions (household_id, account_id, to_account_id, amount, txn_at)
values ((select v::uuid from ids where k = 'hh_alice'), :'ocbc_v', :'citi_v', 50, '2027-01-10 09:00+08');
select pg_temp.check((select payment_status from public.v_card_statement_status where statement_id = :'st2_v') = 'paid_late',
  'a payment after the due date shows as paid late, not unpaid');
select pg_temp.check((select payment_status from public.v_card_statement_status where statement_id = :'st_v') = 'paid',
  'later payments do not change an earlier statement');

-- Card annual fee: charged on the card, never counts to min-spend, later waived.
insert into public.transactions (household_id, account_id, amount, category_id, txn_at, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 196.20, pg_temp.cat('税费', '卡年费'), '2027-01-15 09:00+08', 'ANNUAL FEE')
returning id::text as v \gset afee_
select pg_temp.check(not (select counts_to_min_spend from public.transactions where id = :'afee_v'),
  'card fees never count to min-spend');
select pg_temp.check((select sum(amount_sgd) from public.v_min_spend_lines where account_id = :'citi_v') = 130,
  'min-spend unchanged by the annual fee');
insert into public.transactions (household_id, account_id, amount, category_id, txn_at, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 196.20, pg_temp.cat('回款类', '手续费免除'), '2027-01-20 09:00+08', 'FEE WAIVER')
returning id::text as v \gset awaive_
insert into public.recovery_links (household_id, income_id, expense_id)
values ((select v::uuid from ids where k = 'hh_alice'), :'awaive_v', :'afee_v');
select pg_temp.check((select self_amount_sgd from public.v_transactions_report where id = :'afee_v') = 0,
  'a waived annual fee is no longer counted as spend');
select pg_temp.check((select sum(amount_sgd) from public.v_min_spend_lines where account_id = :'citi_v') = 130,
  'the waiver does not change min-spend either');
select pg_temp.check((select balance from public.v_account_balances where account_id = :'citi_v') = 50,
  'fee and waiver cancel out on the card balance');
insert into public.transactions (household_id, account_id, amount, category_id, txn_at)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 40, pg_temp.cat('税费', '滞纳金利息'), '2027-01-16 09:00+08')
returning id::text as v \gset late_
select pg_temp.check(not (select counts_to_min_spend from public.transactions where id = :'late_v'),
  'late fees and interest never count to min-spend');

-- Every expense and income has a category; transfers have none (G4).
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, amount, merchant_raw) values (%L, 10, 'NO CATEGORY') $$,
  (select v from ids where k = 'hh_alice')), 'spend needs a category');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, account_id, kind, amount) values (%L, %L, 'income', 10) $$,
  (select v from ids where k = 'hh_alice'), :'bank_v'), 'income needs a category');
select pg_temp.expect_error(format(
  $$ update public.transactions set category_id = null where id = %L $$, :'late_v'),
  'a category cannot be removed from a record');

-- Rental-only categories (出租成本).
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, amount, category_id) values (%L, 100, %L) $$,
  (select v from ids where k = 'hh_alice'), pg_temp.cat('出租成本', '中介费')),
  'rental-only categories cannot be used in the daily ledger');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, ledger_id, amount, category_id) values (%L, %L, 100, %L) $$,
  (select v from ids where k = 'hh_alice'), :'trip_v', pg_temp.cat('出租成本', '中介费')),
  'rental-only categories cannot be used in a trip ledger');
insert into public.transactions (household_id, ledger_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'rent_v', 100, pg_temp.cat('出租成本', '中介费'), 'AGENT FEE');
select pg_temp.check((select nature = 'financial' and property_id = :'prop_v'::uuid
                      from public.v_transactions_report where merchant = 'AGENT FEE'),
  'rental costs are financial spend tagged with the property');

-- 税费（历史未拆分） exists for imported history, as financial spend.
select pg_temp.check((select p.name = '税费' and p.nature = 'financial'
                      from public.categories c join public.categories p on p.id = c.parent_id
                      where c.name = '税费（历史未拆分）'),
  'unsplit historical tax sits under 税费 as financial spend');

-- Household real income is investment income only: paybacks are offsets, rent stays in its rental ledger.
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'bank_v', 50, pg_temp.cat('投资收入', '利息'), 'INTEREST');
select pg_temp.check((select sum(self_amount_sgd) from public.v_monthly_summary
                      where kind = 'income' and nature = 'real' and counts_in_household) = 50,
  'household real income excludes paybacks and rent');
select pg_temp.check((select sum(self_amount_sgd) from public.v_monthly_summary
                      where kind = 'income' and nature = 'offset') > 0,
  'paybacks are reported separately as offsets');

-- Reports by one ledger, daily only, or all counted ledgers.
select pg_temp.check((select sum(gross_amount_sgd) from public.v_monthly_summary
                      where ledger_id = :'trip_v' and kind = 'expense') = 500,
  'report for one ledger shows only that ledger');
select pg_temp.check((select sum(self_amount_sgd) from public.v_monthly_summary
                      where counts_in_household and kind = 'expense')
                   = (select sum(self_amount_sgd) from public.v_monthly_summary
                      where ledger_type in ('daily', 'trip') and kind = 'expense'),
  'household totals cover daily and trip ledgers');
select pg_temp.check((select count(*) from public.v_monthly_summary
                      where ledger_type = 'property' and counts_in_household) = 0
                 and (select count(*) from public.v_monthly_summary where ledger_type = 'property') > 0,
  'household totals leave out the rental ledger');
select pg_temp.check((select sum(self_amount_sgd) from public.v_monthly_summary
                      where counts_in_household and kind = 'expense')
                   - (select sum(self_amount_sgd) from public.v_monthly_summary
                      where ledger_type = 'daily' and kind = 'expense') = 500,
  'daily-only report leaves out the trip ledger');

-- Min-spend counts a card's spend in every ledger.
insert into public.transactions (household_id, ledger_id, account_id, amount, category_id, txn_at, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'trip_v', :'citi_v', 70, pg_temp.cat('餐饮', '晚餐'), '2027-01-21 19:00+08', 'TRIP DINNER');
select pg_temp.check((select sum(amount_sgd) from public.v_min_spend_lines where account_id = :'citi_v') = 200,
  'min-spend counts card spend in trip ledgers too');

-- Ledgers can be archived; their records stay in reports. The default ledger cannot be archived.
update public.ledgers set is_archived = true where id = :'trip_v';
select pg_temp.check((select is_archived from public.ledgers where id = :'trip_v'), 'a trip ledger can be archived');
select pg_temp.check((select count(*) from public.v_transactions_report where ledger_id = :'trip_v') = 2,
  'an archived ledger keeps its records in reports');
select pg_temp.expect_error($$ update public.ledgers set is_archived = true where is_default $$,
  'the default ledger cannot be archived');

-- B-01 PR 1: creating ledgers, guards, and accounts shared across ledgers.
select pg_temp.check((select default_currency from public.ledgers where is_default) = 'SGD',
  'the default ledger is in SGD');
insert into ids select 'my_trip', public.create_ledger('2028 马来西亚', 'trip', 'MYR', '2028-02-10', '2028-02-14')::text;
select pg_temp.check((select default_currency = 'MYR' and start_date = '2028-02-10' and end_date = '2028-02-14' and counts_in_household
                      from public.ledgers where id = (select v::uuid from ids where k = 'my_trip')),
  'a trip ledger keeps its currency and dates and counts in the household');
insert into ids select 'tp_rent', public.create_ledger('Tampines unit', 'property', 'SGD', '2028-01-01', '2028-12-31')::text;
select pg_temp.check((select l.type = 'property' and not l.counts_in_household and l.start_date is null and p.name = l.name
                      from public.ledgers l join public.properties p on p.id = l.property_id
                      where l.id = (select v::uuid from ids where k = 'tp_rent')),
  'a rental ledger creates its property tag with the same name, as a separate P&L, without dates');
select pg_temp.expect_error($$ select public.create_ledger('Tampines unit', 'property') $$,
  'a second rental ledger cannot reuse the same property');
select pg_temp.expect_error($$ select public.create_ledger('Another daily', 'daily') $$,
  'only trip, rental and other ledgers can be created (daily is automatic)');
select pg_temp.expect_error($$ select public.create_ledger('Bad currency', 'trip', 'sgd1') $$,
  'a ledger currency must be a 3-letter code');
update public.ledgers set name = 'Tampines 出租' where id = (select v::uuid from ids where k = 'tp_rent');
select pg_temp.check((select p.name from public.ledgers l join public.properties p on p.id = l.property_id
                      where l.id = (select v::uuid from ids where k = 'tp_rent')) = 'Tampines 出租',
  'renaming a rental ledger renames its property tag');
select pg_temp.expect_error($$ update public.ledgers set type = 'other' where name = 'Tampines 出租' $$,
  'a ledger type cannot change');
select pg_temp.expect_error($$ update public.ledgers set is_default = true where name = '2028 马来西亚' $$,
  'the default flag cannot be moved');
select pg_temp.expect_error(format($$ update public.ledgers set default_currency = 'USD' where id = %L $$, :'trip_v'),
  'the currency is locked once a ledger has records');
update public.ledgers set default_currency = 'USD' where name = '2028 马来西亚';
select pg_temp.check((select default_currency from public.ledgers where name = '2028 马来西亚') = 'USD',
  'the currency can change while a ledger is empty');
select pg_temp.expect_error($$ delete from public.ledgers where is_default $$,
  'the default ledger cannot be deleted');
select pg_temp.expect_error(format($$ delete from public.ledgers where id = %L $$, :'trip_v'),
  'a ledger with records cannot be deleted');
delete from public.ledgers where name = '2028 马来西亚';
select pg_temp.check((select count(*) from public.ledgers where name = '2028 马来西亚') = 0, 'an empty ledger can be deleted');

-- One card, three ledgers: the card's bill adds up across ledgers, reports stay separate.
insert into public.accounts (household_id, name, issuer, network, last4, statement_day)
values ((select v::uuid from ids where k = 'hh_alice'), 'Shared card', 'UOB', 'visa', '9999', 10)
returning id::text as v \gset shared_
insert into public.transactions (household_id, ledger_id, account_id, amount, category_id, txn_at, merchant_raw) values
  ((select v::uuid from ids where k = 'hh_alice'), (select id from public.ledgers where is_default), :'shared_v', 10, pg_temp.cat('餐饮', '晚餐'), '2028-02-03 19:00+08', 'S DAILY'),
  ((select v::uuid from ids where k = 'hh_alice'), :'trip_v',                                         :'shared_v', 20, pg_temp.cat('餐饮', '晚餐'), '2028-02-03 20:00+08', 'S TRIP'),
  ((select v::uuid from ids where k = 'hh_alice'), (select v::uuid from ids where k = 'tp_rent'),     :'shared_v', 30, pg_temp.cat('住房', '维修装修'), '2028-02-03 21:00+08', 'S RENT');
select pg_temp.check((select balance from public.v_account_balances where account_id = :'shared_v') = -60,
  'a card''s balance adds up spend from every ledger');
select pg_temp.check((select sum(amount_sgd) from public.v_min_spend_lines where account_id = :'shared_v') = 60,
  'a card''s min-spend adds up spend from every ledger');
select pg_temp.check((select sum(self_amount_sgd) from public.v_monthly_summary
                      where kind = 'expense' and month = '2028-02-01' and ledger_id = (select id from public.ledgers where is_default)) = 10,
  'the daily ledger report shows only its own spend');
select pg_temp.check((select sum(self_amount_sgd) from public.v_monthly_summary
                      where kind = 'expense' and month = '2028-02-01' and ledger_id = :'trip_v') = 20,
  'the trip ledger report shows only its own spend');
select pg_temp.check((select sum(self_amount_sgd) from public.v_monthly_summary
                      where kind = 'expense' and month = '2028-02-01' and ledger_id = (select v::uuid from ids where k = 'tp_rent')) = 30,
  'the rental ledger report shows only its own spend');

-- Submission date and AA paid back directly.
update public.transactions set recovery_submitted_at = '2026-11-02' where merchant = 'TRIP TAXI';
select pg_temp.check((select recovery_submitted_at from public.transactions where merchant = 'TRIP TAXI') = '2026-11-02',
  'a claim records its submission date');
select submitted_sgd as pool_before from public.v_recovery_pool \gset
insert into public.transactions (household_id, account_id, amount, category_id, recoverable_amount, recovery_status, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 120, pg_temp.cat('餐饮', '晚餐'), 90, 'submitted', 'AA LUNCH DIRECT');
select pg_temp.check((select recovery_status from public.transactions where merchant = 'AA LUNCH DIRECT') = 'submitted',
  'AA paid back directly can start as submitted');
select pg_temp.check((select submitted_sgd from public.v_recovery_pool) = :pool_before + 90,
  'AA started as submitted goes straight into the payback pool');

-- Foreign amount (information only): both parts or neither, positive, a currency code, different from the ledger's.
insert into public.transactions (household_id, ledger_id, amount, currency, amount_sgd, foreign_amount, foreign_currency, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'trip_v', 12000, 'JPY', 110, 80, 'USD', pg_temp.cat('旅行', '机票'), 'FOREIGN TEST');
select pg_temp.check((select foreign_amount = 80 and foreign_currency = 'USD' and amount_sgd = 110 from public.transactions where merchant = 'FOREIGN TEST'),
  'a foreign amount and currency are stored next to the ledger amount');
select pg_temp.check((select amount_sgd from public.v_transactions_report where merchant = 'FOREIGN TEST') = 110,
  'reports use the SGD amount, never the foreign one');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, ledger_id, amount, currency, amount_sgd, foreign_amount, category_id) values (%L, %L, 100, 'JPY', 1, 5, %L) $$,
  (select v from ids where k = 'hh_alice'), :'trip_v', pg_temp.cat('旅行', '机票')), 'a foreign amount needs its currency');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, ledger_id, amount, currency, amount_sgd, foreign_currency, category_id) values (%L, %L, 100, 'JPY', 1, 'USD', %L) $$,
  (select v from ids where k = 'hh_alice'), :'trip_v', pg_temp.cat('旅行', '机票')), 'a foreign currency needs its amount');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, ledger_id, amount, currency, amount_sgd, foreign_amount, foreign_currency, category_id) values (%L, %L, 100, 'JPY', 1, 0, 'USD', %L) $$,
  (select v from ids where k = 'hh_alice'), :'trip_v', pg_temp.cat('旅行', '机票')), 'a foreign amount must be above zero');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, ledger_id, amount, currency, amount_sgd, foreign_amount, foreign_currency, category_id) values (%L, %L, 100, 'JPY', 1, 5, 'usd', %L) $$,
  (select v from ids where k = 'hh_alice'), :'trip_v', pg_temp.cat('旅行', '机票')), 'a foreign currency must be a 3-letter capital code');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, ledger_id, amount, currency, amount_sgd, foreign_amount, foreign_currency, category_id) values (%L, %L, 100, 'JPY', 1, 5, 'JPY', %L) $$,
  (select v from ids where k = 'hh_alice'), :'trip_v', pg_temp.cat('旅行', '机票')), 'a foreign currency must differ from the transaction currency');
select pg_temp.expect_error(format(
  $$ insert into public.transactions (household_id, ledger_id, amount, currency, category_id) values (%L, %L, 100, 'JPY', %L) $$,
  (select v from ids where k = 'hh_alice'), :'trip_v', pg_temp.cat('旅行', '机票')), 'a non-SGD entry must state its SGD amount');

-- Entered as "not paid back": a pass-through category no longer forces the full amount.
insert into public.transactions (household_id, amount, category_id, recoverable_amount, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), 45, pg_temp.cat('代付款', '餐费'), 0, 'MY OWN MEAL');
select pg_temp.check((select recoverable_amount = 0 and recovery_status is null from public.transactions where merchant = 'MY OWN MEAL'),
  'an explicit zero recoverable amount stays zero, even in a pass-through category');

-- A payback settles only the part it covers: S$100 expense, S$80 claimed, S$20 then S$60 paid back.
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) is not null, 'pool still readable');
select outstanding_sgd as pool_a from public.v_recovery_pool \gset
insert into public.transactions (household_id, account_id, amount, category_id, recoverable_amount, recovery_status, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 100, pg_temp.cat('餐饮', '晚餐'), 80, 'submitted', 'PARTIAL DINNER')
returning id::text as v \gset part_
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = :pool_a + 80, 'a new claim of 80 adds 80 to the pool');
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'bank_v', 20, pg_temp.cat('回款类', '代付款收回'), 'PAYBACK 20')
returning id::text as v \gset pb1_
insert into public.recovery_links (household_id, income_id, expense_id)
values ((select v::uuid from ids where k = 'hh_alice'), :'pb1_v', :'part_v');
select pg_temp.check((select amount from public.recovery_links where income_id = :'pb1_v') = 20,
  'a link defaults to what the payback covers (20 of the 80)');
select pg_temp.check((select recovery_status from public.transactions where id = :'part_v') = 'submitted',
  'a part payback does not mark the whole claim received');
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = :pool_a + 60,
  'the pool keeps the 60 still to come');
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'bank_v', 100, pg_temp.cat('回款类', '代付款收回'), 'PAYBACK 100')
returning id::text as v \gset pb2_
insert into public.recovery_links (household_id, income_id, expense_id)
values ((select v::uuid from ids where k = 'hh_alice'), :'pb2_v', :'part_v');
select pg_temp.check((select amount from public.recovery_links where income_id = :'pb2_v') = 60,
  'the second link takes only the 60 the claim still waits for');
select pg_temp.check((select recovery_status from public.transactions where id = :'part_v') = 'received',
  'the claim is received once the paybacks add up');
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = :pool_a - 40,
  'the 40 of the second payback not linked to anything reduces the pool');
select pg_temp.expect_error(format(
  $$ insert into public.recovery_links (household_id, income_id, expense_id, amount) values (%L, %L, %L, 30) $$,
  (select v from ids where k = 'hh_alice'), :'pb1_v', :'part_v'),
  'a payback cannot settle more than it received');
delete from public.recovery_links where income_id = :'pb2_v';
select pg_temp.check((select recovery_status from public.transactions where id = :'part_v') = 'submitted',
  'removing a link puts a part-paid claim back to claimed');

-- The Add screen's own sequence (it passes explicit link amounts): expense 100 with 80 claimed,
-- payback 20, then payback 100 which can only settle the 60 still waiting.
insert into public.transactions (household_id, account_id, amount, category_id, recoverable_amount, recovery_status, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 100, pg_temp.cat('餐饮', '晚餐'), 80, 'submitted', 'SCREEN DINNER')
returning id::text as v \gset scr_
select outstanding_sgd as pool_s0 from public.v_recovery_pool \gset
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'bank_v', 20, pg_temp.cat('回款类', '代付款收回'), 'SCREEN PAYBACK 20')
returning id::text as v \gset scr1_
insert into public.recovery_links (household_id, income_id, expense_id, amount)
values ((select v::uuid from ids where k = 'hh_alice'), :'scr1_v', :'scr_v', 20);
select pg_temp.check((select recovery_status from public.transactions where id = :'scr_v') = 'submitted'
  and (select sum(amount) from public.recovery_links where expense_id = :'scr_v') = 20,
  'screen sequence: after a payback of 20 the claim is still Claimed with 20 received');
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = :pool_s0 - 20,
  'screen sequence: the pool is down by 20');
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'bank_v', 100, pg_temp.cat('回款类', '代付款收回'), 'SCREEN PAYBACK 100')
returning id::text as v \gset scr2_
insert into public.recovery_links (household_id, income_id, expense_id, amount)
values ((select v::uuid from ids where k = 'hh_alice'), :'scr2_v', :'scr_v', 60);
select pg_temp.check((select recovery_status from public.transactions where id = :'scr_v') = 'received',
  'screen sequence: after the second payback the claim is Received');
select pg_temp.check((select sum(amount) from public.recovery_links where income_id = :'scr2_v') = 60,
  'screen sequence: only 60 of the 100 payback is linked');
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = :pool_s0 - 20 - 100,
  'screen sequence: the pool counts the whole 100 payback (60 linked, 40 left over)');
-- Cash is an account like any other: income into a Cash account, and a transfer out of it.
insert into public.accounts (household_id, name, type)
values ((select v::uuid from ids where k = 'hh_alice'), 'Wallet cash', 'cash')
returning id::text as v \gset cash_
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'cash_v', 15, pg_temp.cat('回款类', '代付款收回'), 'CASH PAYBACK');
select pg_temp.check((select count(*) from public.transactions where merchant = 'CASH PAYBACK' and account_id = :'cash_v') = 1,
  'a payback can be received into a Cash account');
insert into public.transactions (household_id, ledger_id, account_id, to_account_id, amount, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), (select id from public.ledgers where is_default), :'bank_v', :'cash_v', 50, 'ATM');
select pg_temp.check((select kind from public.transactions where merchant = 'ATM') = 'transfer',
  'bank to Cash is a transfer');

-- Deleting records. A payback that settled part of a claim goes: the claim is Claimed again.
delete from public.transactions where id = :'scr2_v';
select pg_temp.check((select recovery_status from public.transactions where id = :'scr_v') = 'submitted',
  'deleting a payback puts the claim it settled back to Claimed');
select pg_temp.check((select count(*) from public.recovery_links where income_id = :'scr2_v') = 0,
  'deleting a payback removes its links');
select pg_temp.check((select sum(amount) from public.recovery_links where expense_id = :'scr_v') = 20,
  'the claim keeps the payback that is still there');
-- Deleting the claim leaves its payback as plain, unlinked money.
delete from public.transactions where id = :'scr_v';
select pg_temp.check((select count(*) from public.recovery_links where expense_id = :'scr_v') = 0,
  'deleting a claim removes its links');
select pg_temp.check((select count(*) from public.transactions where id = :'scr1_v') = 1,
  'the payback of a deleted claim stays on the books');
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = :pool_s0 - 80 - 20 - 15,
  'the pool no longer counts the deleted claim, and counts the whole 20 payback (and the 15 cash payback) as unlinked');

-- Editing records with links. Claim 100, 80 paid back; payback of 50 linked.
insert into public.transactions (household_id, account_id, amount, category_id, recoverable_amount, recovery_status, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 100, pg_temp.cat('餐饮', '晚餐'), 80, 'submitted', 'EDIT DINNER')
returning id::text as v \gset ed_
insert into public.transactions (household_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), 50, pg_temp.cat('回款类', '代付款收回'), 'EDIT PAYBACK')
returning id::text as v \gset edp_
insert into public.recovery_links (household_id, income_id, expense_id, amount)
values ((select v::uuid from ids where k = 'hh_alice'), :'edp_v', :'ed_v', 50);
select pg_temp.expect_error(format($$ update public.transactions set recoverable_amount = 40 where id = %L $$, :'ed_v'),
  'a claim cannot expect less than it has already received');
select pg_temp.expect_error(format($$ update public.transactions set recoverable_amount = 0 where id = %L $$, :'ed_v'),
  'a claim with paybacks cannot be made not recoverable');
select pg_temp.expect_error(format($$ update public.transactions set amount = 30 where id = %L $$, :'edp_v'),
  'a payback cannot be made smaller than what it settles');
update public.transactions set amount = 70, notes = 'edited' where id = :'edp_v';
select pg_temp.check((select amount from public.transactions where id = :'edp_v') = 70, 'a payback can be made bigger');
update public.transactions set recoverable_amount = 50 where id = :'ed_v';
select pg_temp.check((select recovery_status from public.transactions where id = :'ed_v') = 'received',
  'lowering a claim to what was received makes it Received');
update public.transactions set recoverable_amount = 100 where id = :'ed_v';
select pg_temp.check((select recovery_status from public.transactions where id = :'ed_v') = 'submitted',
  'raising a received claim makes it Claimed again');
update public.transactions set merchant = 'EDIT DINNER 2', merchant_raw = 'EDIT DINNER 2', amount = 120, txn_at = now() - interval '1 day' where id = :'ed_v';
select pg_temp.check((select merchant from public.transactions where id = :'ed_v') = 'EDIT DINNER 2', 'a record can be renamed');
select pg_temp.check((select count(*) from public.recovery_links where expense_id = :'ed_v') = 1, 'editing keeps the links');
-- Editing a transfer: the card top-up choice follows the new source account.
update public.transactions set account_id = :'bank_v', to_account_id = :'cash_v', counts_to_min_spend = null where merchant = 'ATM';
select pg_temp.check((select kind = 'transfer' and not counts_to_min_spend from public.transactions where merchant = 'ATM'),
  'an edited transfer stays a transfer');

-- Refunds on ordinary spend. A 100 purchase, not claimed; refunds of 30 and then 20 arrive.
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 100, pg_temp.cat('餐饮', '晚餐'), 'REFUND DINNER')
returning id::text as v \gset rf_
select outstanding_sgd as pool_rf0 from public.v_recovery_pool \gset
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 30, pg_temp.cat('回款类', '退款'), 'REFUND 30')
returning id::text as v \gset rf1_
insert into public.recovery_links (household_id, income_id, expense_id, amount)
values ((select v::uuid from ids where k = 'hh_alice'), :'rf1_v', :'rf_v', 30);
select pg_temp.check((select recoverable_amount = 30 and recovery_status = 'received' and recoverable_from_link
  from public.transactions where id = :'rf_v'), 'a refund on ordinary spend makes that part recoverable and received');
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = :pool_rf0, 'a received refund does not add to the pool');
select pg_temp.check((select self_amount_sgd from public.v_transactions_report where id = :'rf_v') = 70,
  'the refunded part no longer counts as the household spend');
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 20, pg_temp.cat('回款类', '退款'), 'REFUND 20')
returning id::text as v \gset rf2_
insert into public.recovery_links (household_id, income_id, expense_id, amount)
values ((select v::uuid from ids where k = 'hh_alice'), :'rf2_v', :'rf_v', 20);
select pg_temp.check((select recoverable_amount = 50 and recovery_status = 'received' from public.transactions where id = :'rf_v'),
  'a second part refund extends the refunded part');
insert into public.transactions (household_id, account_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 80, pg_temp.cat('回款类', '退款'), 'REFUND TOO BIG')
returning id::text as v \gset rf3_
select pg_temp.expect_error(format(
  $$ insert into public.recovery_links (household_id, income_id, expense_id, amount) values (%L, %L, %L, 60) $$,
  (select v from ids where k = 'hh_alice'), :'rf3_v', :'rf_v'), 'refunds cannot add up to more than the spend');
delete from public.transactions where id = :'rf2_v';
select pg_temp.check((select recoverable_amount = 30 from public.transactions where id = :'rf_v'), 'deleting a part refund shrinks the refunded part');
delete from public.transactions where id = :'rf1_v';
select pg_temp.check((select recoverable_amount = 0 and recovery_status is null and not recoverable_from_link
  from public.transactions where id = :'rf_v'), 'deleting the last refund makes it ordinary spend again');
select pg_temp.check((select outstanding_sgd from public.v_recovery_pool) = :pool_rf0,
  'refunds on ordinary spend never change the pool, linked or not');
-- A claim the person made is not extended by a further payback, and keeps its claim when its payback goes.
insert into public.transactions (household_id, account_id, amount, category_id, recoverable_amount, recovery_status, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), :'citi_v', 100, pg_temp.cat('餐饮', '晚餐'), 40, 'submitted', 'OWN CLAIM')
returning id::text as v \gset oc_
insert into public.transactions (household_id, amount, category_id, merchant_raw)
values ((select v::uuid from ids where k = 'hh_alice'), 60, pg_temp.cat('回款类', '代付款收回'), 'OWN PAYBACK')
returning id::text as v \gset ocp_
insert into public.recovery_links (household_id, income_id, expense_id)
values ((select v::uuid from ids where k = 'hh_alice'), :'ocp_v', :'oc_v');
select pg_temp.check((select amount = 40 from public.recovery_links where income_id = :'ocp_v'), 'a payback settles a claim only up to the claim');
delete from public.transactions where id = :'ocp_v';
select pg_temp.check((select recoverable_amount = 40 and recovery_status = 'submitted' from public.transactions where id = :'oc_v'),
  'a claim stays a claim when its payback is deleted');
-- A person who changes the refunded part makes it their own claim: it no longer follows the refunds.
insert into public.recovery_links (household_id, income_id, expense_id, amount)
values ((select v::uuid from ids where k = 'hh_alice'), :'rf3_v', :'rf_v', 30);
update public.transactions set recoverable_amount = 50, recovery_status = 'submitted' where id = :'rf_v';
select pg_temp.check((select not recoverable_from_link from public.transactions where id = :'rf_v'),
  'changing the recoverable amount by hand makes it the person''s own claim');
delete from public.transactions where id = :'rf3_v';
select pg_temp.check((select recoverable_amount = 50 and recovery_status = 'submitted' from public.transactions where id = :'rf_v'),
  'their own claim stays when the refund is removed');

-- Receipt photos: the bucket exists, is private, and a family can store a photo in its own folder.
insert into storage.objects (bucket_id, name)
values ('receipts', (select v from ids where k = 'hh_alice') || '/00000000-0000-0000-0000-0000000000aa/photo.jpg');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'receipts') = 1, 'a family can store and read a receipt photo in its folder');
select pg_temp.expect_error(format(
  $$ insert into storage.objects (bucket_id, name) values ('receipts', %L) $$,
  '00000000-0000-0000-0000-0000000000bb/00000000-0000-0000-0000-0000000000aa/photo.jpg'),
  'a photo cannot go into another family''s folder');
select pg_temp.expect_error(
  $$ insert into storage.objects (bucket_id, name) values ('receipts', 'loose-file.jpg') $$,
  'a photo outside a family folder is refused');

-- Carol still sees none of it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select pg_temp.check((select count(*) from public.v_transactions_report) = 0, 'other household sees none of our report rows');
select pg_temp.check((select count(*) from public.v_recovery_pool) = 0, 'other household sees none of our recovery pool');
select pg_temp.check((select count(*) from public.ledgers) = 1, 'other household sees only its own ledger');
select pg_temp.check((select count(*) from public.v_account_balances where name <> '现金') = 0, 'other household sees none of our balances');
select pg_temp.check((select count(*) from public.statements) = 0, 'other household sees none of our statements');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'receipts') = 0, 'other household sees none of our receipt photos');
select pg_temp.expect_error(format(
  $$ insert into storage.objects (bucket_id, name) values ('receipts', %L) $$,
  (select v from ids where k = 'hh_alice') || '/00000000-0000-0000-0000-0000000000aa/other.jpg'),
  'another family cannot add a photo to our folder');

-- ---------- Anonymous visitors get nothing ------------------------------------
reset role;
select pg_temp.check((select not public and file_size_limit = 5242880 from storage.buckets where id = 'receipts'), 'the receipts bucket is private with a size limit');
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.expect_error($$ select * from public.transactions $$, 'anonymous cannot read transactions');
select pg_temp.expect_error($$ select public.create_household('x', 'y') $$, 'anonymous cannot create households');

reset role;
select pg_temp.check(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'categories' and column_name = 'is_excluded_from_reports'),
  'deprecated categories.is_excluded_from_reports column is gone');

-- Deleting a whole family still removes its default ledger (the delete guard only stops deleting it on its own).
insert into public.households (id, name) values ('99999999-9999-9999-9999-999999999999', 'Throwaway family');
select pg_temp.check((select count(*) from public.ledgers where household_id = '99999999-9999-9999-9999-999999999999') = 1,
  'a throwaway family has its default ledger');
delete from public.households where id = '99999999-9999-9999-9999-999999999999';
select pg_temp.check((select count(*) from public.ledgers where household_id = '99999999-9999-9999-9999-999999999999') = 0,
  'deleting a family removes its default ledger');

select pg_temp.check(true, 'all database tests passed');

-- Merchant templates: tenant isolation, write roles and account guards.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into public.expense_templates (household_id, merchant, account_id) values ((select v::uuid from ids where k='hh_alice'), 'Giant', (select v::uuid from ids where k='acct_alice'));
select pg_temp.check((select count(*) from public.expense_templates)=1, 'owner can save a merchant template');
select pg_temp.expect_error(format($$insert into public.expense_templates(household_id,merchant,account_id) values (%L,' GIANT ',%L)$$, (select v from ids where k='hh_alice'), (select v from ids where k='acct_alice')), 'normalised duplicate merchant rejected');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select pg_temp.check((select count(*) from public.expense_templates)=0, 'another family cannot read templates');
select pg_temp.expect_error(format($$insert into public.expense_templates(household_id,merchant,account_id) values (%L,'Shell',%L)$$, (select v from ids where k='hh_carol'), (select v from ids where k='acct_alice')), 'template cannot use another family account');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select pg_temp.expect_error(format($$insert into public.expense_templates(household_id,merchant,account_id) values (%L,'Shell',%L)$$, (select v from ids where k='hh_alice'), (select v from ids where k='acct_alice')), 'viewer cannot create templates');
delete from public.expense_templates;
select pg_temp.check((select count(*) from public.expense_templates)=1, 'viewer cannot delete templates');
set local role anon;
select pg_temp.expect_error('select * from public.expense_templates','anon cannot read templates');
reset role;

-- Recurrence: immutable future revisions, anchoring, atomic posting and tenant isolation.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select pg_temp.check(public.recurring_due('2024-01-31','monthly',1)='2024-02-29' and public.recurring_due('2024-01-31','monthly',2)='2024-03-31','month end returns to original anchor');
select pg_temp.check(public.recurring_due('2024-02-29','yearly',1)='2025-02-28' and public.recurring_due('2024-02-29','yearly',4)='2028-02-29','yearly leap day returns in leap years');
insert into ids select 'repeat_before',count(*)::text from public.transactions;
insert into ids select 'repeat_first',public.save_recurring(null,null,null,'Mobile','monthly',(now() at time zone 'Asia/Singapore')::date,null,true,35.50,35.50,(select id from public.ledgers where is_default),(select id from public.categories where kind='expense' and name='超市'),null,'Mobile company','old notes')::text;
select pg_temp.check((select count(*) from public.transactions)=(select v::integer from ids where k='repeat_before'),'plans do not affect transactions');
select pg_temp.check((select count(*) from public.recurring_plan() p where p->>'name'='Mobile' and p->>'state'='planned')>=12,'open ended monthly preview');
insert into ids select 'repeat_tx',public.confirm_recurring((select v::uuid from ids where k='repeat_first'),(now() at time zone 'Asia/Singapore')::date,false,40.25,null,'actual bill')::text;
select pg_temp.check((select amount from public.transactions where id=(select v::uuid from ids where k='repeat_tx'))=40.25,'actual amount override recorded');
select pg_temp.check((select notes from public.transactions where id=(select v::uuid from ids where k='repeat_tx'))='actual bill','actual notes override recorded');
select pg_temp.check(public.confirm_recurring((select v::uuid from ids where k='repeat_first'),(now() at time zone 'Asia/Singapore')::date,false,99,null,'retry')=(select v::uuid from ids where k='repeat_tx'),'confirm retry returns the same record');
select pg_temp.check((select count(*) from public.transactions)=(select v::integer+1 from ids where k='repeat_before'),'confirm retry never duplicates');
insert into ids select 'repeat_second',public.save_recurring((select series_id from public.recurring_versions where id=(select v::uuid from ids where k='repeat_first')),(select v::uuid from ids where k='repeat_first'),(now() at time zone 'Asia/Singapore')::date+1,'Mobile','monthly',(now() at time zone 'Asia/Singapore')::date,null,true,50,50,(select id from public.ledgers where is_default),(select id from public.categories where kind='expense' and name='超市'),null,'New provider','new notes')::text;
select pg_temp.check((select amount from public.recurring_versions where id=(select v::uuid from ids where k='repeat_first'))=35.50,'earlier revision remains unchanged');
select pg_temp.check((select notes from public.transactions where id=(select v::uuid from ids where k='repeat_tx'))='actual bill','future revision never rewrites actual expense');
select pg_temp.check((select bool_and((p->>'amount')::numeric=50 and p->>'notes'='new notes') from public.recurring_plan() p where p->>'name'='Mobile' and p->>'due_date'>((now() at time zone 'Asia/Singapore')::date)::text),'future planned bills use revised amount and notes');
select pg_temp.expect_error($$select public.save_recurring((select series_id from public.recurring_versions where id=(select v::uuid from ids where k='repeat_first')),(select v::uuid from ids where k='repeat_first'),(now() at time zone 'Asia/Singapore')::date+1,'Stale','monthly',current_date,null,true,1,1,(select id from public.ledgers where is_default),(select id from public.categories where kind='expense' and name='超市'),null,'','')$$,'stale concurrent edit rejected');
select pg_temp.expect_error($$select public.save_recurring((select series_id from public.recurring_versions where id=(select v::uuid from ids where k='repeat_first')),(select v::uuid from ids where k='repeat_second'),(now() at time zone 'Asia/Singapore')::date,'Past','monthly',current_date,null,true,1,1,(select id from public.ledgers where is_default),(select id from public.categories where kind='expense' and name='超市'),null,'','')$$,'past effective edits rejected');
select pg_temp.expect_error($$update public.recurring_versions set amount=999$$,'revisions cannot be updated');
select pg_temp.expect_error($$delete from public.recurring_versions$$,'revisions cannot be deleted');
select pg_temp.expect_error($$select public.confirm_recurring((select v::uuid from ids where k='repeat_second'),(now() at time zone 'Asia/Singapore')::date+1)$$,'future or off-schedule confirmation rejected');
insert into ids select 'repeat_yearly',public.save_recurring(null,null,null,'Insurance','yearly',(now() at time zone 'Asia/Singapore')::date,(now() at time zone 'Asia/Singapore')::date,true,800,800,(select id from public.ledgers where is_default),(select id from public.categories where kind='expense' and name='超市'),null,'Insurer','annual')::text;
select pg_temp.check((select count(*) from public.recurring_plan() p where p->>'name'='Insurance')=1,'yearly end date is inclusive and prevents later occurrences');
select public.confirm_recurring((select v::uuid from ids where k='repeat_yearly'),(now() at time zone 'Asia/Singapore')::date,true);
select pg_temp.check((select count(*) from public.transactions)=(select v::integer+1 from ids where k='repeat_before'),'skip never posts spend');
select public.confirm_recurring((select v::uuid from ids where k='repeat_yearly'),(now() at time zone 'Asia/Singapore')::date);
select pg_temp.check((select count(*) from public.transactions)=(select v::integer+1 from ids where k='repeat_before'),'skipped bill cannot reappear on retry');
-- Future stop revision preserves the past.
select public.save_recurring((select series_id from public.recurring_versions where id=(select v::uuid from ids where k='repeat_first')),(select v::uuid from ids where k='repeat_second'),(now() at time zone 'Asia/Singapore')::date+1,'Mobile','monthly',(now() at time zone 'Asia/Singapore')::date,null,false,50,50,(select id from public.ledgers where is_default),(select id from public.categories where kind='expense' and name='超市'),null,'','');
select pg_temp.check((select count(*) from public.recurring_plan() p where p->>'name'='Mobile' and p->>'state'='planned')=0,'future stop removes future planned bills');
select pg_temp.check((select count(*) from public.recurring_plan() p where p->>'name'='Mobile' and p->>'state'='confirmed')=1,'future stop retains confirmed past bill');
-- Other family and read-only viewer cannot write or call posting RPC.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select pg_temp.check((select count(*) from public.recurring_versions)=0,'other family cannot read schedules');
select pg_temp.check((select count(*) from public.recurring_plan())=0,'plan RPC respects tenant RLS');
select pg_temp.expect_error($$select public.confirm_recurring((select v::uuid from ids where k='repeat_first'),current_date)$$,'other family cannot confirm');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select pg_temp.check((select count(*) from public.recurring_versions)>0,'viewer can see family plans');
select pg_temp.expect_error($$select public.save_recurring(null,null,null,'Bad','monthly',current_date,null,true,1,1,(select id from public.ledgers where is_default),(select id from public.categories where kind='expense' and name='超市'),null,'','')$$,'viewer cannot create plans');
select pg_temp.expect_error($$select public.confirm_recurring((select v::uuid from ids where k='repeat_first'),current_date)$$,'viewer cannot confirm');
set local role anon;
select pg_temp.expect_error('select * from public.recurring_versions','anon cannot read plans');
select pg_temp.expect_error('select * from public.recurring_plan()','anon cannot execute plan RPC');
reset role;

rollback;
