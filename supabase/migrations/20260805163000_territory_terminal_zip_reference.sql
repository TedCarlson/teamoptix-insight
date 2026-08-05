begin;

-- Adds the configured terminal ZIP centroid to the existing contract-scoped
-- Territory aggregate without introducing another client/database round trip.
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
begin
  v_result := public.get_company_territory_zip_source(
    p_company_slug,
    p_start_date,
    p_end_date
  );

  v_terminal_zip := (
    regexp_match(
      coalesce(v_result #>> '{terminal,submitted_address}', ''),
      '([0-9]{5})(?:-[0-9]{4})?[[:space:]]*$'
    )
  )[1];

  if v_terminal_zip is not null then
    select reference.*
    into v_terminal_reference
    from ref.zip_code reference
    where reference.zip_code = v_terminal_zip;
  end if;

  if v_terminal_reference.zip_code is not null
    and v_terminal_reference.latitude is not null
    and v_terminal_reference.longitude is not null
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
