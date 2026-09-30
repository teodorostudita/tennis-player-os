-- Tennis Player OS v1.0.18
-- Founding Beta: 30 account slots, public counter, server-side reservation.

create table if not exists public.beta_programs (
  code text primary key,
  capacity integer not null check (capacity > 0),
  status text not null default 'active'
    check (status in ('active', 'closed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.beta_programs enable row level security;

drop trigger if exists beta_programs_set_updated_at on public.beta_programs;
create trigger beta_programs_set_updated_at
before update on public.beta_programs
for each row execute function public.set_updated_at();

insert into public.beta_programs (code, capacity, status)
values ('founding_beta', 30, 'active')
on conflict (code) do update
set capacity = excluded.capacity;

create table if not exists public.beta_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  program_code text not null default 'founding_beta'
    references public.beta_programs(code) on delete restrict,
  email text not null,
  display_name text,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.beta_accounts enable row level security;

drop trigger if exists beta_accounts_set_updated_at on public.beta_accounts;
create trigger beta_accounts_set_updated_at
before update on public.beta_accounts
for each row execute function public.set_updated_at();

create index if not exists beta_accounts_program_status_idx
  on public.beta_accounts (program_code, status);

revoke all on table public.beta_programs from public, anon, authenticated;
revoke all on table public.beta_accounts from public, anon, authenticated;

grant select, insert, update, delete on table public.beta_programs to service_role;
grant select, insert, update, delete on table public.beta_accounts to service_role;

create or replace function public.get_founding_beta_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_capacity integer := 30;
  v_program_status text := 'active';
  v_active integer := 0;
begin
  select bp.capacity, bp.status
    into v_capacity, v_program_status
  from public.beta_programs bp
  where bp.code = 'founding_beta';

  select count(*)::integer
    into v_active
  from public.beta_accounts ba
  where ba.program_code = 'founding_beta'
    and ba.status = 'active';

  return jsonb_build_object(
    'ok', true,
    'capacity', coalesce(v_capacity, 30),
    'active', v_active,
    'remaining', greatest(coalesce(v_capacity, 30) - v_active, 0),
    'full', v_active >= coalesce(v_capacity, 30),
    'status', coalesce(v_program_status, 'active')
  );
end;
$$;

revoke all on function public.get_founding_beta_status() from public;
grant execute on function public.get_founding_beta_status() to anon, authenticated, service_role;

create or replace function public.reserve_founding_beta_slot(
  p_user_id uuid,
  p_email text,
  p_display_name text default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_program_status text;
  v_active integer;
  v_existing_status text;
begin
  select ba.status
    into v_existing_status
  from public.beta_accounts ba
  where ba.user_id = p_user_id
    and ba.program_code = 'founding_beta';

  if v_existing_status = 'active' then
    return public.get_founding_beta_status();
  end if;

  select bp.capacity, bp.status
    into v_capacity, v_program_status
  from public.beta_programs bp
  where bp.code = 'founding_beta'
  for update;

  if v_capacity is null then
    raise exception 'Programma Founding Beta non configurato.';
  end if;

  if v_program_status <> 'active' then
    raise exception 'La Founding Beta non è attiva.';
  end if;

  select count(*)::integer
    into v_active
  from public.beta_accounts ba
  where ba.program_code = 'founding_beta'
    and ba.status = 'active';

  if v_active >= v_capacity then
    raise exception 'Tutti i posti della Founding Beta sono già stati assegnati.';
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
    lower(trim(p_email)),
    nullif(trim(coalesce(p_display_name, '')), ''),
    'active',
    p_created_by
  )
  on conflict (user_id) do update
  set
    program_code = 'founding_beta',
    email = excluded.email,
    display_name = excluded.display_name,
    status = 'active',
    created_by = excluded.created_by,
    updated_at = now();

  return public.get_founding_beta_status();
end;
$$;

revoke all on function public.reserve_founding_beta_slot(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_founding_beta_slot(uuid, text, text, uuid) to service_role;
