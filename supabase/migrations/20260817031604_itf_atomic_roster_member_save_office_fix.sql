begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.itf_save_roster_member(text,uuid,text,text,text,text,uuid,uuid,text,text,uuid,jsonb,uuid)'::regprocedure
  ) into v_definition;

  if position('and office.company_id = v_company_id' in v_definition) = 0 then
    raise exception 'Expected office company predicate was not found in itf_save_roster_member.';
  end if;

  v_definition := replace(
    v_definition,
    'and office.company_id = v_company_id',
    'and office.company_location_id in (
        select location.id
        from core.company_location location
        where location.company_id = v_company_id
      )'
  );

  execute v_definition;
end;
$$;

commit;
