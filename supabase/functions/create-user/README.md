# create-user

Owner-only Edge Function used by Tennis Player OS to create or assign accounts.

For a new email it creates a confirmed Supabase Auth user with a temporary
password. No invitation email is sent. The account is marked
`must_change_password = true`, so the frontend forces a password change at
the first login.

For an existing email, the Auth password is never changed; only the athlete
membership, role and module permissions are updated.
