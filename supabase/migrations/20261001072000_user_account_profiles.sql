-- Tennis Player OS v1.0.28
-- Global user profiles for contextual Home + permission presets.
--
-- user_type describes who the account represents. It does NOT grant access.
-- Actual access remains controlled by athlete_members + module_permissions.

alter table public.profiles
  add column if not exists user_type text not null default 'custom';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_user_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_user_type_check
      check (user_type in ('athlete', 'coach', 'trainer', 'physio', 'parent', 'custom'));
  end if;
end;
$$;

update public.profiles
set user_type = 'custom'
where user_type is null
   or user_type not in ('athlete', 'coach', 'trainer', 'physio', 'parent', 'custom');

comment on column public.profiles.user_type is
  'Global account profile used for UI defaults and contextual Home. It does not itself grant permissions.';

create or replace function public.set_owner_user_type(
  p_user_id uuid,
  p_user_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_type text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authenticated account required.'
      using errcode = '42501';
  end if;

  if not public.is_app_owner() then
    raise exception 'Only the global Owner can change the user profile.'
      using errcode = '42501';
  end if;

  v_user_type := lower(trim(coalesce(nullif(p_user_type, ''), 'custom')));

  if v_user_type not in ('athlete', 'coach', 'trainer', 'physio', 'parent', 'custom') then
    raise exception 'Invalid user profile: %.', v_user_type;
  end if;

  update public.profiles
  set user_type = v_user_type,
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'User profile not found.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'userId', p_user_id,
    'userType', v_user_type
  );
end;
$$;

revoke all on function public.set_owner_user_type(uuid, text)
  from public, anon;

grant execute on function public.set_owner_user_type(uuid, text)
  to authenticated;

-- Include userType in the global Owner directory so the account editor can
-- display and change it without exposing other users' profile rows directly.
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
          'userType', coalesce(nullif(p.user_type, ''), 'custom'),
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
