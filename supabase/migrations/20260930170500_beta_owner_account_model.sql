-- Tennis Player OS v1.0.25
-- Founding Beta integrated into the normal Users & Access workflow.
-- Adds contact email, one-athlete creation limits, Beta account options and
-- exposes unassigned Beta Owners in the Owner workspace.

-- ---------------------------------------------------------------------------
-- 1. Contact email is application metadata, separate from the Auth identity.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists contact_email text;

update public.profiles p
set contact_email = lower(trim(u.email::text))
from auth.users u
where u.id = p.id
  and nullif(trim(coalesce(p.contact_email, '')), '') is null;

comment on column public.profiles.contact_email is
  'Administrative/contact email. Authentication may continue to use a technical TPOS email.';

-- ---------------------------------------------------------------------------
-- 2. Account-level athlete creation limit. NULL = unlimited.
-- ---------------------------------------------------------------------------

alter table public.account_access
  add column if not exists athlete_creation_limit integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_access_athlete_creation_limit_check'
      and conrelid = 'public.account_access'::regclass
  ) then
    alter table public.account_access
      add constraint account_access_athlete_creation_limit_check
      check (athlete_creation_limit is null or athlete_creation_limit >= 0);
  end if;
end;
$$;

comment on column public.account_access.athlete_creation_limit is
  'Maximum number of non-deleted athletes this account may create. NULL means unlimited.';

-- Rebuild the Auth trigger so new profiles receive a default contact email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    avatar_url,
    contact_email
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    lower(trim(new.email::text))
  )
  on conflict (id) do nothing;

  insert into public.account_access (
    user_id,
    role,
    can_create_athletes,
    athlete_creation_limit
  )
  values (
    new.id,
    'member',
    false,
    null
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

-- Effective creation permission now includes the per-account limit.
create or replace function public.can_create_athletes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.account_access aa
      where aa.user_id = (select auth.uid())
        and aa.can_create_athletes
        and (
          aa.athlete_creation_limit is null
          or (
            select count(*)
            from public.athletes a
            where a.created_by = (select auth.uid())
              and a.deleted_at is null
          ) < aa.athlete_creation_limit
        )
    );
$$;

revoke all on function public.can_create_athletes()
  from public, anon;
grant execute on function public.can_create_athletes()
  to authenticated;

-- Defense in depth: enforce the limit again while holding the account row.
create or replace function public.enforce_athlete_creation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
  v_limit integer;
  v_created integer;
begin
  if new.created_by is null then
    raise exception 'Athlete creator is required.' using errcode = '42501';
  end if;

  select aa.can_create_athletes, aa.athlete_creation_limit
    into v_allowed, v_limit
  from public.account_access aa
  where aa.user_id = new.created_by
  for update;

  if not found or not coalesce(v_allowed, false) then
    raise exception 'This account is not allowed to create athletes.'
      using errcode = '42501';
  end if;

  if v_limit is not null then
    select count(*)::integer
      into v_created
    from public.athletes a
    where a.created_by = new.created_by
      and a.deleted_at is null;

    if v_created >= v_limit then
      raise exception 'Hai raggiunto il numero massimo di atleti creabili con questo account.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_athlete_creation_limit()
  from public, anon, authenticated;

drop trigger if exists athletes_enforce_creation_limit on public.athletes;
create trigger athletes_enforce_creation_limit
before insert on public.athletes
for each row
execute function public.enforce_athlete_creation_limit();

-- ---------------------------------------------------------------------------
-- 3. Owner-editable account options: contact email + Founding Beta flag.
-- ---------------------------------------------------------------------------

