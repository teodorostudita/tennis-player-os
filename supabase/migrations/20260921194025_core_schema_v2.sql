-- Tennis Player OS
-- Migration: core multi-athlete / multi-user schema
-- This is the first effective core-schema migration.
-- The previous core_schema migration was intentionally left as a no-op
-- because it had already been recorded remotely while still empty.

-- ---------------------------------------------------------------------------
-- 1. Shared utility: updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Profiles
-- One application profile per Supabase Auth user.
-- Authentication credentials remain in auth.users.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile associated 1:1 with auth.users.';

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


-- Automatically create a profile when a Supabase Auth user is created.
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

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 3. Athletes
-- ---------------------------------------------------------------------------

create table public.athletes (
  id uuid primary key default gen_random_uuid(),

  first_name text not null,
  last_name text,
  display_name text,

  birth_date date,

  metadata jsonb not null default '{}'::jsonb,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  archived_at timestamptz,
  deleted_at timestamptz
);

comment on table public.athletes is
  'Core athlete identity. Domain-specific information belongs in dedicated tables as modules mature.';

alter table public.athletes enable row level security;

create trigger athletes_set_updated_at
before update on public.athletes
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. Athlete membership
-- Roles are descriptive. Per-module access is handled separately.
-- ---------------------------------------------------------------------------

create table public.athlete_members (
  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  user_id uuid not null
    references auth.users(id) on delete cascade,

  role text not null default 'viewer',
  status text not null default 'active'
    check (status in ('active', 'suspended')),

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, user_id)
);

comment on table public.athlete_members is
  'Users associated with an athlete. owner/admin roles have implicit full module access.';

alter table public.athlete_members enable row level security;

create index athlete_members_user_id_idx
  on public.athlete_members (user_id);

create trigger athlete_members_set_updated_at
before update on public.athlete_members
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 5. Module permissions
-- module_key remains text so modules can evolve without enum migrations.
-- ---------------------------------------------------------------------------

create table public.module_permissions (
  athlete_id uuid not null
    references public.athletes(id) on delete cascade,

  user_id uuid not null
    references auth.users(id) on delete cascade,

  module_key text not null,

  can_read boolean not null default false,
  can_write boolean not null default false,

  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, user_id, module_key),

  constraint module_permissions_write_requires_read
    check (not can_write or can_read)
);

comment on table public.module_permissions is
  'Per-athlete, per-user access to an application module. No row means no module access for ordinary members.';

alter table public.module_permissions enable row level security;

create index module_permissions_user_id_idx
  on public.module_permissions (user_id);

create index module_permissions_module_key_idx
  on public.module_permissions (module_key);

create trigger module_permissions_set_updated_at
before update on public.module_permissions
for each row
execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 6. RLS helper functions
-- SECURITY DEFINER avoids recursive RLS checks on athlete_members.
-- ---------------------------------------------------------------------------

create or replace function public.is_athlete_member(p_athlete_id uuid)
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
    );
$$;

create or replace function public.is_athlete_admin(p_athlete_id uuid)
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
        and am.role in ('owner', 'admin')
    );
$$;

create or replace function public.has_module_access(
  p_athlete_id uuid,
  p_module_key text,
  p_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_athlete_admin(p_athlete_id)
    or (
      public.is_athlete_member(p_athlete_id)
      and exists (
        select 1
        from public.module_permissions mp
        where mp.athlete_id = p_athlete_id
          and mp.user_id = (select auth.uid())
          and mp.module_key = p_module_key
          and (
            (not p_write and mp.can_read)
            or
            (p_write and mp.can_write)
          )
      )
    );
$$;

revoke all on function public.is_athlete_member(uuid)
  from public, anon;
revoke all on function public.is_athlete_admin(uuid)
  from public, anon;
revoke all on function public.has_module_access(uuid, text, boolean)
  from public, anon;

grant execute on function public.is_athlete_member(uuid)
  to authenticated;
grant execute on function public.is_athlete_admin(uuid)
  to authenticated;
grant execute on function public.has_module_access(uuid, text, boolean)
  to authenticated;


-- ---------------------------------------------------------------------------
-- 7. Automatically make the creator the athlete owner.
-- ---------------------------------------------------------------------------

create or replace function public.add_athlete_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
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
      'owner',
      'active',
      new.created_by
    )
    on conflict (athlete_id, user_id)
    do update set
      role = 'owner',
      status = 'active',
      updated_at = now();
  end if;

  return new;
