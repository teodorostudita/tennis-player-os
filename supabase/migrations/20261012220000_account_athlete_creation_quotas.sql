-- TPOS v1.2.24 — account quotas independent from per-athlete privileges.
-- Migration is intentionally non-destructive. Existing quotas are preserved.
-- Use order: migration -> Edge Function create-user -> app bundle.
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
    union
    -- Global Owner can also manage accounts with no athlete memberships.
    select aa.user_id
    from public.account_access aa
    where v_is_app_owner
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
          'canCreateAthletes', coalesce(aa.can_create_athletes, false),
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

  -- Athlete roles and account creation quota are independent.
  -- Do not rewrite can_create_athletes or athlete_creation_limit here.
  insert into public.account_access (user_id, role)
  values (
    p_user_id,
    case when v_has_admin_access then 'admin' else 'member' end
  )
  on conflict (user_id)
  do update set
    role = case
      when account_access.role = 'owner' then 'owner'
      when v_has_admin_access then 'admin'
      else 'member'
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
        -- Default to 1 only upon initial admission, not on every edit.
        can_create_athletes = case
          when v_existing_beta then account_access.can_create_athletes
          else true
        end,
        athlete_creation_limit = case
          when v_existing_beta then account_access.athlete_creation_limit
          else 1
        end,
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

    -- Removing Beta status must never alter the explicit creation quota.
    insert into public.account_access (user_id, role)
    values (
      p_user_id,
      case when v_has_admin_access then 'admin' else 'member' end
    )
    on conflict (user_id) do update
    set role = case when v_has_admin_access then 'admin' else 'member' end,
        updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'userId', p_user_id,
    'contactEmail', v_contact_email,
    'isBetaOwner', p_is_beta_owner,
    'athleteCreationLimit', (select aa.athlete_creation_limit from public.account_access aa where aa.user_id = p_user_id),
    'beta', public.get_founding_beta_status()
  );
end;
$$;

create or replace function public.add_athlete_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_account_role text;
  creator_athlete_role text;
  creator_allowed boolean;
begin
  if new.created_by is null then
    raise exception 'Athlete creator is required.';
  end if;

  select aa.role, aa.can_create_athletes
    into creator_account_role, creator_allowed
  from public.account_access aa
  where aa.user_id = new.created_by;

  -- Insertion RLS and the quota trigger provide the remaining checks.
  -- A Member with an explicit quota must be allowed to create their athlete.
  if not coalesce(creator_allowed, false) then
    raise exception 'This account is not allowed to create athletes.'
      using errcode = '42501';
  end if;

  creator_athlete_role :=
    case
      when creator_account_role = 'owner' then 'owner'
      else 'admin'
    end;

  insert into public.athlete_members (
    athlete_id,
    user_id,
    role,
    status,
    created_by
  )
  values (
    new.id,
    new.created_by,
    creator_athlete_role,
    'active',
    new.created_by
  )
  on conflict (athlete_id, user_id)
  do update set
    role = excluded.role,
    status = 'active',
    updated_at = now();

  -- Every global owner retains control of every athlete created in this
  -- workspace. For an owner-created athlete this simply preserves owner.
  insert into public.athlete_members (
    athlete_id,
    user_id,
    role,
    status,
    created_by
  )
  select
    new.id,
    aa.user_id,
    'owner',
    'active',
    new.created_by
  from public.account_access aa
  where aa.role = 'owner'
  on conflict (athlete_id, user_id)
  do update set
    role = 'owner',
    status = 'active',
    updated_at = now();

  return new;
end;
$$;


-- Dedicated global Owner-only API. A null quota means unlimited; 0 means NO.
create or replace function public.set_owner_user_creation_quota(
  p_user_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_create boolean;
begin
  if (select auth.uid()) is null or not public.is_app_owner() then
    raise exception 'Only the global Owner can set athlete creation quotas.'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_limit is not null and (p_limit < 0 or p_limit > 1000000) then
    raise exception 'Invalid athlete creation quota.';
  end if;

  select role into v_role
  from public.account_access
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'User account not found.';
  end if;
  if v_role = 'owner' then
    raise exception 'The global Owner always has unlimited athlete creation.';
  end if;

  v_create := p_limit is null or p_limit > 0;
  update public.account_access
     set can_create_athletes = v_create,
         athlete_creation_limit = p_limit,
         updated_at = now()
   where user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'userId', p_user_id,
    'canCreateAthletes', v_create,
    'athleteCreationLimit', p_limit
  );
end;
$$;

revoke all on function public.set_owner_user_creation_quota(uuid, integer)
  from public, anon;
grant execute on function public.set_owner_user_creation_quota(uuid, integer)
  to authenticated;


-- Tighten public EXECUTE visibility after replacing privileged routines.
revoke all on function public.get_owner_access_workspace() from public, anon;
grant execute on function public.get_owner_access_workspace() to authenticated;
revoke all on function public.replace_owner_user_access(uuid, jsonb, boolean) from public, anon;
grant execute on function public.replace_owner_user_access(uuid, jsonb, boolean) to authenticated;
revoke all on function public.set_owner_user_account_options(uuid, text, boolean) from public, anon;
grant execute on function public.set_owner_user_account_options(uuid, text, boolean) to authenticated;
revoke all on function public.add_athlete_owner() from public, anon, authenticated;
