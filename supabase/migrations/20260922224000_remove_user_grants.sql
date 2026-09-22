-- Tennis Player OS v0.20.1
-- The remove-user Edge Function uses service_role to delete a non-owner
-- athlete membership after verifying the caller is an athlete owner.

grant delete
  on table public.athlete_members
  to service_role;
