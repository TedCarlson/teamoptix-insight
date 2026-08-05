begin;

-- Materializes one authoritative straight-line distance for every Territory
-- ZIP row using the active terminal ZIP centroid, all inside the existing RPC.
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
  v_terminal_zip text;
  v_terminal_reference ref.zip_code%rowtype;
  v_rows jsonb;
begin
  v_result := public.get_company_territory_zip_source(
    p_company_slug,
    p_start_date,
    p_end_date
  );

  select case
    when regexp_replace(coalesce(terminal.postal_code, ''), '[^0-9]', '', 'g') ~ '^[0-9]{5,}$'
    then left(regexp_replace(terminal.postal_code, '[^0-9]', '', 'g'), 5)
    else null
  end
  into v_terminal_zip
  from public.company_terminal terminal
  join core.companies company
    on company.id = terminal.company_id
  where company.company_slug = lower(btrim(p_company_slug))
    and terminal.is_active = true
  order by terminal.created_at
  limit 1;

  if v_terminal_zip is not null then
    select reference.*
    into v_terminal_reference
    from ref.zip_code reference
    where reference.zip_code = v_terminal_zip;
  end if;

  if v_terminal_reference.zip_code is not null
    and v_terminal_reference.centroid is not null
  then
    v_result := jsonb_set(
      v_result,
      '{terminal}',
      coalesce(v_result -> 'terminal', '{}'::jsonb) || jsonb_build_object(
        'reference_zip', v_terminal_reference.zip_code,
        'reference_latitude', v_terminal_reference.latitude,
        'reference_longitude', v_terminal_reference.longitude,
        'reference_source', v_terminal_reference.coordinate_source,
        'reference_method', v_terminal_reference.coordinate_method
      ),
      true
    );

    select jsonb_agg(
      case
        when item.row ->> 'latitude' is not null
          and item.row ->> 'longitude' is not null
        then item.row || jsonb_build_object(
          'terminal_distance_miles', round((
            extensions.st_distance(
              v_terminal_reference.centroid,
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