create or replace function public.set_owner_user_account_options(
  p_user_id uuid,
  p_contact_email text default null,
  p_is_beta_owner boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_email text;
  v_contact_email text;
  v_target_role text;
  v_display_name text;
  v_capacity integer := 30;
  v_program_status text := 'active';
  v_active integer := 0;
  v_existing_beta boolean := false;
  v_has_admin_access boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Authenticated account required.' using errcode = '42501';
  end if;

  if not public.is_app_owner() then
    raise exception 'Only the global Owner can change Founding Beta account settings.'
      using errcode = '42501';
  end if;

  select lower(trim(u.email::text)), coalesce(p.display_name, '')
    into v_auth_email, v_display_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;

  if v_auth_email is null then
    raise exception 'User account not found.' using errcode = 'P0002';
  end if;

  v_contact_email := lower(trim(coalesce(nullif(p_contact_email, ''), v_auth_email)));
  if position('@' in v_contact_email) < 2 then
    raise exception 'Invalid contact email.';
  end if;

  update public.profiles
  set contact_email = v_contact_email,
      updated_at = now()
  where id = p_user_id;

  select aa.role
    into v_target_role
  from public.account_access aa
  where aa.user_id = p_user_id;

  if v_target_role = 'owner' then
    if p_is_beta_owner then
      raise exception 'The global Owner cannot be a Founding Beta Owner.';
    end if;

    delete from public.beta_accounts ba
    where ba.user_id = p_user_id
      and ba.program_code = 'founding_beta';

    update public.account_access
    set can_create_athletes = true,
        athlete_creation_limit = null,
        updated_at = now()
    where user_id = p_user_id;

    return jsonb_build_object(
      'ok', true,
      'userId', p_user_id,
      'contactEmail', v_contact_email,
      'isBetaOwner', false,
      'beta', public.get_founding_beta_status()
    );
  end if;

  if p_is_beta_owner then
    select exists (
      select 1
      from public.beta_accounts ba
      where ba.user_id = p_user_id
        and ba.program_code = 'founding_beta'
        and ba.status = 'active'
    ) into v_existing_beta;

    select bp.capacity, bp.status
      into v_capacity, v_program_status
    from public.beta_programs bp
    where bp.code = 'founding_beta'
    for update;

    if v_capacity is null then
      raise exception 'Founding Beta program not configured.';
    end if;

    if v_program_status <> 'active' then
      raise exception 'The Founding Beta is not active.';
    end if;

    if not v_existing_beta then
      select count(*)::integer
        into v_active
      from public.beta_accounts ba
      where ba.program_code = 'founding_beta'
        and ba.status = 'active';

      if v_active >= v_capacity then
        raise exception 'All Founding Beta places have already been assigned.';
      end if;
    end if;

    insert into public.beta_accounts (
      user_id,
      program_code,
      email,
      display_name,
      status,
      created_by
    )
    values (
      p_user_id,
      'founding_beta',
      v_contact_email,
      nullif(trim(v_display_name), ''),
      'active',
      (select auth.uid())
    )
    on conflict (user_id) do update
    set program_code = 'founding_beta',
        email = excluded.email,
        display_name = excluded.display_name,
        status = 'active',
        created_by = excluded.created_by,
        updated_at = now();

    insert into public.account_access (
      user_id,
      role,
      can_create_athletes,
      athlete_creation_limit
    )
    values (
      p_user_id,
      'admin',
      true,
      1
    )
    on conflict (user_id) do update
    set role = 'admin',
        can_create_athletes = true,
        athlete_creation_limit = 1,
        updated_at = now();
  else
    delete from public.beta_accounts ba
    where ba.user_id = p_user_id
      and ba.program_code = 'founding_beta';

    select exists (
      select 1
      from public.athlete_members am
      where am.user_id = p_user_id
        and am.status = 'active'
        and am.role in ('admin', 'owner')
    ) into v_has_admin_access;

    insert into public.account_access (
      user_id,
      role,
      can_create_athletes,
      athlete_creation_limit
    )
    values (
      p_user_id,
      case when v_has_admin_access then 'admin' else 'member' end,
      v_has_admin_access,
      null
    )
    on conflict (user_id) do update
    set role = case when v_has_admin_access then 'admin' else 'member' end,
        can_create_athletes = v_has_admin_access,
        athlete_creation_limit = null,
        updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'userId', p_user_id,
    'contactEmail', v_contact_email,
    'isBetaOwner', p_is_beta_owner,
    'athleteCreationLimit', case when p_is_beta_owner then 1 else null end,
    'beta', public.get_founding_beta_status()
  );
end;
$$;

revoke all on function public.set_owner_user_account_options(uuid, text, boolean)
  from public, anon;
