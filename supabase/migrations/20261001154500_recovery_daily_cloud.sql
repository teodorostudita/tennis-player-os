-- Tennis Player OS v1.1.7
-- Dedicated record-level cloud persistence for Recovery check-ins and training checkout.
-- This avoids whole-JSON conflicts between devices.

create table if not exists public.athlete_recovery_checkins (
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  log_date date not null,
  sleep_hours numeric(5,2),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  fatigue smallint check (fatigue between 1 and 5),
  soreness smallint check (soreness between 1 and 5),
  soreness_scope text not null default 'general'
    check (soreness_scope in ('general', 'localized')),
  mood smallint check (mood between 1 and 5),
  motivation smallint check (motivation between 1 and 5),
  concentration smallint check (concentration between 1 and 5),
  notes text not null default '',
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, log_date)
);

create table if not exists public.athlete_training_checkouts (
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  log_date date not null,
  trained boolean not null default true,
  quality smallint check (quality between 1 and 5),
  notes text not null default '',
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, log_date)
);

create index if not exists athlete_recovery_checkins_date_idx
  on public.athlete_recovery_checkins (athlete_id, log_date desc);

create index if not exists athlete_training_checkouts_date_idx
  on public.athlete_training_checkouts (athlete_id, log_date desc);

create or replace function public.touch_recovery_daily_row()
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

revoke all on function public.touch_recovery_daily_row()
  from public, anon, authenticated;

drop trigger if exists athlete_recovery_checkins_touch
  on public.athlete_recovery_checkins;
create trigger athlete_recovery_checkins_touch
before update on public.athlete_recovery_checkins
for each row execute function public.touch_recovery_daily_row();

drop trigger if exists athlete_training_checkouts_touch
  on public.athlete_training_checkouts;
create trigger athlete_training_checkouts_touch
before update on public.athlete_training_checkouts
for each row execute function public.touch_recovery_daily_row();

alter table public.athlete_recovery_checkins enable row level security;
alter table public.athlete_training_checkouts enable row level security;

revoke all on public.athlete_recovery_checkins from anon, authenticated;
revoke all on public.athlete_training_checkouts from anon, authenticated;
grant select, insert, update, delete on public.athlete_recovery_checkins to authenticated;
grant select, insert, update, delete on public.athlete_training_checkouts to authenticated;

drop policy if exists "recovery_checkins_select" on public.athlete_recovery_checkins;
create policy "recovery_checkins_select"
on public.athlete_recovery_checkins
for select to authenticated
using (public.has_module_access(athlete_id, 'nutrition', false));

drop policy if exists "recovery_checkins_insert" on public.athlete_recovery_checkins;
create policy "recovery_checkins_insert"
on public.athlete_recovery_checkins
for insert to authenticated
with check (
  public.has_module_access(athlete_id, 'nutrition', true)
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists "recovery_checkins_update" on public.athlete_recovery_checkins;
create policy "recovery_checkins_update"
on public.athlete_recovery_checkins
for update to authenticated
using (public.has_module_access(athlete_id, 'nutrition', true))
with check (
  public.has_module_access(athlete_id, 'nutrition', true)
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists "recovery_checkins_delete" on public.athlete_recovery_checkins;
create policy "recovery_checkins_delete"
on public.athlete_recovery_checkins
for delete to authenticated
using (public.has_module_access(athlete_id, 'nutrition', true));

drop policy if exists "training_checkouts_select" on public.athlete_training_checkouts;
create policy "training_checkouts_select"
on public.athlete_training_checkouts
for select to authenticated
using (public.has_module_access(athlete_id, 'nutrition', false));

drop policy if exists "training_checkouts_insert" on public.athlete_training_checkouts;
create policy "training_checkouts_insert"
on public.athlete_training_checkouts
for insert to authenticated
with check (
  public.has_module_access(athlete_id, 'nutrition', true)
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists "training_checkouts_update" on public.athlete_training_checkouts;
create policy "training_checkouts_update"
on public.athlete_training_checkouts
for update to authenticated
using (public.has_module_access(athlete_id, 'nutrition', true))
with check (
  public.has_module_access(athlete_id, 'nutrition', true)
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists "training_checkouts_delete" on public.athlete_training_checkouts;
create policy "training_checkouts_delete"
on public.athlete_training_checkouts
for delete to authenticated
using (public.has_module_access(athlete_id, 'nutrition', true));
