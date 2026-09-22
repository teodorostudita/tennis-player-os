# invite-user Edge Function

Server-side invitation endpoint for Tennis Player OS.

Security model:
- requires an authenticated Supabase user;
- verifies that the caller is the `owner` of the selected athlete;
- only then uses the service-role key, which remains server-side;
- supports roles `admin` and `member`;
- for `member`, replaces per-module read/write permissions atomically enough for the current UI flow;
- sends a Supabase invitation email only when the email does not already belong to an Auth user.

Deploy from the repository root:

    supabase functions deploy invite-user

Do not put `SUPABASE_SERVICE_ROLE_KEY` in frontend code or in Git.
Supabase-hosted Edge Functions provide the project service-role secret in the server environment.
