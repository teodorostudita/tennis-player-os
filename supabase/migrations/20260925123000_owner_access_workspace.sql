-- Tennis Player OS v0.28.1
-- Workspace-level owner access management.
--
-- The user-management panel must not depend on the athlete currently selected
-- in the app. These RPCs expose, and atomically replace, the assignments that
-- the current owner is allowed to manage across all athletes they own.

create or replace function public.get_owner_access_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
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
          'displayName', coalesce(p.display_name, ''),
          'accountRole', coalesce(aa.role, 'member'),
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
            when exists (
              select 1 from scoped_memberships x
              where x.user_id = ur.user_id
                and x.role = 'admin'
                and x.status = 'active'
            ) then 'admin'
            else 'member'
          end,
          'firstCreatedAt', (
            select min(x.created_at)
            from scoped_memberships x
            where x.user_id = ur.user_id
          ),
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
            when exists (
              select 1 from scoped_memberships x
              where x.user_id = ur.user_id
                and x.role = 'admin'
                and x.status = 'active'
            ) then 2
            else 3
          end,
          coalesce(p.display_name, split_part(u.email, '@', 1)),
          ur.user_id
      )
      from user_rows ur
      join auth.users u
        on u.id = ur.user_id
      left join public.profiles p
        on p.id = ur.user_id
      left join public.account_access aa
        on aa.user_id = ur.user_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_owner_access_workspace()
  from public, anon;

grant execute on function public.get_owner_access_workspace()
  to authenticated;


