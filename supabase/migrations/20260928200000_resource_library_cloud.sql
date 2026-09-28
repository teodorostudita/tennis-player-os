-- Tennis Player OS v1.0.10
-- Cloud persistence for module Resource Libraries.
--
-- Structured module data continues to use athlete_module_state or the
-- module-specific tables already present. Binary resources live in a private
-- Supabase Storage bucket, while searchable metadata lives in this table.

create table if not exists public.resource_library_items (
  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  id text not null,
  module_key text not null
    check (length(trim(module_key)) > 0),

  kind text not null
    check (kind in ('file', 'link')),

  link_type text,
  youtube_id text,
  title text not null default '',
  notes text not null default '',
  url text,
  file_name text,
  mime_type text,
  size_bytes bigint not null default 0
    check (size_bytes >= 0),
  storage_path text,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,
  updated_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, id),

  constraint resource_library_file_shape check (
    (
      kind = 'file'
      and storage_path is not null
      and length(trim(storage_path)) > 0
    )
    or (
      kind = 'link'
      and url is not null
      and length(trim(url)) > 0
    )
  )
);

comment on table public.resource_library_items is
  'Cloud metadata for Tennis Player OS module libraries; file bytes live in the private tpos-resources Storage bucket.';

create index if not exists resource_library_items_module_idx
  on public.resource_library_items (athlete_id, module_key, created_at desc);

alter table public.resource_library_items enable row level security;

create or replace function public.touch_resource_library_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  if (select auth.uid()) is not null then
    new.updated_by := (select auth.uid());
  end if;

  return new;
end;
$$;

revoke all on function public.touch_resource_library_item()
  from public, anon, authenticated;

drop trigger if exists touch_resource_library_item
  on public.resource_library_items;

create trigger touch_resource_library_item
before update on public.resource_library_items
for each row
execute function public.touch_resource_library_item();

revoke all on table public.resource_library_items
  from anon, authenticated;

grant select, insert, update, delete
  on table public.resource_library_items
  to authenticated;

drop policy if exists "resource_library_items_select"
  on public.resource_library_items;

create policy "resource_library_items_select"
on public.resource_library_items
for select
to authenticated
using (
  public.has_module_access(athlete_id, module_key, false)
);

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
);

drop policy if exists "resource_library_items_delete"
  on public.resource_library_items;

create policy "resource_library_items_delete"
on public.resource_library_items
for delete
to authenticated
using (
  public.has_module_access(athlete_id, module_key, true)
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit
)
values (
  'tpos-resources',
  'tpos-resources',
  false,
  209715200
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "tpos_resources_select"
  on storage.objects;

create policy "tpos_resources_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tpos-resources'
  and public.has_module_access(
    split_part(name, '/', 1)::uuid,
    split_part(name, '/', 2),
    false
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
);

drop policy if exists "tpos_resources_delete"
  on storage.objects;

create policy "tpos_resources_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tpos-resources'
  and public.has_module_access(
    split_part(name, '/', 1)::uuid,
    split_part(name, '/', 2),
    true
  )
);
