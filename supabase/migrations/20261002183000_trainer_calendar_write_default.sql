-- Tennis Player OS v1.2.5
-- Upgrade only untouched legacy Trainer presets so Calendar becomes writable.
-- Custom permission sets are deliberately left unchanged.

with legacy_trainer_assignments as (
  select mp.athlete_id, mp.user_id
  from public.module_permissions mp
  join public.profiles p
    on p.id = mp.user_id
  where p.user_type = 'trainer'
  group by mp.athlete_id, mp.user_id
  having count(*) = 11
     and bool_and(mp.can_read)
     and count(*) filter (where mp.can_write) = 1
     and bool_or(mp.module_key = 'training' and mp.can_write)
     and bool_or(mp.module_key = 'calendar' and mp.can_read and not mp.can_write)
     and count(*) filter (where mp.module_key = 'economics') = 0
     and count(*) filter (
       where mp.module_key in (
         'calendar','training','development','drills','competition','opponents',
         'equipment','health','nutrition','mental','visual'
       )
     ) = 11
)
update public.module_permissions mp
set can_write = true,
    updated_at = now()
from legacy_trainer_assignments legacy
where mp.athlete_id = legacy.athlete_id
  and mp.user_id = legacy.user_id
  and mp.module_key = 'calendar'
  and mp.can_read = true
  and mp.can_write = false;
