alter table core.company_operations_ticket_assignment
  add column if not exists operational_contract text not null default 'IN_DAY_OPERATIONS',
  add column if not exists cook_key text not null default 'GENERAL_COOK',
  add column if not exists artifact_keys text[] not null default '{}'::text[],
  add column if not exists active_start_date date not null default current_date,
  add column if not exists inactive_end_date date,
  add column if not exists release_order integer not null default 100,
  add column if not exists operator_notes text;

alter table core.company_operations_ticket_assignment
  drop constraint if exists company_operations_ticket_assignment_unique;

create unique index if not exists company_operations_ticket_assignment_contract_unique
  on core.company_operations_ticket_assignment (company_id, template_id, operational_contract);

alter table core.company_operations_ticket_assignment
  drop constraint if exists company_operations_ticket_assignment_contract_chk,
  add constraint company_operations_ticket_assignment_contract_chk check (
    operational_contract = any (array[
      'IN_DAY_OPERATIONS',
      'PREVIOUS_DAY_FINAL',
      'LAST_LOOK',
      'HISTORICAL_SWEEP',
      'TARGETED_COLLECTION'
    ])
  ),
  drop constraint if exists company_operations_ticket_assignment_cook_chk,
  add constraint company_operations_ticket_assignment_cook_chk check (
    cook_key = any (array['GENERAL_COOK', 'IN_DAY_REPORT_COOK', 'IN_DAY_MANIFEST_COOK', 'CATERING_COOK'])
  ),
  drop constraint if exists company_operations_ticket_assignment_release_order_chk,
  add constraint company_operations_ticket_assignment_release_order_chk check (release_order > 0),
  drop constraint if exists company_operations_ticket_assignment_effective_dates_chk,
  add constraint company_operations_ticket_assignment_effective_dates_chk check (
    inactive_end_date is null or inactive_end_date > active_start_date
  );

create or replace view public.company_operations_ticket_assignment_v
with (security_invoker = true) as
select
  -- Preserve the original view columns and their original order.
  a.id,
  a.company_id,
  c.company_slug,
  a.template_id,
  t.template_key,
  t.template_name,
  t.ticket_family,
  t.execution_lane,
  a.assignment_status,
  a.is_enabled,
  a.generation_mode,
  a.cadence_minutes,
  a.window_preset,
  a.start_time,
  a.end_time,
  a.priority_override,
  coalesce(a.priority_override, t.default_priority) as effective_priority,
  a.route_scope,
  a.route_limit,
  a.assignment_payload_json,
  a.last_generated_at,
  a.created_at,
  a.updated_at,

  -- Append the company work-order contract fields.
  c.company_name,
  a.operational_contract,
  a.cook_key,
  a.artifact_keys,
  a.active_start_date,
  a.inactive_end_date,
  a.release_order,
  a.operator_notes
from core.company_operations_ticket_assignment a
join core.companies c on c.id = a.company_id
join core.operations_ticket_template t on t.id = a.template_id;

create or replace function public.upsert_company_operations_work_order_rule(
  p_company_id uuid,
  p_template_id uuid,
  p_operational_contract text,
  p_cook_key text,
  p_artifact_keys text[],
  p_active_start_date date,
  p_inactive_end_date date,
  p_release_order integer,
  p_operator_notes text,
  p_assignment_status text,
  p_is_enabled boolean,
  p_generation_mode text,
  p_cadence_minutes integer,
  p_window_preset text,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_route_scope text,
  p_assignment_payload_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_assignment_id uuid;
begin
  if not core.is_platform_owner() then
    raise exception 'Only Team Optix platform owners can edit work-order rules.';
  end if;

  insert into core.company_operations_ticket_assignment (
    company_id, template_id, operational_contract, cook_key, artifact_keys,
    active_start_date, inactive_end_date, release_order, operator_notes,
    assignment_status, is_enabled, generation_mode, cadence_minutes,
    window_preset, start_time, end_time, route_scope, assignment_payload_json,
    updated_at
  ) values (
    p_company_id, p_template_id, p_operational_contract, p_cook_key,
    coalesce(p_artifact_keys, '{}'::text[]), coalesce(p_active_start_date, current_date),
    p_inactive_end_date, coalesce(p_release_order, 100), nullif(trim(p_operator_notes), ''),
    p_assignment_status, coalesce(p_is_enabled, false), p_generation_mode,
    p_cadence_minutes, p_window_preset, p_start_time, p_end_time,
    p_route_scope, coalesce(p_assignment_payload_json, '{}'::jsonb), now()
  )
  on conflict (company_id, template_id, operational_contract)
  do update set
    cook_key = excluded.cook_key,
    artifact_keys = excluded.artifact_keys,
    active_start_date = excluded.active_start_date,
    inactive_end_date = excluded.inactive_end_date,
    release_order = excluded.release_order,
    operator_notes = excluded.operator_notes,
    assignment_status = excluded.assignment_status,
    is_enabled = excluded.is_enabled,
    generation_mode = excluded.generation_mode,
    cadence_minutes = excluded.cadence_minutes,
    window_preset = excluded.window_preset,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    route_scope = excluded.route_scope,
    assignment_payload_json = excluded.assignment_payload_json,
    updated_at = now()
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

grant execute on function public.upsert_company_operations_work_order_rule(
  uuid, uuid, text, text, text[], date, date, integer, text,
  text, boolean, text, integer, text, time without time zone,
  time without time zone, text, jsonb
) to authenticated, service_role;

create or replace function public.update_company_operations_work_order_rule(
  p_assignment_id uuid,
  p_assignment_status text,
  p_is_enabled boolean,
  p_inactive_end_date date,
  p_release_order integer
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from core.company_operations_ticket_assignment
  where id = p_assignment_id;

  if v_company_id is null then
    raise exception 'Work order not found.';
  end if;

  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Not authorized to update this company work order.';
  end if;

  update core.company_operations_ticket_assignment
  set assignment_status = coalesce(p_assignment_status, assignment_status),
      is_enabled = coalesce(p_is_enabled, is_enabled),
      inactive_end_date = p_inactive_end_date,
      release_order = coalesce(p_release_order, release_order),
      updated_at = now()
  where id = p_assignment_id;
end;
$$;

grant execute on function public.update_company_operations_work_order_rule(uuid, text, boolean, date, integer)
  to authenticated, service_role;
