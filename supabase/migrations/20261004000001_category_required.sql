-- Every expense and income needs a category (design §5; RTM gap G4).
-- Transfers between your own accounts still have none.
--
-- Any existing uncategorised record is moved to 其他 / 生活其他 first, so the
-- constraint can be added. (Records without a category were treated as living
-- spend in reports, which is the nature of 其他, so totals do not change.)

do $$
declare
  n integer;
begin
  update public.transactions t
  set category_id = c.id
  from public.categories c
  join public.categories p on p.id = c.parent_id
  where t.category_id is null
    and t.kind <> 'transfer'
    and c.household_id = t.household_id
    and p.kind = 'expense' and p.name = '其他' and c.name = '生活其他';
  get diagnostics n = row_count;
  if n > 0 then
    raise notice 'moved % uncategorised records to 其他 / 生活其他', n;
  end if;
end $$;

alter table public.transactions
  add constraint transactions_category_required
  check (kind = 'transfer' or category_id is not null);

comment on constraint transactions_category_required on public.transactions is
  'Expenses and income always have a category; transfers never do.';
