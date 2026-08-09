begin;

-- MC-0: define the Mobile Companion warehouse contract before creating or
-- extending any Platform-owned objects.  These records deliberately stop at
-- DEFINED; the implementation migration advances them only after the governed
-- schema and write contracts exist.
insert into platform.switchboard (
  library_key,
  display_name,
  source_schema,
  source_object,
  object_type,
  status,
  source,
  notes
)
values
  (
    'core.driver_tracking_session',
    'Driver Tracking Session',
    'core',
    'driver_tracking_session',
    'TABLE',
    'DEFINED',
    'PLATFORM',
    'MC-0 governed contract. Duty-scoped Mobile Companion tracking envelope. Device evidence is observational and is not automatically payroll, vehicle, carrier, or delivery truth.'
  ),
  (
    'core.driver_breadcrumb_batch',
    'Driver Breadcrumb Batch',
    'core',
    'driver_breadcrumb_batch',
    'TABLE',
    'DEFINED',
    'PLATFORM',
    'MC-0 governed contract. Immutable, device-identified synchronization batch with explicit acknowledgments and tenant-scoped idempotency.'
  ),
  (
    'core.driver_breadcrumb_point',
    'Driver Breadcrumb Point',
    'core',
    'driver_breadcrumb_point',
    'TABLE',
    'DEFINED',
    'PLATFORM',
    'MC-0 governed shared warehouse. Preserves DRIVER_WEB versus MOBILE_COMPANION provenance. Mobile points require a governed duty session and batch and remain observational device evidence.'
  )
on conflict (source_schema, source_object, object_type) do update
set
  library_key = excluded.library_key,
  display_name = excluded.display_name,
  status = 'DEFINED',
  source = 'PLATFORM',
  notes = concat_ws(
    E'\n\n',
    nullif(btrim(platform.switchboard.notes), ''),
    excluded.notes
  );

commit;
