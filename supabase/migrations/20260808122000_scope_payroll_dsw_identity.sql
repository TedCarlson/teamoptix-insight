-- The legacy payroll rebuild joined DSW identifiers before applying company
-- scope and then fell back to the unscoped roster id. That becomes unsafe as
-- soon as the same foreign DSWID is represented in two Insight companies.
-- Patch the existing large projection in place and fail closed if its expected
-- definition has drifted.

do $$
declare
  v_definition text;
  v_old_join text := $join$
    left join core.company_roster_identifier cri
      on cri.identifier_type = 'dswid'
     and upper(trim(cri.identifier_value)) = upper(trim(coalesce(r.source_dswid, r.source_driver_name)))
    left join core.company_roster cr
      on cr.id = cri.roster_id
     and cr.company_id = b.company_id
$join$;
  v_new_join text := $join$
    left join lateral (
      select coalesce(
        (
          select matched.id
          from core.company_roster matched
          where matched.id = r.matched_roster_member_id
            and matched.company_id = b.company_id
        ),
        core.resolve_roster_identity(
          b.company_id,
          coalesce(
            nullif(r.normalized_row_json ->> 'driver_name', ''),
            r.source_driver_name
          ),
          coalesce(r.source_dswid, r.source_driver_name),
          null
        )
      ) as roster_id
    ) cri on true
    left join core.company_roster cr
      on cr.id = cri.roster_id
     and cr.company_id = b.company_id
$join$;
begin
  select pg_get_functiondef(
    'core.rebuild_payroll_activity_fact(uuid,date,date)'::regprocedure
  ) into v_definition;

  if position(v_old_join in v_definition) = 0 then
    raise exception using
      message = 'Payroll DSW identity hardening blocked: rebuild definition drifted.',
      hint = 'Review core.rebuild_payroll_activity_fact before applying the walk-on roster migration.';
  end if;

  execute replace(v_definition, v_old_join, v_new_join);
end;
$$;

notify pgrst, 'reload schema';
