-- Workforce Record Ownership Refactor — Sprint 3b
-- Bridge roster import commit to the asset assignment subsystem.

begin;

create or replace function core.ensure_and_assign_company_asset(
  p_company_slug text,
  p_roster_id uuid,
  p_asset_type_key text,
  p_asset_identifier text
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_asset_type_id uuid;
  v_asset_id uuid;
  v_existing_asset_id uuid;
  v_employment_status text;
  v_asset_type_key text := upper(trim(coalesce(p_asset_type_key, '')));
  v_asset_identifier text := nullif(trim(coalesce(p_asset_identifier, '')), '');
begin
  if v_asset_identifier is null or v_asset_type_key is null then
    return jsonb_build_object('ok', true, 'asset_id', null, 'assigned', false);
  end if;

  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  insert into core.asset_type (asset_type_key, asset_type_label, description, is_active)
  values (
    v_asset_type_key,
    case
      when v_asset_type_key = 'SCANNER' then 'Scanner'
      when v_asset_type_key = 'FUEL_CARD' then 'Fuel Card'
      when v_asset_type_key = 'PIN' then 'PIN'
      else initcap(lower(v_asset_type_key))
    end,
    'Imported via roster reconciliation.',
    true
  )
  on conflict (asset_type_key) do nothing;

  insert into core.asset_status (status_key, status_label, status_group, is_assignable, is_active)
  values
    ('AVAILABLE', 'Available', 'AVAILABLE', true, true),
    ('ASSIGNED', 'Assigned', 'ASSIGNED', true, true)
  on conflict (status_key) do nothing;

  select id into v_asset_type_id
  from core.asset_type
  where asset_type_key = v_asset_type_key;

  if v_asset_type_id is null then
    raise exception 'Asset type not found';
  end if;

  select id into v_existing_asset_id
  from core.asset
  where company_id = v_company_id
    and asset_type_id = v_asset_type_id
    and lower(asset_identifier) = lower(v_asset_identifier)
  order by created_at desc
  limit 1;

  if v_existing_asset_id is null then
    select (public.upsert_company_asset_admin(
      p_company_slug := p_company_slug,
      p_asset_id := null,
      p_asset_type_key := v_asset_type_key,
      p_asset_identifier := v_asset_identifier,
      p_asset_status_key := 'AVAILABLE',
      p_asset_provider_id := null,
      p_secondary_identifier := null,
      p_notes := 'Imported via roster reconciliation.',
      p_assignment_muted := false
    )->>'asset_id')::uuid into v_asset_id;
  else
    select (public.upsert_company_asset_admin(
      p_company_slug := p_company_slug,
      p_asset_id := v_existing_asset_id,
      p_asset_type_key := v_asset_type_key,
      p_asset_identifier := v_asset_identifier,
      p_asset_status_key := 'AVAILABLE',
      p_asset_provider_id := null,
      p_secondary_identifier := null,
      p_notes := 'Imported via roster reconciliation.',
      p_assignment_muted := false
    )->>'asset_id')::uuid into v_asset_id;
  end if;

  select employment_status into v_employment_status
  from core.company_roster
  where id = p_roster_id
    and company_id = v_company_id;

  if v_employment_status in ('Active', 'Trainee') then
    perform public.assign_company_asset(p_company_slug, v_asset_id, p_roster_id);
  end if;

  return jsonb_build_object('ok', true, 'asset_id', v_asset_id, 'assigned', v_employment_status in ('Active', 'Trainee'));
end;
$$;

create or replace function core.import_company_roster_rows(
  p_company_slug text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_row jsonb;
  v_roster_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_decision text;
  v_email text;
  v_phone text;
  v_fx_id text;
  v_dswid text;
  v_scanner_identifier text;
  v_fuel_card_identifier text;
  v_pin_identifier text;
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden.'; end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    begin
      if coalesce((v_row->>'approved')::boolean, false) is not true then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_decision := upper(trim(coalesce(v_row->>'import_decision', '')));
      if v_decision not in ('NEW', 'UPDATE_DRAFT') then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_roster_id := nullif(trim(coalesce(v_row->>'roster_member_id', '')), '')::uuid;
      v_email := nullif(lower(trim(coalesce(v_row->>'email', ''))), '');
      v_phone := nullif(regexp_replace(coalesce(v_row->>'phone', ''), '\D', '', 'g'), '');
      v_fx_id := nullif(trim(coalesce(v_row->>'fx_id', '')), '');
      v_dswid := nullif(lower(trim(coalesce(v_row->>'dswid', ''))), '');
      v_scanner_identifier := nullif(trim(coalesce(v_row->>'scanner_serial', '')), '');
      v_fuel_card_identifier := nullif(trim(coalesce(v_row->>'fuel_card', '')), '');
      v_pin_identifier := nullif(trim(coalesce(v_row->>'pin_id_no', '')), '');

      if v_decision = 'UPDATE_DRAFT' then
        if v_roster_id is null then raise exception 'Approved update is missing roster_member_id.'; end if;
        perform 1
        from core.company_roster
        where id = v_roster_id and company_id = v_company_id;
        if not found then raise exception 'Roster member is invalid for this company.'; end if;

        if exists (
          select 1
          from core.company_roster r
          left join core.company_roster_operations_fact ops on ops.roster_id = r.id
          left join core.company_roster_license_fact lf on lf.roster_id = r.id
          where r.company_id = v_company_id
            and r.id <> v_roster_id
            and (
              (v_email is not null and lower(trim(r.email)) = v_email)
              or (v_phone is not null and regexp_replace(coalesce(r.phone, ''), '\D', '', 'g') = v_phone)
              or (v_fx_id is not null and trim(coalesce(ops.fx_id, '')) = v_fx_id)
              or (v_dswid is not null and lower(trim(coalesce(ops.dswid, ''))) = v_dswid)
              or (nullif(lower(trim(coalesce(v_row->>'license_number', ''))), '') is not null
                  and lower(trim(coalesce(lf.license_number, ''))) = lower(trim(v_row->>'license_number')))
            )
        ) then
          raise exception 'Unique identity field belongs to another roster member; re-analyze before commit.';
        end if;
      else
        if v_roster_id is not null then raise exception 'Approved new row cannot include roster_member_id.'; end if;

        if exists (
          select 1
          from core.company_roster r
          left join core.company_roster_operations_fact ops on ops.roster_id = r.id
          left join core.company_roster_license_fact lf on lf.roster_id = r.id
          where r.company_id = v_company_id
            and (
              (v_email is not null and lower(trim(r.email)) = v_email)
              or (v_phone is not null and regexp_replace(coalesce(r.phone, ''), '\D', '', 'g') = v_phone)
              or (v_fx_id is not null and trim(coalesce(ops.fx_id, '')) = v_fx_id)
              or (v_dswid is not null and lower(trim(coalesce(ops.dswid, ''))) = v_dswid)
              or (nullif(lower(trim(coalesce(v_row->>'license_number', ''))), '') is not null
                  and lower(trim(coalesce(lf.license_number, ''))) = lower(trim(v_row->>'license_number')))
            )
        ) then
          raise exception 'Duplicate identity field discovered after analysis; re-analyze before commit.';
        end if;

        insert into core.company_roster (
          company_id, full_name, email, phone, worker_type, job_title,
          employment_status, market_code, hire_date, separation_date,
          invite_status, compliance_summary, notes
        ) values (
          v_company_id,
          nullif(trim(coalesce(v_row->>'full_name', '')), ''),
          v_email,
          nullif(trim(coalesce(v_row->>'phone', '')), ''),
          nullif(trim(coalesce(v_row->>'worker_type', v_row->>'role', '')), ''),
          nullif(trim(coalesce(v_row->>'job_title', '')), ''),
          coalesce(nullif(trim(coalesce(v_row->>'employment_status', v_row->>'status', '')), ''), 'Active'),
          nullif(trim(coalesce(v_row->>'market_code', v_row->>'market', '')), ''),
          nullif(trim(coalesce(v_row->>'hire_date', v_row->>'start_date', '')), '')::date,
          nullif(trim(coalesce(v_row->>'separation_date', '')), '')::date,
          'Not Invited', 'Missing', nullif(trim(coalesce(v_row->>'notes', '')), '')
        ) returning id into v_roster_id;
        v_inserted := v_inserted + 1;
      end if;

      if v_decision = 'UPDATE_DRAFT' then
        update core.company_roster set
          full_name = coalesce(nullif(trim(coalesce(v_row->>'full_name', '')), ''), full_name),
          email = coalesce(v_email, email),
          phone = coalesce(nullif(trim(coalesce(v_row->>'phone', '')), ''), phone),
          worker_type = coalesce(nullif(trim(coalesce(v_row->>'worker_type', v_row->>'role', '')), ''), worker_type),
          job_title = coalesce(nullif(trim(coalesce(v_row->>'job_title', '')), ''), job_title),
          employment_status = coalesce(nullif(trim(coalesce(v_row->>'employment_status', v_row->>'status', '')), ''), employment_status),
          market_code = coalesce(nullif(trim(coalesce(v_row->>'market_code', v_row->>'market', '')), ''), market_code),
          hire_date = coalesce(nullif(trim(coalesce(v_row->>'hire_date', v_row->>'start_date', '')), '')::date, hire_date),
          separation_date = coalesce(nullif(trim(coalesce(v_row->>'separation_date', '')), '')::date, separation_date),
          notes = coalesce(nullif(trim(coalesce(v_row->>'notes', '')), ''), notes)
        where id = v_roster_id and company_id = v_company_id;
        v_updated := v_updated + 1;
      end if;

      perform core.upsert_company_roster_authoritative_facts(
        p_company_slug := p_company_slug,
        p_roster_id := v_roster_id,
        p_date_of_birth := nullif(trim(coalesce(v_row->>'date_of_birth', '')), '')::date,
        p_address_line_1 := nullif(trim(coalesce(v_row->>'address_line_1', '')), ''),
        p_address_line_2 := nullif(trim(coalesce(v_row->>'address_line_2', '')), ''),
        p_city := nullif(trim(coalesce(v_row->>'city', '')), ''),
        p_state_region := nullif(trim(coalesce(v_row->>'state_region', '')), ''),
        p_postal_code := nullif(trim(coalesce(v_row->>'postal_code', '')), ''),
        p_license_number := nullif(trim(coalesce(v_row->>'license_number', '')), ''),
        p_issuing_state := nullif(trim(coalesce(v_row->>'issuing_state', '')), ''),
        p_license_issue_date := nullif(trim(coalesce(v_row->>'license_issue_date', '')), '')::date,
        p_license_expiration_date := nullif(trim(coalesce(v_row->>'license_expiration_date', '')), '')::date,
        p_replace_blank_values := false
      );

      insert into core.company_roster_operations_fact (
        roster_id, dot_exp, qual_cert_exp, daily_pay_effective_date, daily_pay_rate, fx_id, dswid
      ) values (
        v_roster_id,
        nullif(trim(coalesce(v_row->>'dot_expiration_date', '')), '')::date,
        nullif(trim(coalesce(v_row->>'qual_cert_expiration_date', '')), '')::date,
        nullif(trim(coalesce(v_row->>'daily_pay_effective_date', '')), '')::date,
        nullif(trim(coalesce(v_row->>'daily_pay_rate', '')), '')::numeric,
        v_fx_id,
        nullif(trim(coalesce(v_row->>'dswid', '')), '')
      ) on conflict (roster_id) do update set
        dot_exp = coalesce(excluded.dot_exp, core.company_roster_operations_fact.dot_exp),
        qual_cert_exp = coalesce(excluded.qual_cert_exp, core.company_roster_operations_fact.qual_cert_exp),
        daily_pay_effective_date = coalesce(excluded.daily_pay_effective_date, core.company_roster_operations_fact.daily_pay_effective_date),
        daily_pay_rate = coalesce(excluded.daily_pay_rate, core.company_roster_operations_fact.daily_pay_rate),
        fx_id = coalesce(excluded.fx_id, core.company_roster_operations_fact.fx_id),
        dswid = coalesce(excluded.dswid, core.company_roster_operations_fact.dswid),
        updated_at = now();

      if v_scanner_identifier is not null then
        perform core.ensure_and_assign_company_asset(p_company_slug, v_roster_id, 'SCANNER', v_scanner_identifier);
      end if;

      if v_fuel_card_identifier is not null then
        perform core.ensure_and_assign_company_asset(p_company_slug, v_roster_id, 'FUEL_CARD', v_fuel_card_identifier);
      end if;

      if v_pin_identifier is not null then
        perform core.ensure_and_assign_company_asset(p_company_slug, v_roster_id, 'PIN', v_pin_identifier);
      end if;

    exception when others then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row_number', v_row->>'row_number', 'full_name', v_row->>'full_name', 'error', sqlerrm
      ));
    end;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    raise exception using
      message = 'Roster reconciliation commit failed.',
      detail = v_errors::text;
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted_count', v_inserted,
    'updated_count', v_updated,
    'skipped_count', v_skipped,
    'errors', '[]'::jsonb
  );
end;
$$;

create or replace function public.import_company_roster_rows(p_company_slug text, p_rows jsonb)
returns jsonb
language sql
security definer
set search_path = public, core
as $$ select core.import_company_roster_rows(p_company_slug, p_rows); $$;

revoke all on function public.import_company_roster_rows(text, jsonb) from public;
grant execute on function public.import_company_roster_rows(text, jsonb) to authenticated, service_role;

comment on function core.import_company_roster_rows(text, jsonb) is
  'Commits approved roster reconciliation decisions into company-authoritative workforce warehouses and asset assignments.';

commit;
