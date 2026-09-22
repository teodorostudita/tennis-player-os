-- Tennis Player OS
-- Compact recurring Calendar storage, preserving modified occurrences.
--
-- A recurring occurrence can now be represented as:
--   • implicit: generated from calendar_recurring_series
--   • skip:     an expected occurrence intentionally absent
--   • override: an expected occurrence whose payload differs from the template
--
-- Historical/off-grid occurrences remain materialized in calendar_events.

-- If the previous failed attempt left this brand-new table behind outside a
-- transaction, remove it. No production data can legitimately exist in it yet.
drop table if exists public.calendar_series_exceptions cascade;

create table public.calendar_series_exceptions (
  athlete_id uuid not null,
  series_id text not null,
  occurrence_date date not null,

  kind text not null
    check (kind in ('skip', 'override')),

  payload jsonb not null default '{}'::jsonb,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, series_id, occurrence_date),

  constraint calendar_series_exceptions_series_fk
    foreign key (athlete_id, series_id)
    references public.calendar_recurring_series (athlete_id, id)
    on delete cascade
);

alter table public.calendar_series_exceptions enable row level security;

create index calendar_series_exceptions_athlete_date_idx
  on public.calendar_series_exceptions (athlete_id, occurrence_date);

create trigger calendar_series_exceptions_set_updated_at
before update on public.calendar_series_exceptions
for each row
execute function public.set_updated_at();

revoke all on table public.calendar_series_exceptions from anon, authenticated;

grant select, insert, update, delete
  on table public.calendar_series_exceptions
  to authenticated;

create policy "calendar_series_exceptions_select"
on public.calendar_series_exceptions
for select
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', false)
);

create policy "calendar_series_exceptions_insert"
on public.calendar_series_exceptions
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_series_exceptions_update"
on public.calendar_series_exceptions
for update
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
)
with check (
  public.has_module_access(athlete_id, 'calendar', true)
);

create policy "calendar_series_exceptions_delete"
on public.calendar_series_exceptions
for delete
to authenticated
using (
  public.has_module_access(athlete_id, 'calendar', true)
);


-- ---------------------------------------------------------------------------
-- Preserve modified on-grid occurrences as overrides.
-- We compact only occurrences that:
--   • belong to an active series,
--   • lie inside the already-generated horizon,
--   • fall exactly on the recurrence grid.
-- ---------------------------------------------------------------------------

insert into public.calendar_series_exceptions (
  athlete_id,
  series_id,
  occurrence_date,
  kind,
  payload
)
select
  e.athlete_id,
  e.series_id,
  e.event_date,
  'override',
  coalesce(e.extra, '{}'::jsonb)
from public.calendar_events e
join public.calendar_recurring_series s
  on s.athlete_id = e.athlete_id
 and s.id = e.series_id
where s.active is not false
  and s.generated_through is not null
  and e.event_date between s.start_date and s.generated_through
  and ((e.event_date - s.start_date) % (7 * s.interval_weeks) = 0)
  and (
    (coalesce(e.extra, '{}'::jsonb) - 'id' - 'seriesId' - 'date')
    <>
    (coalesce(s.template, '{}'::jsonb) - 'id' - 'seriesId' - 'date')
  )
on conflict (athlete_id, series_id, occurrence_date)
do update set
  kind = excluded.kind,
  payload = excluded.payload,
  updated_at = now();


-- ---------------------------------------------------------------------------
-- Preserve expected but missing on-grid occurrences as skips.
-- ---------------------------------------------------------------------------

insert into public.calendar_series_exceptions (
  athlete_id,
  series_id,
  occurrence_date,
  kind,
  payload
)
select
  s.athlete_id,
  s.id,
  generated.occurrence_date::date,
  'skip',
  '{}'::jsonb
from public.calendar_recurring_series s
cross join lateral generate_series(
  s.start_date::timestamp,
  s.generated_through::timestamp,
  make_interval(weeks => s.interval_weeks)
) as generated(occurrence_date)
where s.generated_through is not null
  and s.active is not false
  and not exists (
    select 1
    from public.calendar_events e
    where e.athlete_id = s.athlete_id
      and e.series_id = s.id
      and e.event_date = generated.occurrence_date::date
  )
on conflict (athlete_id, series_id, occurrence_date)
do nothing;


-- ---------------------------------------------------------------------------
-- Remove only the on-grid materialized occurrences that can now be rebuilt
-- exactly from series + exceptions. Historical and off-grid events stay.
-- ---------------------------------------------------------------------------

delete from public.calendar_events e
using public.calendar_recurring_series s
where e.athlete_id = s.athlete_id
  and e.series_id = s.id
  and s.active is not false
  and s.generated_through is not null
  and e.event_date between s.start_date and s.generated_through
  and ((e.event_date - s.start_date) % (7 * s.interval_weeks) = 0);
