-- Tennis Player OS v1.2.13
-- Allow Footwork Pattern entities inside the existing Athletics record store.

alter table public.athletics_records
  drop constraint if exists athletics_records_record_type_check;

alter table public.athletics_records
  add constraint athletics_records_record_type_check
  check (
    record_type in (
      'weekly_program',
      'test',
      'test_result',
      'session',
      'goal',
      'footwork_pattern'
    )
  );

comment on table public.athletics_records is
  'Athletics entities stored individually so responsibility and RLS can be enforced per record, including Footwork Patterns.';
