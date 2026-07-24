begin;
alter table fleet.vehicle drop constraint if exists fleet_vehicle_status_ck;
alter table fleet.vehicle add constraint fleet_vehicle_status_ck check (status in ('INTAKE','READY','ASSIGNED','SPARE','MAINTENANCE','OUT_OF_SERVICE','RETIRED'));
comment on column fleet.vehicle.status is 'INTAKE is a valid observable Fleet record awaiting later enrichment; it is not dispatch-ready.';
commit;
