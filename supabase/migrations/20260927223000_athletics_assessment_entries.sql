-- Tennis Player OS v1.0.4
-- Athletics coach assessment history.

create table if not exists public.athletics_assessment_entries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  metric_key text not null check (length(trim(metric_key)) > 0),
  component_key text not null default 'main' check (length(trim(component_key)) > 0),
  assessed_on date not null,
  value numeric(4,1) not null check (value >= 1 and value <= 10),
  evaluator_user_id uuid references auth.users(id) on delete set null,
  evaluator_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, metric_key, component_key, assessed_on)
);

comment on table public.athletics_assessment_entries is
  'Longitudinal 1-10 coach assessments for Athletics. Distinct from objective Tests.';

create index if not exists athletics_assessment_entries_athlete_idx
  on public.athletics_assessment_entries (athlete_id, metric_key, component_key, assessed_on);

alter table public.athletics_assessment_entries enable row level security;

revoke all on table public.athletics_assessment_entries from anon, authenticated;
grant select, insert, update, delete on table public.athletics_assessment_entries to authenticated;

drop policy if exists "athletics_assessment_entries_select" on public.athletics_assessment_entries;
create policy "athletics_assessment_entries_select"
on public.athletics_assessment_entries
for select to authenticated
using (public.has_module_access(athlete_id, 'training', false));

drop policy if exists "athletics_assessment_entries_insert" on public.athletics_assessment_entries;
create policy "athletics_assessment_entries_insert"
on public.athletics_assessment_entries
for insert to authenticated
with check (
  public.has_module_access(athlete_id, 'training', true)
  and evaluator_user_id = (select auth.uid())
);

drop policy if exists "athletics_assessment_entries_update" on public.athletics_assessment_entries;
create policy "athletics_assessment_entries_update"
on public.athletics_assessment_entries
for update to authenticated
using (
  public.has_module_access(athlete_id, 'training', true)
  and (public.is_athlete_admin(athlete_id) or evaluator_user_id = (select auth.uid()))
)
with check (
  public.has_module_access(athlete_id, 'training', true)
  and (public.is_athlete_admin(athlete_id) or evaluator_user_id = (select auth.uid()))
);

drop policy if exists "athletics_assessment_entries_delete" on public.athletics_assessment_entries;
create policy "athletics_assessment_entries_delete"
on public.athletics_assessment_entries
for delete to authenticated
using (
  public.has_module_access(athlete_id, 'training', true)
  and (public.is_athlete_admin(athlete_id) or evaluator_user_id = (select auth.uid()))
);
