# create-user

Owner-only Edge Function used by Tennis Player OS to create, link and edit an
account without requiring an invitation email.

New accounts may use a normal Tennis Player OS username. The function maps that
username to an internal technical Supabase Auth email under
`users.tennis.polidorionline.it`, confirms it server-side, and sets the supplied
temporary password. The user must replace that password at first login.

For a new account, the caller can assign one athlete, several selected athletes,
or all currently available athletes. The same athlete-level role and module
permissions are applied to all of those initial assignments.

When an existing user is edited, athlete visibility can also be changed:
existing assignments keep their own role and module permissions, the active
athlete receives the edited role/permissions, newly added athletes inherit those
same settings, and deselected non-owner assignments are removed. Athlete-owner
memberships are protected.

Every requested or managed athlete is independently verified server-side: the
caller must be an active Owner before any membership is changed.

Existing legacy email accounts remain supported.
