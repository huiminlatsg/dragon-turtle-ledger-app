-- Explicit merchant/account defaults; no automatic posting or data backfill.
create table public.expense_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  merchant text not null check (length(trim(merchant)) between 1 and 100),
  merchant_key text generated always as (lower(regexp_replace(trim(merchant), '\s+', ' ', 'g'))) stored,
  account_id uuid not null,
  category_id uuid,
  created_at timestamptz not null default now(),
  unique (household_id, merchant_key),
  foreign key (account_id, household_id) references public.accounts(id, household_id) on delete restrict,
  foreign key (category_id, household_id) references public.categories(id, household_id) on delete restrict
);
create index expense_templates_account_idx on public.expense_templates(account_id);
create index expense_templates_category_idx on public.expense_templates(category_id);
alter table public.expense_templates enable row level security;
revoke all on public.expense_templates from anon, authenticated;
grant select, insert, update, delete on public.expense_templates to authenticated, service_role;
create policy expense_templates_read on public.expense_templates for select to authenticated using (public.is_member(household_id));
create policy expense_templates_add on public.expense_templates for insert to authenticated with check (public.can_write(household_id));
create policy expense_templates_change on public.expense_templates for update to authenticated using (public.can_write(household_id)) with check (public.can_write(household_id));
create policy expense_templates_remove on public.expense_templates for delete to authenticated using (public.can_write(household_id));

create function public.tg_expense_template_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.household_id <> old.household_id) then
    raise exception 'a template cannot move between families';
  end if;
  if not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id and a.is_active) then
    raise exception 'choose an active account in this family';
  end if;
  if new.category_id is not null and not exists (select 1 from public.categories c where c.id = new.category_id and c.household_id = new.household_id and c.kind = 'expense' and not c.is_archived) then
    raise exception 'choose an active expense category in this family';
  end if;
  new.merchant := trim(new.merchant);
  return new;
end $$;
revoke all on function public.tg_expense_template_guard() from public, anon;
create trigger expense_template_guard before insert or update on public.expense_templates for each row execute function public.tg_expense_template_guard();
