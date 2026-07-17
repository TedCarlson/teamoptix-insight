-- These canonical route-detail views already exist in the live schema with a
-- wider, stable column contract. Preserve that contract and only assert the
-- read grants required by the Service route drawer.

grant select on table public.operations_delivery_manifest_stop_v
  to authenticated, service_role;

grant select on table public.operations_delivery_manifest_package_v
  to authenticated, service_role;

grant select on table public.operations_pickup_manifest_stop_v
  to authenticated, service_role;
