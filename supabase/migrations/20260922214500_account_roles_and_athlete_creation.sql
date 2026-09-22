-- Tennis Player OS v0.19.0
-- Global account roles + athlete creation capability.
--
-- Account-level:
--   owner  -> full platform/workspace control, can create athletes
--   admin  -> can create athletes; only sees athletes explicitly assigned/created
--   member -> cannot create athletes; only sees assigned athletes
--
-- Athlete-level roles and module_permissions remain separate.

create table if not exists public.account_access (
  user_id uuid primary key
    references auth.users(id) on delete cascade,

  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),

  can_create_athletes boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.account_access is
  'Global Tennis Player OS account role. Athlete membership and per-module permissions remain separate.';

alter table public.account_access enable row level security;

drop trigger if exists account_access_set_updated_at
  on public.account_access;

create trigger account_access_set_updated_at
before update on public.account_access
for each row
execute function public.set_updated_at();

-- Seed existing users from their strongest current athlete role.
insert into public.account_access (
  user_id,
  role,
  can_create_athletes
)
select
  u.id,
  case
    when bool_or(am.role = 'owner') then 'owner'
    when bool_or(am.role = 'admin') then 'admin'
    else 'member'
  end as role,
  case
    when bool_or(am.role in ('owner', 'admin')) then true
    else false
  end as can_create_athletes
from auth.users u
left join public.athlete_members am
  on am.user_id = u.id
group by u.id
on conflict (user_id) do nothing;

-- New Auth users start as ordinary members. The server-side invitation
-- flow may promote them to admin when the owner explicitly grants that role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.account_access (
    user_id,
    role,
    can_create_athletes
  )
  values (
    new.id,
    'member',
    false
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

-- Account helpers.
create or replace function public.is_app_owner()
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
        and aa.role = 'owner'
    );
$$;

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
    );
$$;

revoke all on function public.is_app_owner()
  from public, anon;
revoke all on function public.can_create_athletes()
  from public, anon;

grant execute on function public.is_app_owner()
  to authenticated;
grant execute on function public.can_create_athletes()
  to authenticated;

-- Browser users may only read their own account role.
revoke all on table public.account_access
  from anon, authenticated;

grant select on table public.account_access
  to authenticated;

drop policy if exists "account_access_select_own"
  on public.account_access;

create policy "account_access_select_own"
on public.account_access
for select
to authenticated
using (
  user_id = (select auth.uid())
);

-- Edge Functions use service_role to maintain account-level roles.
grant select, insert, update
  on table public.account_access
  to service_role;

-- Creating an athlete is no longer a generic authenticated-user ability.
drop policy if exists "athletes_insert_authenticated"
  on public.athletes;

create policy "athletes_insert_authorized_accounts"
on public.athletes
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_create_athletes()
);

-- A new athlete belongs to the global owner(s). If an admin creates it,
-- the creator is added as athlete admin. If the creator is an owner,
-- they remain owner.
create or replace function public.add_athlete_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_account_role text;
  creator_athlete_role text;
begin
  if new.created_by is null then
    raise exception 'Athlete creator is required.';
  end if;

  select aa.role
    into creator_account_role
  from public.account_access aa
  where aa.user_id = new.created_by;

  if creator_account_role not in ('owner', 'admin') then
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

revoke all on function public.add_athlete_owner()
  from public, anon, authenticated;