end;
$$;

revoke all on function public.add_athlete_owner()
  from public, anon, authenticated;

create trigger athlete_creator_becomes_owner
after insert on public.athletes
for each row
execute function public.add_athlete_owner();


-- ---------------------------------------------------------------------------
-- 8. Privileges
-- RLS decides which rows authenticated users may access.
-- Anonymous visitors receive no table access.
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.athletes from anon, authenticated;
revoke all on table public.athlete_members from anon, authenticated;
revoke all on table public.module_permissions from anon, authenticated;

grant select, update
  on table public.profiles
  to authenticated;

grant select, insert, update, delete
  on table public.athletes
  to authenticated;

grant select, insert, update, delete
  on table public.athlete_members
  to authenticated;

grant select, insert, update, delete
  on table public.module_permissions
  to authenticated;


-- ---------------------------------------------------------------------------
-- 9. Profiles policies
-- ---------------------------------------------------------------------------

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
);


-- ---------------------------------------------------------------------------
-- 10. Athletes policies
-- ---------------------------------------------------------------------------

create policy "athletes_select_members"
on public.athletes
for select
to authenticated
using (
  public.is_athlete_member(id)
  or created_by = (select auth.uid())
);

create policy "athletes_insert_authenticated"
on public.athletes
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and created_by = (select auth.uid())
);

create policy "athletes_update_admins"
on public.athletes
for update
to authenticated
using (
  public.is_athlete_admin(id)
)
with check (
  public.is_athlete_admin(id)
);

create policy "athletes_delete_owners"
on public.athletes
for delete
to authenticated
using (
  exists (
    select 1
    from public.athlete_members am
    where am.athlete_id = athletes.id
      and am.user_id = (select auth.uid())
      and am.status = 'active'
      and am.role = 'owner'
  )
);


-- ---------------------------------------------------------------------------
-- 11. Athlete-member policies
-- ---------------------------------------------------------------------------

create policy "athlete_members_select_members"
on public.athlete_members
for select
to authenticated
using (
  public.is_athlete_member(athlete_id)
);

create policy "athlete_members_insert_admins"
on public.athlete_members
for insert
to authenticated
with check (
  public.is_athlete_admin(athlete_id)
);

create policy "athlete_members_update_admins"
on public.athlete_members
for update
to authenticated
using (
  public.is_athlete_admin(athlete_id)
)
with check (
  public.is_athlete_admin(athlete_id)
);

create policy "athlete_members_delete_admins"
on public.athlete_members
for delete
to authenticated
using (
  public.is_athlete_admin(athlete_id)
);


-- ---------------------------------------------------------------------------
-- 12. Module-permission policies
-- ---------------------------------------------------------------------------

create policy "module_permissions_select_members"
on public.module_permissions
for select
to authenticated
using (
  public.is_athlete_member(athlete_id)
);

create policy "module_permissions_insert_admins"
on public.module_permissions
for insert
to authenticated
with check (
  public.is_athlete_admin(athlete_id)
);

create policy "module_permissions_update_admins"
on public.module_permissions
for update
to authenticated
using (
  public.is_athlete_admin(athlete_id)
)
with check (
  public.is_athlete_admin(athlete_id)
);

create policy "module_permissions_delete_admins"
on public.module_permissions
for delete
to authenticated
using (
  public.is_athlete_admin(athlete_id)
);
