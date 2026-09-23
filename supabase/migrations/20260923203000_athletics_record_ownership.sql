-- Tennis Player OS v0.25.5
-- Athletics record ownership (B + C model).
--
-- Replaces the single mutable Athletics JSON blob with individually protected
-- records. The legacy athlete_module_state/training row is left untouched as a
-- historical backup and is migrated into the new table once.

create table if not exists public.athletics_records (
  id uuid primary key default gen_random_uuid(),

  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  record_type text not null
    check (record_type in ('weekly_program', 'test', 'test_result', 'session', 'goal')),

  client_id text not null
    check (length(trim(client_id)) > 0),

  owner_user_id uuid
    references auth.users(id) on delete set null,

  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),

  revision bigint not null default 1
    check (revision >= 1),

  created_by uuid
    references auth.users(id) on delete set null,

  updated_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (athlete_id, record_type, client_id)
);

comment on table public.athletics_records is
  'Athletics entities stored individually so responsibility and RLS can be enforced per record.';

comment on column public.athletics_records.owner_user_id is
  'Member responsible for this record. Owner/admin may reassign responsibility.';

alter table public.athletics_records enable row level security;

create index if not exists athletics_records_athlete_idx
  on public.athletics_records (athlete_id, record_type);

create index if not exists athletics_records_owner_idx
  on public.athletics_records (owner_user_id);

create index if not exists athletics_records_updated_idx
  on public.athletics_records (updated_at desc);


