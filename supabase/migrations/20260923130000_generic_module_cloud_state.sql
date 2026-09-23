-- Tennis Player OS v0.23.0
-- Generic cloud persistence for non-Calendar module state.
--
-- Modules are still evolving rapidly. Their payload therefore remains JSONB
-- instead of being prematurely normalized into module-specific tables.
-- Calendar keeps its dedicated cloud schema.

create table if not exists public.athlete_module_state (
  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  module_key text not null
    check (length(trim(module_key)) > 0),

  payload jsonb not null default '{}'::jsonb,

  schema_version integer not null default 1
    check (schema_version >= 1),

  revision bigint not null default 1
    check (revision >= 1),

  updated_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, module_key)
);

comment on table public.athlete_module_state is
  'Generic JSONB state for evolving Tennis Player OS modules. Calendar uses dedicated tables.';

comment on column public.athlete_module_state.schema_version is
  'Version of the JSON payload shape for this module.';

comment on column public.athlete_module_state.revision is
  'Monotonic row revision used for optimistic concurrency checks.';

alter table public.athlete_module_state enable row level security;

create index if not exists athlete_module_state_updated_by_idx
  on public.athlete_module_state (updated_by);

create index if not exists athlete_module_state_updated_at_idx
  on public.athlete_module_state (updated_at desc);

create or replace function public.bump_athlete_module_state_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();

  if (select auth.uid()) is not null then
    new.updated_by := (select auth.uid());
  end if;

  return new;
end;
$$;

revoke all on function public.bump_athlete_module_state_revision()
  from public, anon, authenticated;

drop trigger if exists athlete_module_state_bump_revision
  on public.athlete_module_state;

create trigger athlete_module_state_bump_revision
before update on public.athlete_module_state
for each row
execute function public.bump_athlete_module_state_revision();

revoke all on table public.athlete_module_state
  from anon, authenticated;

grant select, insert, update, delete
  on table public.athlete_module_state
  to authenticated;

drop policy if exists "athlete_module_state_select"
  on public.athlete_module_state;

create policy "athlete_module_state_select"
on public.athlete_module_state
for select
to authenticated
using (
  public.has_module_access(athlete_id, module_key, false)
);

drop policy if exists "athlete_module_state_insert"
  on public.athlete_module_state;

create policy "athlete_module_state_insert"
on public.athlete_module_state
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, module_key, true)
  and (
    updated_by is null
    or updated_by = (select auth.uid())
  )
);

drop policy if exists "athlete_module_state_update"
  on public.athlete_module_state;

create policy "athlete_module_state_update"
on public.athlete_module_state
for update
to authenticated
using (
  public.has_module_access(athlete_id, module_key, true)
)
with check (
  public.has_module_access(athlete_id, module_key, true)
  and (
    updated_by is null
    or updated_by = (select auth.uid())
  )
);

drop policy if exists "athlete_module_state_delete"
  on public.athlete_module_state;

create policy "athlete_module_state_delete"
on public.athlete_module_state
for delete
to authenticated
using (
  public.has_module_access(athlete_id, module_key, true)
);
