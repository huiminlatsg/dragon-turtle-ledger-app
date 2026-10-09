-- An optional nickname for an account, shown first in the app with the official name underneath
-- (for example "DBS_Yuu" over "DBS yuu"). The official name stays in `name`, which is unique per family.
-- No new table, so RLS and grants are unchanged: the existing table-level policies cover the column.

alter table public.accounts
  add column nickname text check (nickname is null or length(trim(nickname)) between 1 and 40);

comment on column public.accounts.nickname is 'Friendly name shown first in the app; the official card or account name is in name.';
