begin;

-- Keep the physical terminal and the drivable entrance as separate facts. The
-- terminal point anchors Territory reporting; the access point is retained for
-- later route-mile and travel-time analysis.
alter table public.company_terminal
  add column if not exists access_latitude double precision,
  add column if not exists access_longitude double precision,
  add column if not exists access_location_source text,
  add column if not exists access_verified_at timestamp with time zone;

alter table public.company_terminal
  drop constraint if exists company_terminal_access_latitude_valid,
  drop constraint if exists company_terminal_access_longitude_valid,
  add constraint company_terminal_access_latitude_valid
    check (access_latitude is null or access_latitude between -90 and 90),
  add constraint company_terminal_access_longitude_valid
    check (access_longitude is null or access_longitude between -180 and 180);

update public.company_terminal terminal
set
  postal_code = '30909',
  latitude = 33.367883945784406,
  longitude = -81.98680221171706,
  location_source = 'USER_VERIFIED_TERMINAL',
  location_verified_at = '2026-08-05T16:41:23Z'::timestamptz,
  access_latitude = 33.36819130373066,
  access_longitude = -81.98452646306573,
  access_location_source = 'USER_VERIFIED_DRIVE_ENTRANCE',
  access_verified_at = '2026-08-05T16:41:23Z'::timestamptz
from core.companies company
where company.id = terminal.company_id
  and company.company_slug = 'beacon-point-ventures'
  and terminal.terminal_code = '249'
  and terminal.is_active = true;

create or replace function public.get_company_territory_zip_report(
  p_company_slug text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public, ref
as $$
declare
  v_result jsonb;
  v_terminal public.company_terminal%rowtype;
  v_terminal_zip text;
  v_terminal_reference ref.zip_code%rowtype;
  v_terminal_point extensions.geography;
  v_location_precision text;
  v_rows jsonb;
begin
  v_result := public.get_company_territory_zip_source(
    p_company_slug,
    p_start_date,
    p_end_date
  );

  select terminal.*
  into v_terminal
  from public.company_terminal terminal
  join core.companies company
    on company.id = terminal.company_id
  where company.company_slug = lower(btrim(p_company_slug))
    and terminal.is_active = true
  order by terminal.created_at
  limit 1;

  v_terminal_zip := case
    when regexp_replace(coalesce(v_terminal.postal_code, ''), '[^0-9]', '', 'g') ~ '^[0-9]{5,}$'
    then left(regexp_replace(v_terminal.postal_code, '[^0-9]', '', 'g'), 5)
    else null
  end;

  if v_terminal_zip is not null then
    select reference.*
    into v_terminal_reference
    from ref.zip_code reference
    where reference.zip_code = v_terminal_zip;
  end if;

  if v_terminal.latitude is not null and v_terminal.longitude is not null then
    v_terminal_point := extensions.st_setsrid(
      extensions.st_point(v_terminal.longitude, v_terminal.latitude),
      4326
    )::extensions.geography;
    v_location_precision := 'VERIFIED_POINT';
  elsif v_terminal_reference.centroid is not null then
    v_terminal_point := v_terminal_reference.centroid;
    v_location_precision := 'ZIP_CENTROID';
  end if;

  v_result := jsonb_set(
    v_result,
    '{terminal}',
    coalesce(v_result -> 'terminal', '{}'::jsonb) || jsonb_build_object(
      'postal_code', v_terminal_zip,
      'exact_latitude', v_terminal.latitude,
      'exact_longitude', v_terminal.longitude,
      'location_source', v_terminal.location_source,
      'location_verified_at', v_terminal.location_verified_at,
      'location_precision', v_location_precision,
      'access_latitude', v_terminal.access_latitude,
      'access_longitude', v_terminal.access_longitude,
      'access_location_source', v_terminal.access_location_source,
      'access_verified_at', v_terminal.access_verified_at,
      'distance_origin', case
        when v_location_precision = 'VERIFIED_POINT' then 'TERMINAL_POINT'
        when v_location_precision = 'ZIP_CENTROID' then 'TERMINAL_ZIP_CENTROID'
        else null
      end,
      'reference_zip', v_terminal_reference.zip_code,
      'reference_latitude', v_terminal_reference.latitude,
      'reference_longitude', v_terminal_reference.longitude,
      'reference_source', v_terminal_reference.coordinate_source,
      'reference_method', v_terminal_reference.coordinate_method
    ),
    true
  );

  if v_terminal_point is not null then
    select jsonb_agg(
      case
        when item.row ->> 'latitude' is not null
          and item.row ->> 'longitude' is not null
        then item.row || jsonb_build_object(
          'terminal_distance_miles', round((
            extensions.st_distance(
              v_terminal_point,
              extensions.st_setsrid(
                extensions.st_point(
                  (item.row ->> 'longitude')::double precision,
                  (item.row ->> 'latitude')::double precision
                ),
                4326
              )::extensions.geography
            ) / 1609.344
          )::numeric, 2)
        )
        else item.row || jsonb_build_object('terminal_distance_miles', null)
      end
      order by item.ordinality
    )
    into v_rows
    from jsonb_array_elements(coalesce(v_result -> 'rows', '[]'::jsonb))
      with ordinality as item(row, ordinality);

    v_result := jsonb_set(v_result, '{rows}', coalesce(v_rows, '[]'::jsonb), true);
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_company_territory_zip_report(
  text,
  date,
  date
) from public;

grant execute on function public.get_company_territory_zip_report(
  text,
  date,
  date
) to authenticated, service_role;

commit;