grant execute on function public.set_owner_user_account_options(uuid, text, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Owner workspace now includes unassigned Beta Owners and account metadata.
-- ---------------------------------------------------------------------------

create or replace function public.get_owner_access_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  v_is_app_owner boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'Authenticated account required.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.athlete_members own
    where own.user_id = (select auth.uid())
      and own.role = 'owner'
      and own.status = 'active'
  ) then
    raise exception 'Owner access required.'
      using errcode = '42501';
  end if;

  v_is_app_owner := public.is_app_owner();

  with owned_athletes as (
    select
      a.id,
      a.first_name,
      a.last_name,
      a.display_name,
      a.created_at
    from public.athlete_members own
    join public.athletes a
      on a.id = own.athlete_id
    where own.user_id = (select auth.uid())
      and own.role = 'owner'
      and own.status = 'active'
      and a.deleted_at is null
  ),
  scoped_memberships as (
    select am.*
    from public.athlete_members am
    join owned_athletes oa
      on oa.id = am.athlete_id
  ),
  user_rows as (
    select distinct sm.user_id
    from scoped_memberships sm
    union
    select ba.user_id
    from public.beta_accounts ba
    where v_is_app_owner
      and ba.program_code = 'founding_beta'
      and ba.status = 'active'
  )
  select jsonb_build_object(
    'athletes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', oa.id,
          'firstName', coalesce(oa.first_name, ''),
          'lastName', coalesce(oa.last_name, ''),
          'displayName', coalesce(oa.display_name, ''),
          'createdAt', oa.created_at
        )
        order by oa.created_at, oa.display_name, oa.id
      )
      from owned_athletes oa
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', ur.user_id,
          'email', coalesce(u.email::text, ''),
          'contactEmail', coalesce(nullif(p.contact_email, ''), u.email::text, ''),
          'displayName', coalesce(p.display_name, ''),
          'accountRole', coalesce(aa.role, 'member'),
          'athleteCreationLimit', aa.athlete_creation_limit,
          'isBetaOwner', coalesce(ba.status = 'active', false),
          'hasOwnerRole', exists (
            select 1
            from scoped_memberships owner_membership
            where owner_membership.user_id = ur.user_id
              and owner_membership.role = 'owner'
              and owner_membership.status = 'active'
          ),
          'strongestRole', case
            when exists (
              select 1 from scoped_memberships x
              where x.user_id = ur.user_id
                and x.role = 'owner'
                and x.status = 'active'
            ) then 'owner'
            when coalesce(ba.status = 'active', false) or aa.role = 'admin' then 'admin'
            when exists (
              select 1 from scoped_memberships x
              where x.user_id = ur.user_id
                and x.role = 'admin'
                and x.status = 'active'
            ) then 'admin'
            else 'member'
          end,
          'firstCreatedAt', coalesce((
            select min(x.created_at)
            from scoped_memberships x
            where x.user_id = ur.user_id
          ), ba.created_at, u.created_at),
          'assignments', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'athleteId', sm.athlete_id,
                'role', sm.role,
                'status', sm.status,
                'permissions', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'moduleKey', mp.module_key,
                      'canRead', mp.can_read,
                      'canWrite', mp.can_write
                    )
                    order by mp.module_key
                  )
                  from public.module_permissions mp
                  where mp.user_id = sm.user_id
                    and mp.athlete_id = sm.athlete_id
                ), '[]'::jsonb)
              )
              order by a2.created_at, a2.display_name, sm.athlete_id
            )
            from scoped_memberships sm
            join public.athletes a2
              on a2.id = sm.athlete_id
            where sm.user_id = ur.user_id
              and a2.deleted_at is null
          ), '[]'::jsonb)
        )
        order by
          case
            when exists (
              select 1 from scoped_memberships x
              where x.user_id = ur.user_id
                and x.role = 'owner'
                and x.status = 'active'
            ) then 1
            when coalesce(ba.status = 'active', false) then 2
            when aa.role = 'admin' then 3
            else 4
          end,
          coalesce(p.display_name, split_part(u.email, '@', 1)),
          ur.user_id
      )
      from user_rows ur
      join auth.users u on u.id = ur.user_id
      left join public.profiles p on p.id = ur.user_id
      left join public.account_access aa on aa.user_id = ur.user_id
      left join public.beta_accounts ba
        on ba.user_id = ur.user_id
       and ba.program_code = 'founding_beta'
       and ba.status = 'active'
    ), '[]'::jsonb),
    'beta', public.get_founding_beta_status()
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_owner_access_workspace()
  from public, anon;
grant execute on function public.get_owner_access_workspace()
  to authenticated;

-- Remove any accidental Founding Beta reservation on the global Owner.
delete from public.beta_accounts ba
using public.account_access aa
where aa.user_id = ba.user_id
  and aa.role = 'owner'
  and ba.program_code = 'founding_beta';
