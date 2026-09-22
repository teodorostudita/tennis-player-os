-- Tennis Player OS
-- Calendar cloud schema
-- Keeps the current frontend model (people, events, recurring series,
-- tournaments and location defaults) while adding per-athlete RLS.

-- ---------------------------------------------------------------------------
-- 1. Calendar people / support network
-- ---------------------------------------------------------------------------

create table public.calendar_people (
  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  id text not null,
  name text not null,
  relationship text,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, id)
);

alter table public.calendar_people enable row level security;

create index calendar_people_athlete_idx
  on public.calendar_people (athlete_id);

create trigger calendar_people_set_updated_at
before update on public.calendar_people
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. Recurring calendar series
-- The template intentionally remains JSONB because the Calendar event model
-- can evolve without a migration for every new optional field.
-- ---------------------------------------------------------------------------

create table public.calendar_recurring_series (
  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  id text not null,
  start_date date not null,
  interval_weeks integer not null default 1
    check (interval_weeks between 1 and 52),

  generated_through date,
  active boolean not null default true,
  template jsonb not null default '{}'::jsonb,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, id)
);

alter table public.calendar_recurring_series enable row level security;

create index calendar_recurring_series_athlete_idx
  on public.calendar_recurring_series (athlete_id);

create index calendar_recurring_series_start_date_idx
  on public.calendar_recurring_series (athlete_id, start_date);

create trigger calendar_recurring_series_set_updated_at
before update on public.calendar_recurring_series
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. Calendar events
-- IDs stay TEXT so existing local IDs can be migrated without rewriting them.
-- Optional fields used by Nutrition events are first-class columns.
-- extra keeps forward compatibility for future Calendar fields.
-- ---------------------------------------------------------------------------

create table public.calendar_events (
  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  id text not null,
  series_id text,

  title text not null,
  event_date date not null,
  category text not null,

  start_time time without time zone not null,
  end_time time without time zone not null,

  location text,
  notes text,

  companion_id text,

  nutrition_template_id text,
  meal_type text,
  meal_details text,

  extra jsonb not null default '{}'::jsonb,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, id),

  constraint calendar_events_time_order
    check (end_time > start_time)
);

alter table public.calendar_events enable row level security;

create index calendar_events_athlete_date_idx
  on public.calendar_events (athlete_id, event_date);

create index calendar_events_series_idx
  on public.calendar_events (athlete_id, series_id)
  where series_id is not null;

create trigger calendar_events_set_updated_at
before update on public.calendar_events
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. Tournament planning
-- ---------------------------------------------------------------------------

create table public.calendar_tournaments (
  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  id text not null,

  name text not null,
  circuit text,
  age_category text,

  start_date date not null,
  end_date date not null,

  location text,
  surface text,
  priority text,
  status text,

  registration_deadline date,
  support_person_id text,
  notes text,

  extra jsonb not null default '{}'::jsonb,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, id),

  constraint calendar_tournaments_date_order
    check (end_date >= start_date)
);

alter table public.calendar_tournaments enable row level security;

create index calendar_tournaments_athlete_dates_idx
  on public.calendar_tournaments (athlete_id, start_date, end_date);

create trigger calendar_tournaments_set_updated_at
before update on public.calendar_tournaments
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 5. Per-athlete Calendar settings
-- location_defaults mirrors planner.locationDefaults from the current app.
-- ---------------------------------------------------------------------------

create table public.calendar_settings (
  athlete_id uuid primary key
    references public.athletes(id) on delete cascade,

  location_defaults jsonb not null default '{}'::jsonb,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_settings enable row level security;

create trigger calendar_settings_set_updated_at
before update on public.calendar_settings
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 6. Privileges
-- Anonymous users get no access. RLS below decides access for authenticated
-- users through the existing Calendar module permission.
-- ---------------------------------------------------------------------------

revoke all on table public.calendar_people from anon, authenticated;
revoke all on table public.calendar_recurring_series from anon, authenticated;
revoke all on table public.calendar_events from anon, authenticated;
revoke all on table public.calendar_tournaments from anon, authenticated;
revoke all on table public.calendar_settings from anon, authenticated;

grant select, insert, update, delete
  on table public.calendar_people
  to authenticated;

grant select, insert, update, delete
  on table public.calendar_recurring_series
  to authenticated;

grant select, insert, update, delete
  on table public.calendar_events
  to authenticated;

grant select, insert, update, delete
  on table public.calendar_tournaments
  to authenticated;

grant select, insert, update, delete
  on table public.calendar_settings
  to authenticated;


-- ---------------------------------------------------------------------------
-- 7. RLS policies
-- owner/admin already receive implicit full module access through
-- public.has_module_access().
-- ---------------------------------------------------------------------------

create policy "calendar_people_select"
on public.calendar_people
for select
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', false)
);

create policy "calendar_people_insert"
on public.calendar_people
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_people_update"
on public.calendar_people
for update
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
)
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_people_delete"
on public.calendar_people
for delete
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
);


create policy "calendar_recurring_series_select"
on public.calendar_recurring_series
for select
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', false)
);

create policy "calendar_recurring_series_insert"
on public.calendar_recurring_series
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_recurring_series_update"
on public.calendar_recurring_series
for update
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
)
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_recurring_series_delete"
on public.calendar_recurring_series
for delete
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
);


create policy "calendar_events_select"
on public.calendar_events
for select
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', false)
);

create policy "calendar_events_insert"
on public.calendar_events
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_events_update"
on public.calendar_events
for update
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
)
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_events_delete"
on public.calendar_events
for delete
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
);


create policy "calendar_tournaments_select"
on public.calendar_tournaments
for select
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', false)
);

create policy "calendar_tournaments_insert"
on public.calendar_tournaments
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_tournaments_update"
on public.calendar_tournaments
for update
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
)
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_tournaments_delete"
on public.calendar_tournaments
for delete
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
);


create policy "calendar_settings_select"
on public.calendar_settings
for select
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', false)
);

create policy "calendar_settings_insert"
on public.calendar_settings
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_settings_update"
on public.calendar_settings
for update
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
)
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_settings_delete"
on public.calendar_settings
for delete
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
);
