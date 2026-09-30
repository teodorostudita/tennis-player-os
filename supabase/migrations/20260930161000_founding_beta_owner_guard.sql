-- Tennis Player OS v1.0.22
-- Founding Beta hardening:
-- - the global app owner never consumes one of the 30 Beta slots
-- - clean up any accidental owner reservation created during testing

-- Remove accidental reservations belonging to the global application owner.
delete from public.beta_accounts ba
using public.account_access aa
where ba.user_id = aa.user_id
  and ba.program_code = 'founding_beta'
  and aa.role = 'owner';

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
  if exists (
    select 1
    from public.account_access aa
    where aa.user_id = p_user_id
      and aa.role = 'owner'
  ) then
    raise exception 'L''Owner globale non può occupare un posto Founding Beta.';
  end if;

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

revoke all on function public.reserve_founding_beta_slot(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_founding_beta_slot(uuid, text, text, uuid)
  to service_role;
