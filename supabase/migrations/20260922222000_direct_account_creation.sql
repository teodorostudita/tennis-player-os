-- Tennis Player OS v0.20.0
-- Direct account creation with a temporary password.

alter table public.account_access
  add column if not exists must_change_password boolean not null default false;

comment on column public.account_access.must_change_password is
  'When true, the user must choose a new password before entering the application.';

create or replace function public.complete_initial_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.account_access
  set must_change_password = false,
      updated_at = now()
  where user_id = (select auth.uid());

  if not found then
    raise exception 'Account access row not found.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.complete_initial_password_change()
  from public, anon;

grant execute on function public.complete_initial_password_change()
  to authenticated;
