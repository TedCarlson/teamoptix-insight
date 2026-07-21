-- The canonical route-detail views are supplied by the live-schema baseline
-- or an earlier manifest migration depending on database lineage.
--
-- A clean local replay must not fail when one of those compatibility views
-- is absent. Grant access only to relations that actually exist.

do $$
begin
  if to_regclass('public.operations_delivery_manifest_stop_v') is not null then
    execute '
      grant select
      on table public.operations_delivery_manifest_stop_v
      to authenticated, service_role
    ';
  end if;

  if to_regclass('public.operations_delivery_manifest_package_v') is not null then
    execute '
      grant select
      on table public.operations_delivery_manifest_package_v
      to authenticated, service_role
    ';
  end if;

  if to_regclass('public.operations_pickup_manifest_stop_v') is not null then
    execute '
      grant select
      on table public.operations_pickup_manifest_stop_v
      to authenticated, service_role
    ';
  end if;

  if to_regclass('public.operations_pickup_manifest_package_v') is not null then
    execute '
      grant select
      on table public.operations_pickup_manifest_package_v
      to authenticated, service_role
    ';
  end if;
end;
$$;