-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_active_athlete_member_user(
  p_athlete_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id is not null
    and exists (
      select 1
      from public.athlete_members am
      where am.athlete_id = p_athlete_id
        and am.user_id = p_user_id
        and am.status = 'active'
    );
$$;

revoke all on function public.is_active_athlete_member_user(uuid, uuid)
  from public, anon;

grant execute on function public.is_active_athlete_member_user(uuid, uuid)
  to authenticated;


-- Canonical audit fields and immutable identity.
create or replace function public.prepare_athletics_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := v_uid;
    end if;

    if new.updated_by is null then
      new.updated_by := v_uid;
    end if;

    if new.owner_user_id is null then
      new.owner_user_id := v_uid;
    end if;

    new.revision := greatest(coalesce(new.revision, 1), 1);
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();

    return new;
  end if;

  if new.athlete_id is distinct from old.athlete_id
    or new.record_type is distinct from old.record_type
    or new.client_id is distinct from old.client_id
    or new.created_by is distinct from old.created_by
  then
    raise exception 'Athletics record identity is immutable.'
      using errcode = '42501';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id
    and not public.is_athlete_admin(old.athlete_id)
  then
    raise exception 'Only athlete owner/admin may reassign Athletics responsibility.'
      using errcode = '42501';
  end if;

  new.revision := old.revision + 1;
  new.updated_at := now();

  if v_uid is not null then
    new.updated_by := v_uid;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_athletics_record()
  from public, anon, authenticated;

drop trigger if exists athletics_records_prepare
  on public.athletics_records;

create trigger athletics_records_prepare
before insert or update on public.athletics_records
for each row
execute function public.prepare_athletics_record();


-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------

revoke all on table public.athletics_records
  from anon, authenticated;

grant select, insert, update, delete
  on table public.athletics_records
  to authenticated;

create policy "athletics_records_select"
on public.athletics_records
for select
to authenticated
using (
  public.has_module_access(athlete_id, 'training', false)
);

create policy "athletics_records_insert"
on public.athletics_records
for insert
to authenticated
with check (
  public.has_module_access(athlete_id, 'training', true)
  and public.is_active_athlete_member_user(athlete_id, owner_user_id)
  and (
    public.is_athlete_admin(athlete_id)
    or (
      record_type <> 'weekly_program'
      and owner_user_id = (select auth.uid())
      and created_by = (select auth.uid())
    )
  )
);

create policy "athletics_records_update"
on public.athletics_records
for update
to authenticated
using (
  public.has_module_access(athlete_id, 'training', true)
  and (
    public.is_athlete_admin(athlete_id)
    or (
      record_type <> 'weekly_program'
      and owner_user_id = (select auth.uid())
    )
  )
)
with check (
  public.has_module_access(athlete_id, 'training', true)
  and public.is_active_athlete_member_user(athlete_id, owner_user_id)
  and (
    public.is_athlete_admin(athlete_id)
    or (
      record_type <> 'weekly_program'
      and owner_user_id = (select auth.uid())
    )
  )
);

create policy "athletics_records_delete"
on public.athletics_records
for delete
to authenticated
using (
  public.has_module_access(athlete_id, 'training', true)
  and (
    public.is_athlete_admin(athlete_id)
    or (
      record_type <> 'weekly_program'
      and owner_user_id = (select auth.uid())
    )
  )
);


-- ---------------------------------------------------------------------------
-- Staff directory visible to members who may read Athletics.
-- No email or authentication data is exposed.
-- ---------------------------------------------------------------------------

create or replace function public.get_athletics_staff_directory(
  p_athlete_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  role text,
  can_write_training boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    am.user_id,
    coalesce(
      nullif(trim(p.display_name), ''),
      'Membro staff'
    )::text as display_name,
    am.role::text,
    (
      am.role in ('owner', 'admin')
      or exists (
        select 1
        from public.module_permissions mp
        where mp.athlete_id = am.athlete_id
          and mp.user_id = am.user_id
          and mp.module_key = 'training'
          and mp.can_write
      )
    )::boolean as can_write_training
  from public.athlete_members am
  left join public.profiles p
    on p.id = am.user_id
  where am.athlete_id = p_athlete_id
    and am.status = 'active'
    and public.has_module_access(p_athlete_id, 'training', false)
  order by
    case am.role when 'owner' then 1 when 'admin' then 2 else 3 end,
    coalesce(nullif(trim(p.display_name), ''), 'Membro staff');
$$;

revoke all on function public.get_athletics_staff_directory(uuid)
  from public, anon;

grant execute on function public.get_athletics_staff_directory(uuid)
  to authenticated;


-- ---------------------------------------------------------------------------
-- One-time migration from athlete_module_state/training.
--
-- Legacy rows are NOT deleted: they remain as a historical backup.
-- Historical records are assigned to the last updater when that account is
-- still an active athlete member; otherwise to an active owner/admin.
-- ---------------------------------------------------------------------------

with legacy as (
  select
    s.athlete_id,
    s.payload,
    coalesce(
      case
        when public.is_active_athlete_member_user(s.athlete_id, s.updated_by)
          then s.updated_by
        else null
      end,
      (
        select am.user_id
        from public.athlete_members am
        where am.athlete_id = s.athlete_id
          and am.status = 'active'
          and am.role in ('owner', 'admin')
        order by case am.role when 'owner' then 1 else 2 end, am.created_at
        limit 1
      )
    ) as legacy_owner
  from public.athlete_module_state s
  where s.module_key = 'training'
),
weekly as (
  select
    l.athlete_id,
    'weekly_program'::text as record_type,
    'weekly-program'::text as client_id,
    l.legacy_owner,
    jsonb_build_object(
      'title', coalesce(l.payload #>> '{weeklyProgram,title}', 'Programma settimanale'),
      'effectiveFrom', coalesce(l.payload #>> '{weeklyProgram,effectiveFrom}', ''),
      'effectiveTo', coalesce(l.payload #>> '{weeklyProgram,effectiveTo}', ''),
      'notes', coalesce(l.payload #>> '{weeklyProgram,notes}', '')
    ) as payload
  from legacy l
  where l.legacy_owner is not null
),
tests as (
  select
    l.athlete_id,
    'test'::text as record_type,
    e.value ->> 'id' as client_id,
    l.legacy_owner,
    e.value as payload
  from legacy l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.payload -> 'tests') = 'array'
      then l.payload -> 'tests'
      else '[]'::jsonb
    end
  ) e
  where l.legacy_owner is not null
    and length(trim(coalesce(e.value ->> 'id', ''))) > 0
),
results as (
  select
    l.athlete_id,
    'test_result'::text as record_type,
    e.value ->> 'id' as client_id,
    l.legacy_owner,
    e.value as payload
  from legacy l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.payload -> 'testResults') = 'array'
      then l.payload -> 'testResults'
      else '[]'::jsonb
    end
  ) e
  where l.legacy_owner is not null
    and length(trim(coalesce(e.value ->> 'id', ''))) > 0
),
sessions as (
  select
    l.athlete_id,
    'session'::text as record_type,
    e.value ->> 'id' as client_id,
    l.legacy_owner,
    e.value as payload
  from legacy l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.payload #> '{weeklyProgram,sessions}') = 'array'
      then l.payload #> '{weeklyProgram,sessions}'
      else '[]'::jsonb
    end
  ) e
  where l.legacy_owner is not null
    and length(trim(coalesce(e.value ->> 'id', ''))) > 0
),
goals as (
  select
    l.athlete_id,
    'goal'::text as record_type,
    e.value ->> 'id' as client_id,
    l.legacy_owner,
    e.value as payload
  from legacy l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.payload -> 'goals') = 'array'
      then l.payload -> 'goals'
      else '[]'::jsonb
    end
  ) e
  where l.legacy_owner is not null
    and length(trim(coalesce(e.value ->> 'id', ''))) > 0
),
all_records as (
  select * from weekly
  union all select * from tests
  union all select * from results
  union all select * from sessions
  union all select * from goals
)
insert into public.athletics_records (
  athlete_id,
  record_type,
  client_id,
  owner_user_id,
  payload,
  created_by,
  updated_by
)
select
  ar.athlete_id,
  ar.record_type,
  ar.client_id,
  ar.legacy_owner,
  ar.payload,
  ar.legacy_owner,
  ar.legacy_owner
from all_records ar
where ar.legacy_owner is not null
on conflict (athlete_id, record_type, client_id) do nothing;

-- Ordinary record owners may delete an unused test, but they cannot cascade a
-- test deletion across measurements/goals owned by colleagues. Admins may
-- perform coordinated deletions through the application.
create or replace function public.guard_athletics_test_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.record_type <> 'test' or public.is_athlete_admin(old.athlete_id) then
    return old;
  end if;

  if exists (
    select 1
    from public.athletics_records r
    where r.athlete_id = old.athlete_id
      and (
        (r.record_type = 'test_result' and r.payload ->> 'testId' = old.client_id)
        or (
          r.record_type = 'goal'
          and coalesce(r.payload -> 'linkedTestIds', '[]'::jsonb) ? old.client_id
        )
      )
  ) then
    raise exception 'Only athlete owner/admin may delete an Athletics test that already has dependent records.'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

revoke all on function public.guard_athletics_test_delete()
  from public, anon, authenticated;

drop trigger if exists athletics_records_guard_test_delete
  on public.athletics_records;

create trigger athletics_records_guard_test_delete
before delete on public.athletics_records
for each row
execute function public.guard_athletics_test_delete();
