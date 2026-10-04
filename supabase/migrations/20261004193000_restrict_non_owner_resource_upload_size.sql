-- Tennis Player OS v1.2.15
-- Restrict heavy Resource Library uploads to the global application Owner.
--
-- Non-owner accounts may continue to create links / YouTube entries and may
-- upload lightweight files up to 5 MiB. The global Owner retains the bucket
-- limit of 200 MiB.

create or replace function public.can_upload_resource_file_size(
  p_size_bytes bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_app_owner()
    or (
      p_size_bytes is not null
      and p_size_bytes >= 0
      and p_size_bytes <= 5242880
    );
$$;

revoke all on function public.can_upload_resource_file_size(bigint)
  from public, anon;

grant execute on function public.can_upload_resource_file_size(bigint)
  to authenticated;


create or replace function public.can_upload_resource_storage_object(
  p_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_app_owner()
    or (
      p_metadata is not null
      and jsonb_typeof(p_metadata) = 'object'
      and coalesce(p_metadata ->> 'size', '') ~ '^[0-9]+$'
      and (p_metadata ->> 'size')::bigint <= 5242880
    );
$$;

revoke all on function public.can_upload_resource_storage_object(jsonb)
  from public, anon;

grant execute on function public.can_upload_resource_storage_object(jsonb)
  to authenticated;


drop policy if exists "resource_library_items_insert"
  on public.resource_library_items;

create policy "resource_library_items_insert"
on public.resource_library_items
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, module_key, true)
  and (
    created_by is null
    or created_by = (select auth.uid())
  )
  and (
    updated_by is null
    or updated_by = (select auth.uid())
  )
  and (
    kind = 'link'
    or public.can_upload_resource_file_size(size_bytes)
  )
);


drop policy if exists "resource_library_items_update"
  on public.resource_library_items;

create policy "resource_library_items_update"
on public.resource_library_items
for update
to authenticated
using (
  public.has_module_access(athlete_id, module_key, true)
)
with check (
  public.has_module_access(athlete_id, module_key, true)
  and (
    kind = 'link'
    or public.can_upload_resource_file_size(size_bytes)
  )
);


drop policy if exists "tpos_resources_insert"
  on storage.objects;

create policy "tpos_resources_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tpos-resources'
  and public.has_module_access(
    split_part(name, '/', 1)::uuid,
    split_part(name, '/', 2),
    true
  )
  and public.can_upload_resource_storage_object(metadata)
);


drop policy if exists "tpos_resources_update"
  on storage.objects;

create policy "tpos_resources_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tpos-resources'
  and public.has_module_access(
    split_part(name, '/', 1)::uuid,
    split_part(name, '/', 2),
    true
  )
)
with check (
  bucket_id = 'tpos-resources'
  and public.has_module_access(
    split_part(name, '/', 1)::uuid,
    split_part(name, '/', 2),
    true
  )
  and public.can_upload_resource_storage_object(metadata)
);
