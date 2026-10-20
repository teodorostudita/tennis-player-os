-- Tennis Player OS v1.3.6
-- VR Lab: diagnostica tecnica delle sessioni WebXR inviata dal visore.
-- Una riga per sessione immersiva, aggiornata periodicamente (upsert per id),
-- così resta l'ultimo stato anche se la pagina viene chiusa o si blocca.

create table if not exists public.vr_client_diagnostics (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_agent text not null default '',
  app_version text not null default '',
  payload jsonb not null default '{}'::jsonb
    check (pg_column_size(payload) < 65536)
);

comment on table public.vr_client_diagnostics is
  'VR Lab technical diagnostics (frames, errors, XR session events) sent from the headset; one row per immersive session.';

create index if not exists vr_client_diagnostics_user_idx
  on public.vr_client_diagnostics (user_id, updated_at desc);

alter table public.vr_client_diagnostics enable row level security;

revoke all on table public.vr_client_diagnostics from anon, authenticated;
grant select, insert, update on table public.vr_client_diagnostics to authenticated;

drop policy if exists "vr_client_diagnostics_select_own" on public.vr_client_diagnostics;
create policy "vr_client_diagnostics_select_own"
on public.vr_client_diagnostics
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "vr_client_diagnostics_insert_own" on public.vr_client_diagnostics;
create policy "vr_client_diagnostics_insert_own"
on public.vr_client_diagnostics
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "vr_client_diagnostics_update_own" on public.vr_client_diagnostics;
create policy "vr_client_diagnostics_update_own"
on public.vr_client_diagnostics
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
