-- Tennis Player OS
-- Atomic one-time import of the current local Calendar snapshot into Supabase.
-- The function refuses to run if any Calendar cloud data already exists for
-- the athlete, so a retry can never silently duplicate or overwrite data.

create or replace function public.import_calendar_snapshot(
  p_athlete_id uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  people_count integer := 0;
  series_count integer := 0;
  events_count integer := 0;
  tournaments_count integer := 0;
begin
  if p_athlete_id is null then
    raise exception 'athlete id is required';
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'calendar snapshot must be a JSON object';
  end if;

  if not public.has_module_access(p_athlete_id, 'calendar', true) then
    raise exception 'calendar write access denied'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.calendar_people where athlete_id = p_athlete_id
  ) or exists (
    select 1 from public.calendar_recurring_series where athlete_id = p_athlete_id
  ) or exists (
    select 1 from public.calendar_events where athlete_id = p_athlete_id
  ) or exists (
    select 1 from public.calendar_tournaments where athlete_id = p_athlete_id
  ) or exists (
    select 1 from public.calendar_settings where athlete_id = p_athlete_id
  ) then
    raise exception 'calendar cloud data already exists for this athlete; import aborted';
  end if;

  -- People / support network
  for item in
    select value
    from jsonb_array_elements(coalesce(p_snapshot -> 'people', '[]'::jsonb))
  loop
    if coalesce(item ->> 'id', '') = '' or coalesce(item ->> 'name', '') = '' then
      raise exception 'invalid calendar person in local snapshot';
    end if;

    insert into public.calendar_people (
      athlete_id, id, name, relationship
    )
    values (
      p_athlete_id,
      item ->> 'id',
      item ->> 'name',
      nullif(item ->> 'relationship', '')
    );

    people_count := people_count + 1;
  end loop;

  -- Recurring series
  for item in
    select value
    from jsonb_array_elements(coalesce(p_snapshot -> 'recurringSeries', '[]'::jsonb))
  loop
    if coalesce(item ->> 'id', '') = ''
       or coalesce(item ->> 'startDate', '') = '' then
      raise exception 'invalid recurring series in local snapshot';
    end if;

    insert into public.calendar_recurring_series (
      athlete_id,
      id,
      start_date,
      interval_weeks,
      generated_through,
      active,
      template
    )
    values (
      p_athlete_id,
      item ->> 'id',
      (item ->> 'startDate')::date,
      greatest(1, least(52, coalesce(nullif(item ->> 'intervalWeeks', '')::integer, 1))),
      nullif(item ->> 'generatedThrough', '')::date,
      coalesce((item ->> 'active')::boolean, true),
      coalesce(item -> 'template', '{}'::jsonb)
    );

    series_count := series_count + 1;
  end loop;

  -- Calendar events
  for item in
    select value
    from jsonb_array_elements(coalesce(p_snapshot -> 'events', '[]'::jsonb))
  loop
    if coalesce(item ->> 'id', '') = ''
       or coalesce(item ->> 'title', '') = ''
       or coalesce(item ->> 'date', '') = ''
       or coalesce(item ->> 'category', '') = ''
       or coalesce(item ->> 'startTime', '') = ''
       or coalesce(item ->> 'endTime', '') = '' then
      raise exception 'invalid calendar event in local snapshot';
    end if;

    insert into public.calendar_events (
      athlete_id,
      id,
      series_id,
      title,
      event_date,
      category,
      start_time,
      end_time,
      location,
      notes,
      companion_id,
      nutrition_template_id,
      meal_type,
      meal_details,
      extra
    )
    values (
      p_athlete_id,
      item ->> 'id',
      nullif(item ->> 'seriesId', ''),
      item ->> 'title',
      (item ->> 'date')::date,
      item ->> 'category',
      (item ->> 'startTime')::time,
      (item ->> 'endTime')::time,
      nullif(item ->> 'location', ''),
      nullif(item ->> 'notes', ''),
      coalesce(
        nullif(item ->> 'companionId', ''),
        nullif(item #>> '{responsibilities,stay}', '')
      ),
      nullif(item ->> 'nutritionTemplateId', ''),
      nullif(item ->> 'mealType', ''),
      nullif(item ->> 'mealDetails', ''),
      item
    );

    events_count := events_count + 1;
  end loop;

  -- Tournament planning
  for item in
    select value
    from jsonb_array_elements(coalesce(p_snapshot -> 'tournaments', '[]'::jsonb))
  loop
    if coalesce(item ->> 'id', '') = ''
       or coalesce(item ->> 'name', '') = ''
       or coalesce(item ->> 'startDate', '') = '' then
      raise exception 'invalid tournament in local snapshot';
    end if;

    insert into public.calendar_tournaments (
      athlete_id,
      id,
      name,
      circuit,
      age_category,
      start_date,
      end_date,
      location,
      surface,
      priority,
      status,
      registration_deadline,
      support_person_id,
      notes,
      extra
    )
    values (
      p_athlete_id,
      item ->> 'id',
      item ->> 'name',
      nullif(item ->> 'circuit', ''),
      nullif(item ->> 'ageCategory', ''),
      (item ->> 'startDate')::date,
      coalesce(
        nullif(item ->> 'endDate', '')::date,
        (item ->> 'startDate')::date
      ),
      nullif(item ->> 'location', ''),
      nullif(item ->> 'surface', ''),
      nullif(item ->> 'priority', ''),
      nullif(item ->> 'status', ''),
      nullif(item ->> 'registrationDeadline', '')::date,
      nullif(item ->> 'supportPersonId', ''),
      nullif(item ->> 'notes', ''),
      item
    );

    tournaments_count := tournaments_count + 1;
  end loop;

  -- Per-athlete Calendar settings
  insert into public.calendar_settings (
    athlete_id,
    location_defaults
  )
  values (
    p_athlete_id,
    case
      when jsonb_typeof(p_snapshot -> 'locationDefaults') = 'object'
        then p_snapshot -> 'locationDefaults'
      else '{}'::jsonb
    end
  );

  return jsonb_build_object(
    'people', people_count,
    'recurringSeries', series_count,
    'events', events_count,
    'tournaments', tournaments_count,
    'settings', 1
  );
end;
$$;

revoke all on function public.import_calendar_snapshot(uuid, jsonb)
  from public, anon;

grant execute on function public.import_calendar_snapshot(uuid, jsonb)
  to authenticated;
