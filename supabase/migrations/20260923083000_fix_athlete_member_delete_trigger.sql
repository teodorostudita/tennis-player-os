-- Tennis Player OS v0.20.2
-- Fix athlete_members BEFORE DELETE trigger.
--
-- In a BEFORE DELETE trigger PostgreSQL requires OLD to be returned in order
-- for the deletion to proceed. The previous implementation fell through to
-- RETURN NEW for non-owner rows; NEW is NULL during DELETE, so PostgreSQL
-- silently cancelled deletion of ordinary admin/member memberships.

create or replace function public.protect_last_athlete_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner'
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
    end if;

    -- Mandatory for BEFORE DELETE: OLD means "continue deleting this row".
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
