-- Planned bills are separate from transactions. Confirming a due occurrence posts it once.
create table public.recurring_series (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(id, household_id)
);
create table public.recurring_versions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null,
  household_id uuid not null,
  revision integer not null,
  effective_from date not null,
  name text not null check(length(trim(name)) between 1 and 100),
  frequency text not null check(frequency in ('monthly','yearly')),
  start_date date not null check(start_date between '1900-01-01' and '2200-12-31'),
  end_date date check(end_date >= start_date),
  enabled boolean not null default true,
  amount numeric(12,2) not null check(amount > 0),
  amount_sgd numeric(12,2) not null check(amount_sgd > 0),
  ledger_id uuid not null,
  category_id uuid not null,
  account_id uuid,
  merchant text check(length(merchant)<=100),
  notes text check(length(notes)<=500),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(series_id, revision),
  unique(id, household_id),
  foreign key(series_id, household_id) references public.recurring_series(id, household_id),
  foreign key(ledger_id, household_id) references public.ledgers(id, household_id),
  foreign key(category_id, household_id) references public.categories(id, household_id),
  foreign key(account_id, household_id) references public.accounts(id, household_id)
);
create index recurring_versions_family_idx on public.recurring_versions(household_id);
create index recurring_versions_ledger_idx on public.recurring_versions(ledger_id);
create index recurring_versions_category_idx on public.recurring_versions(category_id);
create index recurring_versions_account_idx on public.recurring_versions(account_id);
create index recurring_versions_creator_idx on public.recurring_versions(created_by);
create table public.recurring_occurrences (
  series_id uuid not null,
  household_id uuid not null,
  due_date date not null,
  version_id uuid not null,
  state text not null check(state in ('confirmed','skipped')),
  transaction_id uuid unique,
  created_at timestamptz not null default now(),
  primary key(series_id, due_date),
  foreign key(series_id, household_id) references public.recurring_series(id, household_id),
  foreign key(version_id, household_id) references public.recurring_versions(id, household_id),
  foreign key(transaction_id, household_id) references public.transactions(id, household_id) on delete set null(transaction_id)
);
create index recurring_occurrences_family_idx on public.recurring_occurrences(household_id);
create index recurring_occurrences_version_idx on public.recurring_occurrences(version_id);
do $$ declare tbl text; begin
  foreach tbl in array array['recurring_series','recurring_versions','recurring_occurrences'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from anon, authenticated',tbl);
    execute format('grant select, insert on public.%I to authenticated',tbl);
    execute format('grant all on public.%I to service_role',tbl);
    execute format('create policy %I on public.%I for select to authenticated using(public.is_member(household_id))',tbl||'_read',tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check(public.can_write(household_id))',tbl||'_add',tbl);
  end loop;
end $$;

-- Anchor each occurrence to the original day, rather than adding months to the last due date.
create function public.recurring_due(anchor date, frequency text, ordinal integer) returns date
language sql immutable strict security invoker set search_path='' as $$
  with m as (select (date_trunc('month',anchor::timestamp) + make_interval(months => ordinal * case frequency when 'yearly' then 12 else 1 end))::date as first)
  select first + (least(extract(day from anchor)::integer, extract(day from (first + interval '1 month - 1 day'))::integer)-1) from m
$$;
revoke all on function public.recurring_due(date,text,integer) from public, anon;
grant execute on function public.recurring_due(date,text,integer) to authenticated, service_role;

create function public.tg_recurring_version_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare prev public.recurring_versions; led public.ledgers; cat public.categories; today date := (now() at time zone 'Asia/Singapore')::date;
begin
  -- Serialize all revisions and confirmations for one series, including direct API inserts.
  perform id from public.recurring_series where id=new.series_id and household_id=new.household_id for update;
  select * into prev from public.recurring_versions where series_id=new.series_id order by revision desc limit 1;
  new.revision := coalesce(prev.revision,0)+1;
  if prev.id is null then new.effective_from := new.start_date;
  elsif new.effective_from <= today or new.effective_from < prev.effective_from then
    raise exception 'changes must start in the future, on or after the last revision';
  end if;
  if new.created_by <> auth.uid() then raise exception 'the revision author must be the signed-in person'; end if;
  select * into led from public.ledgers where id=new.ledger_id and household_id=new.household_id and not is_archived;
  select * into cat from public.categories where id=new.category_id and household_id=new.household_id and kind='expense' and not is_archived;
  if led.id is null or cat.id is null or (cat.ledger_type is not null and cat.ledger_type <> led.type) or (cat.requires_property and led.property_id is null) then raise exception 'choose an active ledger and compatible expense category'; end if;
  if new.account_id is not null and not exists(select 1 from public.accounts where id=new.account_id and household_id=new.household_id and is_active) then raise exception 'choose an active family account'; end if;
  if led.default_currency='SGD' then new.amount_sgd:=new.amount; end if;
  new.name:=trim(new.name);
  return new;
end $$;
revoke all on function public.tg_recurring_version_guard() from public,anon;
create trigger recurring_version_guard before insert on public.recurring_versions for each row execute function public.tg_recurring_version_guard();

create function public.save_recurring(p_series uuid, p_expected uuid, p_effective date, p_name text, p_frequency text, p_start date, p_end date, p_enabled boolean, p_amount numeric, p_amount_sgd numeric, p_ledger uuid, p_category uuid, p_account uuid, p_merchant text, p_notes text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare hid uuid; sid uuid; latest uuid; vid uuid;
begin
  select household_id into hid from public.members where user_id=auth.uid();
  if hid is null or not public.can_write(hid) then raise exception 'not allowed'; end if;
  if p_series is null then insert into public.recurring_series(household_id) values(hid) returning id into sid;
  else
    select id into sid from public.recurring_series where id=p_series and household_id=hid for update;
    if sid is null then raise exception 'schedule not found'; end if;
    select id into latest from public.recurring_versions where series_id=sid order by revision desc limit 1;
    if latest is distinct from p_expected then raise exception 'schedule changed; reload before editing'; end if;
  end if;
  insert into public.recurring_versions(series_id,household_id,revision,effective_from,name,frequency,start_date,end_date,enabled,amount,amount_sgd,ledger_id,category_id,account_id,merchant,notes)
  values(sid,hid,1,coalesce(p_effective,p_start),p_name,p_frequency,p_start,p_end,p_enabled,p_amount,coalesce(p_amount_sgd,p_amount),p_ledger,p_category,p_account,nullif(trim(p_merchant),''),nullif(trim(p_notes),'')) returning id into vid;
  return vid;
end $$;
revoke all on function public.save_recurring(uuid,uuid,date,text,text,date,date,boolean,numeric,numeric,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.save_recurring(uuid,uuid,date,text,text,date,date,boolean,numeric,numeric,uuid,uuid,uuid,text,text) to authenticated;

create function public.recurring_plan(p_through date default ((now() at time zone 'Asia/Singapore')::date + interval '1 year')::date) returns setof jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_through > (now() at time zone 'Asia/Singapore')::date + interval '2 years' then raise exception 'preview at most two years ahead'; end if;
  return query
  with versions as (select v.*, lead(effective_from) over(partition by series_id order by revision) as until_date from public.recurring_versions v),
  dates as (select v, public.recurring_due(v.start_date,v.frequency,n) as due from versions v cross join lateral generate_series(0,greatest(0,((extract(year from p_through)::integer-extract(year from v.start_date)::integer)*12+extract(month from p_through)::integer-extract(month from v.start_date)::integer)/case v.frequency when 'yearly' then 12 else 1 end)) n where v.enabled)
  select (to_jsonb(d.v)-'until_date') || jsonb_build_object('due_date',d.due,'state',coalesce(o.state,'planned'),'transaction_id',o.transaction_id,'currency',l.default_currency)
  from dates d join public.ledgers l on l.id=(d.v).ledger_id
  left join public.recurring_occurrences o on o.series_id=(d.v).series_id and o.due_date=d.due
  where d.due >= (d.v).effective_from and d.due <= p_through and ((d.v).until_date is null or d.due < (d.v).until_date) and ((d.v).end_date is null or d.due <= (d.v).end_date)
  order by d.due,(d.v).series_id;
end $$;
revoke all on function public.recurring_plan(date) from public,anon;
grant execute on function public.recurring_plan(date) to authenticated;

create function public.confirm_recurring(p_version uuid,p_due date,p_skip boolean default false,p_amount numeric default null,p_amount_sgd numeric default null,p_notes text default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v public.recurring_versions; chosen uuid; existing public.recurring_occurrences; tid uuid; currency text; total numeric; sgd numeric; hid uuid; months integer;
begin
  select household_id into hid from public.members where user_id=auth.uid();
  if hid is null or not public.can_write(hid) then raise exception 'not allowed'; end if;
  select * into v from public.recurring_versions where id=p_version and household_id=hid;
  if v.id is null then raise exception 'schedule not found'; end if;
  perform id from public.recurring_series where id=v.series_id for update;
  select * into existing from public.recurring_occurrences where series_id=v.series_id and due_date=p_due;
  if existing.series_id is not null then return existing.transaction_id; end if; -- retry is harmless, even after record deletion
  select id into chosen from public.recurring_versions where series_id=v.series_id and effective_from<=p_due order by revision desc limit 1;
  months := (extract(year from p_due)::integer-extract(year from v.start_date)::integer)*12+extract(month from p_due)::integer-extract(month from v.start_date)::integer;
  if chosen is distinct from v.id or not v.enabled or p_due > (now() at time zone 'Asia/Singapore')::date or months<0 or (v.frequency='yearly' and months%12<>0) or p_due<>public.recurring_due(v.start_date,v.frequency,months/case v.frequency when 'yearly' then 12 else 1 end) or (v.end_date is not null and p_due>v.end_date) then raise exception 'not a due occurrence of this schedule version'; end if;
  if not p_skip then
    select default_currency into currency from public.ledgers where id=v.ledger_id and not is_archived;
    if currency is null or not exists(select 1 from public.categories where id=v.category_id and not is_archived) or (v.account_id is not null and not exists(select 1 from public.accounts where id=v.account_id and is_active)) then raise exception 'ledger, category or account is inactive'; end if;
    total:=coalesce(p_amount,v.amount); sgd:=case when currency='SGD' then total else coalesce(p_amount_sgd,v.amount_sgd) end;
    if total<=0 or sgd<=0 or length(coalesce(p_notes,''))>500 then raise exception 'invalid amount or notes'; end if;
    insert into public.transactions(household_id,ledger_id,category_id,account_id,spent_by,txn_at,amount,amount_sgd,currency,merchant_raw,notes,kind,source,dedupe_key)
    values(hid,v.ledger_id,v.category_id,v.account_id,auth.uid(),p_due::timestamp at time zone 'Asia/Singapore',total,sgd,currency,v.merchant,coalesce(p_notes,v.notes),'expense','manual','recurring:'||v.series_id||':'||p_due) returning id into tid;
  end if;
  insert into public.recurring_occurrences(series_id,household_id,due_date,version_id,state,transaction_id) values(v.series_id,hid,p_due,v.id,case when p_skip then 'skipped' else 'confirmed' end,tid);
  return tid;
end $$;
revoke all on function public.confirm_recurring(uuid,date,boolean,numeric,numeric,text) from public,anon;
grant execute on function public.confirm_recurring(uuid,date,boolean,numeric,numeric,text) to authenticated;
-- Occurrences can only be inserted by a validated call. Invoker RPC needs INSERT,
-- so a guard also validates direct API writes and ties a confirmation to its transaction.
create function public.tg_recurring_occurrence_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare v public.recurring_versions; chosen uuid; months integer;
begin
  select * into v from public.recurring_versions where id=new.version_id and household_id=new.household_id;
  if v.id is null or v.series_id<>new.series_id then raise exception 'wrong schedule'; end if;
  perform id from public.recurring_series where id=v.series_id for update;
  select id into chosen from public.recurring_versions where series_id=v.series_id and effective_from<=new.due_date order by revision desc limit 1;
  months:=(extract(year from new.due_date)::integer-extract(year from v.start_date)::integer)*12+extract(month from new.due_date)::integer-extract(month from v.start_date)::integer;
  if chosen is distinct from v.id or not v.enabled or new.due_date>(now() at time zone 'Asia/Singapore')::date or months<0 or (v.frequency='yearly' and months%12<>0) or new.due_date<>public.recurring_due(v.start_date,v.frequency,months/case v.frequency when 'yearly' then 12 else 1 end) or (v.end_date is not null and new.due_date>v.end_date) then raise exception 'invalid occurrence'; end if;
  if new.state='confirmed' and not exists(select 1 from public.transactions t where t.id=new.transaction_id and t.household_id=new.household_id and t.kind='expense' and t.dedupe_key='recurring:'||v.series_id||':'||new.due_date and (t.txn_at at time zone 'Asia/Singapore')::date=new.due_date) then raise exception 'confirmation needs its recurring expense record'; end if;
  if new.state='skipped' and new.transaction_id is not null then raise exception 'skipped occurrence cannot have a record'; end if;
  return new;
end $$;
revoke all on function public.tg_recurring_occurrence_guard() from public,anon;
create trigger recurring_occurrence_guard before insert on public.recurring_occurrences for each row execute function public.tg_recurring_occurrence_guard();
-- SELECT FOR UPDATE needs UPDATE privilege/policy; actual series edits are forbidden.
grant update(id) on public.recurring_series to authenticated;
create policy recurring_series_lock on public.recurring_series for update to authenticated using(public.can_write(household_id)) with check(public.can_write(household_id));
create function public.tg_recurring_series_immutable() returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'series identity is immutable'; end $$;
revoke all on function public.tg_recurring_series_immutable() from public,anon;
create trigger recurring_series_immutable before update on public.recurring_series for each row execute function public.tg_recurring_series_immutable();
create function public.tg_ledgers_recurring_currency() returns trigger language plpgsql security invoker set search_path='' as $$ begin
  if new.default_currency is distinct from old.default_currency and exists(select 1 from public.recurring_versions where ledger_id=old.id) then raise exception 'currency cannot change once a ledger has recurring schedules'; end if; return new;
end $$;
revoke all on function public.tg_ledgers_recurring_currency() from public,anon;
create trigger ledgers_recurring_currency before update on public.ledgers for each row execute function public.tg_ledgers_recurring_currency();
