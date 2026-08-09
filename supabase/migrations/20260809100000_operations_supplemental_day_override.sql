create or replace function public.set_company_operations_date_override(
  p_company_slug text,
  p_operational_date date,
  p_override_mode text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_mode text := upper(trim(coalesce(p_override_mode, '')));
  v_date_key text;
  v_assignment_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if p_operational_date is null then
    raise exception 'Operational date is required.' using errcode = '22023';
  end if;

  if v_mode not in ('OPERATING', 'CLOSED', 'INHERIT') then
    raise exception 'Override mode must be OPERATING, CLOSED, or INHERIT.'
      using errcode = '22023';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = trim(p_company_slug);

  if v_company_id is null then
    raise exception 'Company not found.' using errcode = 'P0002';
  end if;

  v_date_key := to_char(p_operational_date, 'YYYY-MM-DD');

  update core.company_operations_ticket_assignment assignment
  set
    assignment_payload_json = jsonb_set(
      coalesce(assignment.assignment_payload_json, '{}'::jsonb),
      '{operating_date_overrides}',
      case
        when v_mode = 'INHERIT' then
          coalesce(assignment.assignment_payload_json -> 'operating_date_overrides', '{}'::jsonb)
            - v_date_key
        else
          coalesce(assignment.assignment_payload_json -> 'operating_date_overrides', '{}'::jsonb)
            || jsonb_build_object(v_date_key, v_mode)
      end,
      true
    ),
    last_generated_at = case
      when v_mode = 'OPERATING' then null
      else assignment.last_generated_at
    end,
    updated_at = now()
  where assignment.company_id = v_company_id
    and assignment.operational_contract = 'IN_DAY_OPERATIONS'
    and assignment.assignment_status = 'active'
    and assignment.is_enabled = true
    and assignment.active_start_date <= p_operational_date
    and (
      assignment.inactive_end_date is null
      or assignment.inactive_end_date > p_operational_date
    );

  get diagnostics v_assignment_count = row_count;

  if v_assignment_count = 0 then
    raise exception 'No active in-day collection assignment was found.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'company_id', v_company_id,
    'company_slug', trim(p_company_slug),
    'operational_date', v_date_key,
    'override_mode', v_mode,
    'assignment_count', v_assignment_count,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.set_company_operations_date_override(text, date, text)
  from public;
grant execute on function public.set_company_operations_date_override(text, date, text)
  to service_role;

notify pgrst, 'reload schema';
