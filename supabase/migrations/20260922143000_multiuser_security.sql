-- Tennis Player OS
-- Multi-user security hardening.

alter table public.athlete_members
  drop constraint if exists athlete_members_role_check;

alter table public.athlete_members
  add constraint athlete_members_role_check
  check (role in ('owner', 'admin', 'member'));

create or replace function public.is_athlete_owner(p_athlete_id uuid)
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
      from public.athlete_members am
      where am.athlete_id = p_athlete_id
        and am.user_id = (select auth.uid())
        and am.status = 'active'
        and am.role = 'owner'
    );
$$;

revoke all on function public.is_athlete_owner(uuid)
  from public, anon;

grant execute on function public.is_athlete_owner(uuid)
  to authenticated;

create or replace function public.protect_last_athlete_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners integer;
begin
  if tg_op = 'DELETE'
     and old.role = 'owner'
     and old.status = 'active' then

    select count(*)
      into remaining_owners
    from public.athlete_members am
    where am.athlete_id = old.athlete_id
      and am.role = 'owner'
      and am.status = 'active'
      and am.user_id <> old.user_id;

    if remaining_owners = 0 then
      raise exception 'An athlete must have at least one active owner.';
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.role = 'owner'
     and old.status = 'active'
     and (
       new.role <> 'owner'
       or new.status <> 'active'
       or new.athlete_id <> old.athlete_id
       or new.user_id <> old.user_id
     ) then

    select count(*)
      into remaining_owners
    from public.athlete_members am
    where am.athlete_id = old.athlete_id
      and am.role = 'owner'
      and am.status = 'active'
      and am.user_id <> old.user_id;

    if remaining_owners = 0 then
      raise exception 'An athlete must have at least one active owner.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_last_athlete_owner()
  from public, anon, authenticated;

drop trigger if exists protect_last_athlete_owner
  on public.athlete_members;

create trigger protect_last_athlete_owner
before update or delete on public.athlete_members
for each row
execute function public.protect_last_athlete_owner();

drop policy if exists "athlete_members_insert_admins"
  on public.athlete_members;

drop policy if exists "athlete_members_update_admins"
  on public.athlete_members;

drop policy if exists "athlete_members_delete_admins"
  on public.athlete_members;

create policy "athlete_members_insert_owners"
on public.athlete_members
for insert
to authenticated
with check (
  public.is_athlete_owner(athlete_id)
);

create policy "athlete_members_update_owners"
on public.athlete_members
for update
to authenticated
using (
  public.is_athlete_owner(athlete_id)
)
with check (
  public.is_athlete_owner(athlete_id)
);

create policy "athlete_members_delete_owners"
on public.athlete_members
for delete
to authenticated
using (
  public.is_athlete_owner(athlete_id)
);

drop policy if exists "module_permissions_insert_admins"
  on public.module_permissions;

drop policy if exists "module_permissions_update_admins"
  on public.module_permissions;

drop policy if exists "module_permissions_delete_admins"
  on public.module_permissions;

create policy "module_permissions_insert_owners"
on public.module_permissions
for insert
to authenticated
with check (
  public.is_athlete_owner(athlete_id)
);

create policy "module_permissions_update_owners"
on public.module_permissions
for update
to authenticated
using (
  public.is_athlete_owner(athlete_id)
)
with check (
  public.is_athlete_owner(athlete_id)
);

create policy "module_permissions_delete_owners"
on public.module_permissions
for delete
to authenticated
using (
  public.is_athlete_owner(athlete_id)
);

create or replace function public.get_athlete_member_directory(
  p_athlete_id uuid
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_athlete_owner(p_athlete_id) then
    raise exception 'Owner access required.'
      using errcode = '42501';
  end if;

  return query
    select
      am.user_id,
      u.email::text,
      p.display_name,
      am.role,
      am.status,
      am.created_at
    from public.athlete_members am
    join auth.users u
      on u.id = am.user_id
    left join public.profiles p
      on p.id = am.user_id
    where am.athlete_id = p_athlete_id
    order by
      case am.role
        when 'owner' then 1
        when 'admin' then 2
        else 3
      end,
      coalesce(p.display_name, u.email);
end;
$$;

revoke all on function public.get_athlete_member_directory(uuid)
  from public, anon;

grant execute on function public.get_athlete_member_directory(uuid)
  to authenticated;
