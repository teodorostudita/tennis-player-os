# create-user

Owner-only Edge Function used by Tennis Player OS to create or link users to an athlete.

New accounts use a username rather than requiring a personal email address. The function
maps each username to an internal Supabase Auth address under
`@users.tennis.polidorionline.it`, creates the account with a temporary password, marks the
email as confirmed, and requires a password change on first login.

Legacy accounts that already use a real email remain supported and can continue to sign in
with that email.
