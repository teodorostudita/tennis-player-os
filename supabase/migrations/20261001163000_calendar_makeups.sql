-- Tennis Player OS v1.2.0
-- Calendar recoveries: sessions that were missed and may need to be made up.
-- Records are independent from calendar_events so the debt survives rescheduling
-- and remains available to the future Parent contextual Home.

create table if not exists public.calendar_makeups (
  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  id text not null,
  original_event_id text,
  original_series_id text,
  original_date date not null,
  original_snapshot jsonb not null default '{}'::jsonb,

  reason text,
  notes text,

  status text not null default 'pending'
    check (status in ('pending', 'planned', 'recovered', 'waived')),

  scheduled_event_id text,
  scheduled_date date,
  scheduled_start_time time without time zone,
  scheduled_end_time time without time zone,

  recovered_at timestamptz,
  waived_at timestamptz,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, id),

  constraint calendar_makeups_scheduled_time_order
    check (
      scheduled_start_time is null
      or scheduled_end_time is null
      or scheduled_end_time > scheduled_start_time
    )
);

alter table public.calendar_makeups enable row level security;

create index if not exists calendar_makeups_athlete_status_idx
  on public.calendar_makeups (athlete_id, status, original_date);

create index if not exists calendar_makeups_scheduled_date_idx
  on public.calendar_makeups (athlete_id, scheduled_date)
  where scheduled_date is not null;

create trigger calendar_makeups_set_updated_at
before update on public.calendar_makeups
for each row
execute function public.set_updated_at();

revoke all on table public.calendar_makeups from anon, authenticated;

grant select, insert, update, delete
  on table public.calendar_makeups
  to authenticated;

create policy "calendar_makeups_select"
on public.calendar_makeups
for select
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', false)
);

create policy "calendar_makeups_insert"
on public.calendar_makeups
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_makeups_update"
on public.calendar_makeups
for update
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
)
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_makeups_delete"
on public.calendar_makeups
for delete
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
);
