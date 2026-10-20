-- Tennis Player OS v1.3.0
-- Modulo 13 "VR Lab": sessioni di allenamento WebXR (Meta Quest).
-- Una riga per serie completata; i singoli lanci stanno in `trials` (jsonb).
-- Accesso tramite has_module_access(athlete_id, 'vr', …): per ora il modulo
-- non è concedibile ai member, quindi è di fatto riservato a owner/admin.

create table if not exists public.vr_training_sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  recorded_by uuid references auth.users(id) on delete set null default auth.uid(),
  drill_key text not null check (length(trim(drill_key)) > 0),
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  trial_count integer not null check (trial_count between 1 and 200),
  mean_error_cm numeric(7,1),
  median_error_cm numeric(7,1),
  settings jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  trials jsonb not null default '[]'::jsonb check (jsonb_typeof(trials) = 'array'),
  device text not null default '',
  app_version text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.vr_training_sessions is
  'VR Lab (module key vr): one row per completed WebXR training series; per-trial data in trials jsonb.';

create index if not exists vr_training_sessions_athlete_idx
  on public.vr_training_sessions (athlete_id, drill_key, completed_at desc);

create index if not exists vr_training_sessions_recorded_by_idx
  on public.vr_training_sessions (recorded_by);

alter table public.vr_training_sessions enable row level security;

revoke all on table public.vr_training_sessions from anon, authenticated;
grant select, insert, delete on table public.vr_training_sessions to authenticated;

drop policy if exists "vr_training_sessions_select" on public.vr_training_sessions;
create policy "vr_training_sessions_select"
on public.vr_training_sessions
for select to authenticated
using (public.has_module_access(athlete_id, 'vr', false));

drop policy if exists "vr_training_sessions_insert" on public.vr_training_sessions;
create policy "vr_training_sessions_insert"
on public.vr_training_sessions
for insert to authenticated
with check (
  public.has_module_access(athlete_id, 'vr', true)
  and recorded_by = (select auth.uid())
);

drop policy if exists "vr_training_sessions_delete" on public.vr_training_sessions;
create policy "vr_training_sessions_delete"
on public.vr_training_sessions
for delete to authenticated
using (public.is_athlete_admin(athlete_id));
