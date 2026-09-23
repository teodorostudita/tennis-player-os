-- Tennis Player OS v0.22.2
-- Global owner user directory.
--
-- The access-management panel is workspace-level: a global owner must be able
-- to see every account assigned to any athlete they own, even when that account
-- is not assigned to the athlete currently open in the UI.

create or replace function public.get_owner_user_directory(
  p_current_athlete_id uuid
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  active_athlete_role text,
  active_athlete_status text,
  active_athlete_assigned boolean,
  athlete_count bigint,
  has_owner_role boolean,
  strongest_role text,
  first_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_athlete_owner(p_current_athlete_id) then
    raise exception 'Owner access required.'
      using errcode = '42501';
  end if;

  return query
    with owned_athletes as (
      select am.athlete_id
      from public.athlete_members am
      where am.user_id = (select auth.uid())
        and am.role = 'owner'
        and am.status = 'active'
    ),
    scoped_memberships as (
      select am.*
      from public.athlete_members am
      join owned_athletes oa
        on oa.athlete_id = am.athlete_id
      where am.status = 'active'
    )
    select
      sm.user_id,
      u.email::text,
      p.display_name,
      max(sm.role) filter (
        where sm.athlete_id = p_current_athlete_id
      )::text as active_athlete_role,
      max(sm.status) filter (
        where sm.athlete_id = p_current_athlete_id
      )::text as active_athlete_status,
      bool_or(sm.athlete_id = p_current_athlete_id) as active_athlete_assigned,
      count(distinct sm.athlete_id)::bigint as athlete_count,
      bool_or(sm.role = 'owner') as has_owner_role,
      case
        when bool_or(sm.role = 'owner') then 'owner'
        when bool_or(sm.role = 'admin') then 'admin'
        else 'member'
      end::text as strongest_role,
      min(sm.created_at) as first_created_at
    from scoped_memberships sm
    join auth.users u
      on u.id = sm.user_id
    left join public.profiles p
      on p.id = sm.user_id
    group by
      sm.user_id,
      u.email,
      p.display_name
    order by
      case
        when bool_or(sm.role = 'owner') then 1
        when bool_or(sm.role = 'admin') then 2
        else 3
      end,
      coalesce(
        p.display_name,
        split_part(u.email, '@', 1)
      );
end;
$$;

revoke all on function public.get_owner_user_directory(uuid)
  from public, anon;

grant execute on function public.get_owner_user_directory(uuid)
  to authenticated;
