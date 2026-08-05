-- Keep pickup reliability ownership attached to the immutable DSW route row.

create or replace function public.get_company_corrective_action_dsw_evidence(
  p_company_slug text,
  p_service_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
begin
  select id
  into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (
    core.is_platform_owner()
    or core.can_admin_company(v_company_id)
  ) then
    raise exception 'Company admin access required.';
  end if;

  return coalesce((
    with selected_batch as (
      select b.*
      from core.operations_report_batch b
      where b.company_id = v_company_id
        and b.report_family_key = 'DSW'
        and b.service_date = p_service_date
        and b.status = 'LOADED'
      order by
        case when b.snapshot_kind = 'FINAL' then 0 else 1 end,
        b.created_at desc
      limit 1
    )
    select jsonb_build_object(
      'service_date', p_service_date,
      'source', case
        when b.snapshot_kind = 'FINAL' then 'DSW_FINAL'
        else 'DSW_IN_DAY'
      end,
      'batch_id', b.id,
      'rows', coalesce(jsonb_agg(jsonb_build_object(
        'row_id', r.id,
        'route_baseline_id', nullif(
          r.normalized_row_json ->> 'route_baseline_id',
          ''
        ),
        'route_name', coalesce(
          nullif(r.normalized_row_json ->> 'wa_name', ''),
          r.source_route_key
        ),
        'wa_number', coalesce(
          nullif(r.normalized_row_json ->> 'wa_number', ''),
          r.source_wa_number
        ),
        'driver_name', coalesce(
          nullif(r.normalized_row_json ->> 'driver_name', ''),
          r.source_driver_name
        ),
        'vehicle_text', r.normalized_row_json ->> 'vehicle_text',
        'vscan_packages', r.normalized_row_json -> 'vscan_packages',
        'planned_delivery_stops',
          r.normalized_row_json -> 'planned_delivery_stops',
        'actual_delivery_stops',
          r.normalized_row_json -> 'actual_delivery_stops',
        'actual_delivery_packages',
          r.normalized_row_json -> 'actual_delivery_packages',
        'planned_pickup_stops',
          r.normalized_row_json -> 'planned_pickup_stops',
        'actual_pickup_stops',
          r.normalized_row_json -> 'actual_pickup_stops',
        'actual_pickup_packages',
          r.normalized_row_json -> 'actual_pickup_packages',
        'non_delivered_stops',
          r.normalized_row_json -> 'non_delivered_stops',
        'exceptions', r.normalized_row_json -> 'exceptions',
        'code_85', r.normalized_row_json -> 'code_85',
        'dna', r.normalized_row_json -> 'dna',
        'send_again', r.normalized_row_json -> 'send_again',
        'all_status_code_packages',
          r.normalized_row_json -> 'all_status_code_packages',
        'required_signature',
          r.normalized_row_json -> 'required_signature',
        'early_late_pickups_raw', r.early_late_pickups_raw,
        'early_pickups', r.early_pickups,
        'late_pickups', r.late_pickups,
        'potential_missed_pickups', r.potential_missed_pickups,
        'early_late_pickups',
          coalesce(r.early_pickups, 0) + coalesce(r.late_pickups, 0),
        'ils_percent', r.normalized_row_json -> 'ils_percent',
        'miles', r.normalized_row_json -> 'miles',
        'on_road_hours', r.normalized_row_json -> 'on_road_hours',
        'on_duty_hours', r.normalized_row_json -> 'on_duty_hours'
      ) order by r.source_row_index) filter (where r.id is not null), '[]'::jsonb)
    )
    from selected_batch b
    left join core.operations_report_raw_row r
      on r.batch_id = b.id
      and r.row_kind = 'ROUTE'
    group by b.id, b.snapshot_kind
  ), jsonb_build_object(
    'service_date', p_service_date,
    'source', null,
    'batch_id', null,
    'rows', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.get_company_corrective_action_dsw_evidence(
  text,
  date
) from public;

grant execute on function public.get_company_corrective_action_dsw_evidence(
  text,
  date
) to authenticated, service_role;
