create or replace function public.upsert_operations_ticket_template(
  p_template_id uuid,
  p_template_key text,
  p_template_name text,
  p_ticket_family text,
  p_execution_lane text,
  p_description text,
  p_default_priority integer,
  p_default_collection_mode text,
  p_default_manifest_types text[],
  p_default_skip_combined boolean,
  p_default_payload_json jsonb,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_template_id uuid;
begin
  if not core.is_platform_owner() then
    raise exception 'Only Team Optix platform owners can edit ticket templates.';
  end if;

  if nullif(trim(p_template_key), '') is null or nullif(trim(p_template_name), '') is null then
    raise exception 'Template key and name are required.';
  end if;

  if p_ticket_family is null or p_ticket_family <> all (array['manifest', 'report', 'sweep', 'system']) then
    raise exception 'Invalid ticket family.';
  end if;

  if p_execution_lane is null or p_execution_lane <> all (array['operations_manifest_capture_plan', 'operations_collection_request']) then
    raise exception 'Invalid execution lane.';
  end if;

  if p_default_priority is null or p_default_priority < 1 or p_default_priority > 999 then
    raise exception 'Default priority must be between 1 and 999.';
  end if;

  if p_template_id is null then
    insert into core.operations_ticket_template (
      template_key,
      template_name,
      ticket_family,
      execution_lane,
      description,
      default_priority,
      default_collection_mode,
      default_manifest_types,
      default_skip_combined,
      default_payload_json,
      is_active,
      updated_at
    ) values (
      upper(trim(p_template_key)),
      trim(p_template_name),
      p_ticket_family,
      p_execution_lane,
      nullif(trim(p_description), ''),
      p_default_priority,
      nullif(trim(p_default_collection_mode), ''),
      coalesce(p_default_manifest_types, array[]::text[]),
      coalesce(p_default_skip_combined, true),
      coalesce(p_default_payload_json, '{}'::jsonb),
      coalesce(p_is_active, true),
      now()
    )
    returning id into v_template_id;
  else
    update core.operations_ticket_template
    set
      template_key = upper(trim(p_template_key)),
      template_name = trim(p_template_name),
      ticket_family = p_ticket_family,
      execution_lane = p_execution_lane,
      description = nullif(trim(p_description), ''),
      default_priority = p_default_priority,
      default_collection_mode = nullif(trim(p_default_collection_mode), ''),
      default_manifest_types = coalesce(p_default_manifest_types, array[]::text[]),
      default_skip_combined = coalesce(p_default_skip_combined, true),
      default_payload_json = coalesce(p_default_payload_json, '{}'::jsonb),
      is_active = coalesce(p_is_active, true),
      updated_at = now()
    where id = p_template_id
    returning id into v_template_id;

    if v_template_id is null then
      raise exception 'Ticket template not found.';
    end if;
  end if;

  return v_template_id;
end;
$$;

create or replace function public.delete_operations_ticket_template(
  p_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
begin
  if not core.is_platform_owner() then
    raise exception 'Only Team Optix platform owners can delete ticket templates.';
  end if;

  if exists (
    select 1
    from core.company_operations_ticket_assignment
    where template_id = p_template_id
  ) then
    raise exception 'Delete the company assignments for this template first.';
  end if;

  delete from core.operations_ticket_template where id = p_template_id;
end;
$$;

create or replace function public.delete_company_operations_ticket_assignment(
  p_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
begin
  if not core.is_platform_owner() then
    raise exception 'Only Team Optix platform owners can delete ticket assignments.';
  end if;

  delete from core.company_operations_ticket_assignment where id = p_assignment_id;
end;
$$;

revoke all on function public.upsert_operations_ticket_template(uuid, text, text, text, text, text, integer, text, text[], boolean, jsonb, boolean) from public;
grant execute on function public.upsert_operations_ticket_template(uuid, text, text, text, text, text, integer, text, text[], boolean, jsonb, boolean) to authenticated, service_role;

revoke all on function public.delete_operations_ticket_template(uuid) from public;
grant execute on function public.delete_operations_ticket_template(uuid) to authenticated, service_role;

revoke all on function public.delete_company_operations_ticket_assignment(uuid) from public;
grant execute on function public.delete_company_operations_ticket_assignment(uuid) to authenticated, service_role;
