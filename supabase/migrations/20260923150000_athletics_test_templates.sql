-- Tennis Player OS v0.24.0
-- Shared Athletics test definitions.
--
-- Test results and athlete-specific targets stay inside each athlete's
-- Athletics state. Only the reusable protocol/definition is shared.

create table if not exists public.athletics_test_templates (
  id uuid primary key default gen_random_uuid(),

  source_athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  source_test_id text not null
    check (length(trim(source_test_id)) > 0),

  definition jsonb not null
    check (jsonb_typeof(definition) = 'object'),

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_athlete_id, source_test_id)
);

comment on table public.athletics_test_templates is
  'Reusable Athletics test protocols published from athlete test definitions. Measurements and personal targets are never stored here.';

alter table public.athletics_test_templates enable row level security;

create index if not exists athletics_test_templates_source_athlete_idx
  on public.athletics_test_templates (source_athlete_id);

create index if not exists athletics_test_templates_updated_at_idx
  on public.athletics_test_templates (updated_at desc);

drop trigger if exists athletics_test_templates_set_updated_at
  on public.athletics_test_templates;

create trigger athletics_test_templates_set_updated_at
before update on public.athletics_test_templates
for each row
execute function public.set_updated_at();

revoke all on table public.athletics_test_templates
  from anon, authenticated;

grant select, insert, update, delete
  on table public.athletics_test_templates
  to authenticated;

drop policy if exists "athletics_test_templates_select"
  on public.athletics_test_templates;

create policy "athletics_test_templates_select"
on public.athletics_test_templates
for select
to authenticated
using (
  public.has_module_access(source_athlete_id, 'training', false)
);

drop policy if exists "athletics_test_templates_insert"
  on public.athletics_test_templates;

create policy "athletics_test_templates_insert"
on public.athletics_test_templates
for insert
to authenticated
with check (
  public.has_module_access(source_athlete_id, 'training', true)
  and (
    created_by is null
    or created_by = (select auth.uid())
  )
);

drop policy if exists "athletics_test_templates_update"
  on public.athletics_test_templates;

create policy "athletics_test_templates_update"
on public.athletics_test_templates
for update
to authenticated
using (
  public.has_module_access(source_athlete_id, 'training', true)
)
with check (
  public.has_module_access(source_athlete_id, 'training', true)
);

drop policy if exists "athletics_test_templates_delete"
  on public.athletics_test_templates;

create policy "athletics_test_templates_delete"
on public.athletics_test_templates
for delete
to authenticated
using (
  public.has_module_access(source_athlete_id, 'training', true)
);
