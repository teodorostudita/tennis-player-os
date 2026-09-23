# create-user

Owner-only Edge Function used by Tennis Player OS to create or link an account
without requiring an invitation email.

New accounts may use a normal Tennis Player OS username. The function maps that
username to an internal technical Supabase Auth email under
`users.tennis.polidorionline.it`, confirms it server-side, and sets the supplied
temporary password. The user must replace that password at first login.

The caller can assign the account to one athlete, several selected athletes, or
all athletes selected in the frontend. The function independently verifies that
the caller is an active Owner of every requested athlete before writing any
membership. The same athlete-level role and module permissions are applied to
all selected athletes.

Existing legacy email accounts remain supported.
