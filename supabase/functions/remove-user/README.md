# remove-user

Owner-only Edge Function used by Tennis Player OS to remove a non-owner user
from the active athlete.

It removes the athlete membership and module permissions. If the target user
has no remaining athlete memberships, the Supabase Auth account is deleted as
well, which makes the email address reusable. If other athlete memberships
remain, the account is preserved and its global admin/create-athlete capability
is recalculated from the remaining active memberships.
