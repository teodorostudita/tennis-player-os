-- Tennis Player OS
-- Allow the server-side Supabase Edge Function (service_role) to manage
-- athlete memberships and module permissions without exposing those
-- privileges to browser clients.

grant select, insert, update
  on table public.athlete_members
  to service_role;

grant select, insert, update, delete
  on table public.module_permissions
  to service_role;

grant select, update
  on table public.profiles
  to service_role;
