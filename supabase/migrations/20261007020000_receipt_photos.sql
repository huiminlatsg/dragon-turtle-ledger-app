-- Receipt photos: a private storage bucket, one folder per family.
--
-- Photos live in the "receipts" bucket under <family id>/<record id>/<file>. A signed-in person can read
-- their own family's folder; writing needs the same right as editing records (can_write), so viewers can
-- look but not add or remove. The record points to its photo through transactions.receipt_id (existing)
-- and a row in public.receipts (existing).

-- The family a storage path belongs to: its first folder, when that is an id.
create or replace function public.storage_household(object_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when (storage.foldername(object_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(object_name))[1])::uuid end
$$;
grant execute on function public.storage_household(text) to authenticated, service_role;

-- Private; photos are shrunk in the browser before upload, so 5 MB is generous.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_member(public.storage_household(name)));
create policy receipts_add on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_write(public.storage_household(name)));
create policy receipts_change on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.can_write(public.storage_household(name)))
  with check (bucket_id = 'receipts' and public.can_write(public.storage_household(name)));
create policy receipts_remove on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.can_write(public.storage_household(name)));
