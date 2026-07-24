begin;

insert into fleet.vehicle_class (key, label, description, nominal_capacity, capacity_unit, is_active, sort_order)
select
  case key when 'U10' then 'L10' when 'U15' then 'L15' when 'U20' then 'L20' end,
  case key when 'U10' then 'L10' when 'U15' then 'L15' when 'U20' then 'L20' end,
  description,
  nominal_capacity,
  capacity_unit,
  is_active,
  sort_order
from fleet.vehicle_class
where key in ('U10', 'U15', 'U20')
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  nominal_capacity = excluded.nominal_capacity,
  capacity_unit = excluded.capacity_unit,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

update fleet.vehicle
set vehicle_class_key = case vehicle_class_key
  when 'U10' then 'L10'
  when 'U15' then 'L15'
  when 'U20' then 'L20'
end
where vehicle_class_key in ('U10', 'U15', 'U20');

update fleet.driver_qualification
set vehicle_class_key = case vehicle_class_key
  when 'U10' then 'L10'
  when 'U15' then 'L15'
  when 'U20' then 'L20'
end
where vehicle_class_key in ('U10', 'U15', 'U20');

delete from fleet.vehicle_class where key in ('U10', 'U15', 'U20');

commit;
