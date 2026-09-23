# Generic module cloud state

`athlete_module_state` is the temporary generic cloud persistence layer for
non-Calendar modules while their domain models are still evolving.

Each athlete/module pair stores one JSONB payload plus:

- `schema_version`: payload-shape version for future migrations;
- `revision`: monotonically increasing row revision for optional optimistic
  concurrency checks;
- `updated_by`, `created_at`, `updated_at`: audit metadata.

Access is enforced through the existing `has_module_access()` helper:

- read permission can select;
- write permission can insert/update/delete;
- athlete admins/owners retain implicit full access.

Calendar intentionally remains outside this table because it already has a
dedicated normalized cloud schema.

v0.23.0 only installs the infrastructure. No existing UI module is switched to
cloud persistence yet. The first live module can be connected separately after
the provider is verified.
