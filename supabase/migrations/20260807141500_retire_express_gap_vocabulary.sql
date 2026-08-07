-- The canonical Express projection exposes exclusive performance states plus
-- separate evidence-health counts. Remove the last legacy "gap" name from the
-- active projection and retire any historical watchlist rows that survived in
-- an already-closed state.

alter view public.operations_manifest_express_route_signal_v
  rename column tracking_gap_package_count to data_quality_package_count;

comment on column public.operations_manifest_express_route_signal_v.data_quality_package_count is
  'Packages with missing identity or stop linkage. This is evidence health and is never a performance state.';

update core.operations_watchlist_item
set
  signal_type = 'EXPRESS_LEGACY_GAP_RETIRED',
  title = 'Retired · legacy Express evidence signal',
  detail = 'Superseded by Complete | Attempted | Open performance and separate evidence health.',
  client_visible = false,
  updated_at = now()
where signal_type = 'EXPRESS_TRACKING_GAP';

notify pgrst, 'reload schema';