create or replace function public.replace_owner_user_access(
  p_user_id uuid,
  p_assignments jsonb,
  p_remove_missing boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment jsonb;
  v_permission jsonb;
  v_athlete_id uuid;
  v_role text;
  v_module_key text;
  v_can_read boolean;
  v_can_write boolean;
  v_selected_ids uuid[] := '{}'::uuid[];
  v_assignment_count integer := 0;
  v_permission_count integer := 0;
  v_has_admin_access boolean := false;
  v_account_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authenticated account required.'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'User not specified.';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'User account not found.';
  end if;

  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Assignments must be a JSON array.';
  end if;

  if jsonb_array_length(p_assignments) = 0 then
    raise exception 'Assign at least one athlete.';
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

  -- Owner assignments are protected. The panel may display them but cannot
  -- mutate or delete them.
  if exists (
    select 1
    from public.athlete_members target_membership
    join public.athlete_members own
      on own.athlete_id = target_membership.athlete_id
     and own.user_id = (select auth.uid())
     and own.role = 'owner'
     and own.status = 'active'
    where target_membership.user_id = p_user_id
      and target_membership.role = 'owner'
      and target_membership.status = 'active'
  ) then
    raise exception 'Owner assignments are protected and cannot be modified from this panel.';
  end if;

  select aa.role
    into v_account_role
  from public.account_access aa
  where aa.user_id = p_user_id;

  if v_account_role = 'owner' then
    raise exception 'The workspace Owner account is protected.';
  end if;

  -- Validate the complete payload before relying on it for removal logic.
  for v_assignment in
    select value from jsonb_array_elements(p_assignments)
  loop
    begin
      v_athlete_id := (v_assignment ->> 'athleteId')::uuid;
    exception when others then
      raise exception 'Invalid athlete identifier in assignment.';
    end;

    if v_athlete_id = any(v_selected_ids) then
      raise exception 'Duplicate athlete assignment.';
    end if;

    if not exists (
      select 1
      from public.athlete_members own
      join public.athletes a
        on a.id = own.athlete_id
      where own.athlete_id = v_athlete_id
        and own.user_id = (select auth.uid())
        and own.role = 'owner'
        and own.status = 'active'
        and a.deleted_at is null
    ) then
      raise exception 'You can manage assignments only for athletes you own.'
        using errcode = '42501';
    end if;

    v_role := coalesce(v_assignment ->> 'role', 'member');
    if v_role not in ('member', 'admin') then
      raise exception 'Invalid athlete role: %.', v_role;
    end if;

    if (v_assignment ? 'permissions')
       and jsonb_typeof(v_assignment -> 'permissions') <> 'array' then
      raise exception 'Permissions must be a JSON array.';
    end if;

    if v_role = 'member' then
      for v_permission in
        select value
        from jsonb_array_elements(coalesce(v_assignment -> 'permissions', '[]'::jsonb))
      loop
        v_module_key := coalesce(v_permission ->> 'moduleKey', '');

        if v_module_key not in (
          'development',
          'training',
          'drills',
          'competition',
          'opponents',
          'equipment',
          'health',
          'nutrition',
          'mental',
          'visual',
          'economics',
          'calendar'
        ) then
          raise exception 'Invalid module permission: %.', v_module_key;
        end if;
      end loop;
    end if;

    v_selected_ids := array_append(v_selected_ids, v_athlete_id);
  end loop;

  if p_remove_missing then
    delete from public.module_permissions mp
    where mp.user_id = p_user_id
      and exists (
        select 1
        from public.athlete_members own
        where own.athlete_id = mp.athlete_id
          and own.user_id = (select auth.uid())
          and own.role = 'owner'
          and own.status = 'active'
      )
      and not (mp.athlete_id = any(v_selected_ids));

    delete from public.athlete_members target_membership
    where target_membership.user_id = p_user_id
      and target_membership.role <> 'owner'
      and exists (
        select 1
        from public.athlete_members own
        where own.athlete_id = target_membership.athlete_id
          and own.user_id = (select auth.uid())
          and own.role = 'owner'
          and own.status = 'active'
      )
      and not (target_membership.athlete_id = any(v_selected_ids));
  end if;

  -- Upsert each selected assignment and replace its explicit permissions.
  for v_assignment in
    select value from jsonb_array_elements(p_assignments)
  loop
    v_athlete_id := (v_assignment ->> 'athleteId')::uuid;
    v_role := coalesce(v_assignment ->> 'role', 'member');

    insert into public.athlete_members (
      athlete_id,
      user_id,
      role,
      status,
      created_by
    )
    values (
      v_athlete_id,
      p_user_id,
      v_role,
      'active',
      (select auth.uid())
    )
    on conflict (athlete_id, user_id)
    do update set
      role = excluded.role,
      status = 'active',
      updated_at = now();

    delete from public.module_permissions mp
    where mp.athlete_id = v_athlete_id
      and mp.user_id = p_user_id;

    if v_role = 'member' then
      for v_permission in
        select value
        from jsonb_array_elements(coalesce(v_assignment -> 'permissions', '[]'::jsonb))
      loop
        v_module_key := v_permission ->> 'moduleKey';
        v_can_write := coalesce((v_permission ->> 'canWrite')::boolean, false);
        v_can_read := coalesce((v_permission ->> 'canRead')::boolean, false) or v_can_write;

        if v_can_read then
          insert into public.module_permissions (
            athlete_id,
            user_id,
            module_key,
            can_read,
            can_write,
            created_by
          )
          values (
            v_athlete_id,
            p_user_id,
            v_module_key,
            true,
            v_can_write,
            (select auth.uid())
          );

          v_permission_count := v_permission_count + 1;
        end if;
      end loop;
    end if;

    v_assignment_count := v_assignment_count + 1;
  end loop;

  -- Account-level Admin means that at least one active athlete assignment is
  -- Admin (or Owner, though Owner accounts are protected above).
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
    can_create_athletes
  )
  values (
    p_user_id,
    case when v_has_admin_access then 'admin' else 'member' end,
    v_has_admin_access
  )
  on conflict (user_id)
  do update set
    role = case
      when account_access.role = 'owner' then 'owner'
      when v_has_admin_access then 'admin'
      else 'member'
    end,
    can_create_athletes = case
      when account_access.role = 'owner' then true
      else v_has_admin_access
    end,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'userId', p_user_id,
    'assignmentCount', v_assignment_count,
    'permissionCount', v_permission_count,
    'removeMissing', p_remove_missing
  );
end;
$$;

revoke all on function public.replace_owner_user_access(uuid, jsonb, boolean)
  from public, anon;

grant execute on function public.replace_owner_user_access(uuid, jsonb, boolean)
  to authenticated;
