-- Tennis Player OS v1.1.4
-- Cross-device propagation for generic module state.
-- Enable Postgres Changes for athlete_module_state and include complete rows
-- in UPDATE/DELETE events so PWA clients can reconcile their local cache.

alter table public.athlete_module_state replica identity full;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'athlete_module_state'
  ) then
    alter publication supabase_realtime
      add table public.athlete_module_state;
  end if;
end;
$$;
