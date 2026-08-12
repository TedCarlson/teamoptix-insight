-- Fleet management is one governed company workspace across web and native.
-- Driver inspection submission intentionally remains under the independent
-- driver authority in submit_mobile_companion_fleet_inspection.

create or replace function public.create_company_fleet_work_order(
  p_company_slug text,
  p_vehicle_id uuid,
  p_defect_id uuid,
  p_title text,
  p_scope text,
  p_priority text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_id uuid;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null or not core.mobile_companion_can_use_workspace(v_company_id, 'fleet') then
    raise exception 'FLEET_ACCESS_REQUIRED';
  end if;
  if nullif(pg_catalog.btrim(p_title), '') is null then
    raise exception 'WORK_ORDER_TITLE_REQUIRED';
  end if;
  if p_priority not in ('ROUTINE','DUE_SOON','URGENT','OUT_OF_SERVICE','ROADSIDE') then
    raise exception 'INVALID_WORK_ORDER_PRIORITY';
  end if;
  if not exists (
    select 1 from fleet.vehicle vehicle
    where vehicle.id = p_vehicle_id and vehicle.company_id = v_company_id
  ) then
    raise exception 'VEHICLE_NOT_FOUND';
  end if;
  if p_defect_id is not null and not exists (
    select 1 from fleet.defect defect
    where defect.id = p_defect_id
      and defect.company_id = v_company_id
      and defect.vehicle_id = p_vehicle_id
      and defect.status in ('OPEN','TRIAGED')
  ) then
    raise exception 'DEFECT_UNAVAILABLE';
  end if;

  insert into fleet.work_order (
    company_id, vehicle_id, source, status, priority, title,
    scope_of_work, created_by_profile_id
  ) values (
    v_company_id, p_vehicle_id,
    case when p_defect_id is null then 'MANUAL' else 'INSPECTION' end,
    'OPEN', p_priority, pg_catalog.btrim(p_title),
    nullif(pg_catalog.btrim(p_scope), ''), core.current_profile_id()
  ) returning id into v_id;

  if p_defect_id is not null then
    insert into fleet.work_order_defect (work_order_id, defect_id, company_id)
    values (v_id, p_defect_id, v_company_id);
    update fleet.defect
    set status = 'WORK_ORDERED', triaged_by_profile_id = core.current_profile_id(),
      triaged_at = pg_catalog.coalesce(triaged_at, pg_catalog.now()), updated_at = pg_catalog.now()
    where id = p_defect_id and company_id = v_company_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.update_company_fleet_work_order(
  p_company_slug text,
  p_work_order_id uuid,
  p_status text,
  p_completion_notes text,
  p_labor_cost numeric,
  p_parts_cost numeric,
  p_outside_cost numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_vehicle_id uuid;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null or not core.mobile_companion_can_use_workspace(v_company_id, 'fleet') then
    raise exception 'FLEET_ACCESS_REQUIRED';
  end if;
  if p_status not in ('IN_PROGRESS','WAITING_PARTS','WAITING_VENDOR','COMPLETED','CANCELLED') then
    raise exception 'INVALID_WORK_ORDER_STATUS';
  end if;

  update fleet.work_order
  set status = p_status,
    completion_notes = case
      when nullif(pg_catalog.btrim(p_completion_notes), '') is null then completion_notes
      else pg_catalog.btrim(p_completion_notes)
    end,
    labor_cost = pg_catalog.coalesce(p_labor_cost, labor_cost),
    parts_cost = pg_catalog.coalesce(p_parts_cost, parts_cost),
    outside_cost = pg_catalog.coalesce(p_outside_cost, outside_cost),
    started_at = case when p_status = 'IN_PROGRESS' and started_at is null then pg_catalog.now() else started_at end,
    completed_at = case when p_status = 'COMPLETED' then pg_catalog.now() else completed_at end,
    certified_by_profile_id = case when p_status = 'COMPLETED' then core.current_profile_id() else certified_by_profile_id end,
    certified_at = case when p_status = 'COMPLETED' then pg_catalog.now() else certified_at end,
    updated_at = pg_catalog.now()
  where id = p_work_order_id
    and company_id = v_company_id
    and status not in ('COMPLETED','CANCELLED')
  returning vehicle_id into v_vehicle_id;

  if v_vehicle_id is null then raise exception 'WORK_ORDER_UNAVAILABLE'; end if;
  if p_status = 'COMPLETED' then
    update fleet.defect defect
    set status = 'REPAIRED', closed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    from fleet.work_order_defect relation
    where relation.work_order_id = p_work_order_id
      and relation.defect_id = defect.id
      and relation.company_id = v_company_id;
  end if;
end;
$$;

revoke all on function public.create_company_fleet_work_order(text, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_company_fleet_work_order(text, uuid, uuid, text, text, text) to authenticated, service_role;
revoke all on function public.update_company_fleet_work_order(text, uuid, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.update_company_fleet_work_order(text, uuid, text, text, numeric, numeric, numeric) to authenticated, service_role;

comment on function public.create_company_fleet_work_order(text, uuid, uuid, text, text, text) is
  'Creates governed Fleet work under the shared company Fleet workspace grant; driver inspection authority is independent.';
comment on function public.update_company_fleet_work_order(text, uuid, text, text, numeric, numeric, numeric) is
  'Advances governed Fleet work under the shared company Fleet workspace grant; completion records the authenticating profile as certifier.';
