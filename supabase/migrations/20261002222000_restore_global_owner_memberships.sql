-- Tennis Player OS v1.2.6
-- Restore the intended invariant: every global application Owner is an
-- athlete-level Owner of every non-deleted athlete in the workspace.

insert into public.athlete_members (
  athlete_id,
  user_id,
  role,
  status,
  created_by
)
select
  a.id,
  aa.user_id,
  'owner',
  'active',
  aa.user_id
from public.account_access aa
cross join public.athletes a
where aa.role = 'owner'
  and a.deleted_at is null
on conflict (athlete_id, user_id)
do update set
  role = 'owner',
  status = 'active',
  updated_at = now();
