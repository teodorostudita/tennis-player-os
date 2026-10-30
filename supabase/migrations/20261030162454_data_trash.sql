-- Server-side recycle bin (v1.3.16).
--
-- On 25/10/2026 a client bug deleted the whole calendar of an athlete and the
-- Free plan has no accessible backups. Every row deleted from the calendar
-- tables or from athlete_module_state, and every overwritten version of those
-- rows, is copied here before it is lost, whatever client or bug caused it.
-- Rows are kept 30 days. Restore with jsonb_populate_record on row_data.
--
-- Clients have no access: RLS is enabled without policies, and the trigger
-- function runs as its owner.

create table if not exists public.data_trash (
  id bigint generated always as identity primary key,
  table_name text not null,
  operation text not null check (operation in ('DELETE', 'UPDATE')),
  athlete_id uuid,
  row_data jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists data_trash_lookup_idx
  on public.data_trash (athlete_id, table_name, changed_at desc);

create index if not exists data_trash_changed_at_idx
  on public.data_trash (changed_at);

alter table public.data_trash enable row level security;

revoke all on table public.data_trash from anon, authenticated;

comment on table public.data_trash is
  'Cestino lato server: righe cancellate o sovrascritte di calendar_* e athlete_module_state, conservate 30 giorni.';

create or replace function public.keep_in_data_trash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb := to_jsonb(old);
begin
  if tg_op = 'UPDATE' then
    -- Bookkeeping columns change on every save: only real content changes
    -- are worth keeping.
    if (old_row - 'updated_at' - 'updated_by' - 'revision')
       = (to_jsonb(new) - 'updated_at' - 'updated_by' - 'revision') then
      return null;
    end if;
  end if;

  insert into public.data_trash (table_name, operation, athlete_id, row_data, changed_by)
  values (
    tg_table_name,
    tg_op,
    nullif(old_row ->> 'athlete_id', '')::uuid,
    old_row,
    auth.uid()
  );

  -- Occasional cleanup instead of a scheduled job (pg_cron is not enabled).
  if random() < 0.01 then
    delete from public.data_trash where changed_at < now() - interval '30 days';
  end if;

  return null;
end;
$$;

revoke all on function public.keep_in_data_trash() from public, anon, authenticated;

do $$
declare
  target text;
begin
  foreach target in array array[
    'calendar_people',
    'calendar_recurring_series',
    'calendar_events',
    'calendar_tournaments',
    'calendar_series_exceptions',
    'calendar_makeups',
    'calendar_settings',
    'athlete_module_state'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', target || '_data_trash', target);
    execute format(
      'create trigger %I after update or delete on public.%I
         for each row execute function public.keep_in_data_trash()',
      target || '_data_trash',
      target
    );
  end loop;
end;
$$;
