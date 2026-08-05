-- Refactor active FX ID and DSWID consumers onto company_roster_identifier.
-- The legacy operations columns deliberately remain in place during the
-- compatibility and parity-verification window.

-- Remove historical duplicate identifier rows before enforcing one value per
-- roster member and identifier type.
delete from core.company_roster_identifier duplicate
using core.company_roster_identifier keeper
where duplicate.roster_id = keeper.roster_id
  and duplicate.identifier_type = keeper.identifier_type
  and duplicate.id > keeper.id;

create unique index if not exists company_roster_identifier_roster_type_uq
  on core.company_roster_identifier (roster_id, identifier_type);

create or replace view core.company_roster_identity_v as
select
  roster.id as roster_id,
  roster.company_id,
  max(identifier.identifier_value) filter (
    where identifier.identifier_type = 'fx_id'
  ) as fx_id,
  max(identifier.identifier_value) filter (
    where identifier.identifier_type = 'dswid'
  ) as dswid,
  operations.dsw_driver_name
from core.company_roster roster
left join core.company_roster_identifier identifier
  on identifier.roster_id = roster.id
left join core.company_roster_operations_fact operations
  on operations.roster_id = roster.id
group by roster.id, roster.company_id, operations.dsw_driver_name;

create or replace view core.payroll_identity_resolved as
select
  roster.id as roster_member_id,
  roster.company_id,
  identity.dswid,
  identity.fx_id,
  identity.dsw_driver_name,
  roster.full_name as roster_name
from core.company_roster roster
left join core.company_roster_identity_v identity
  on identity.roster_id = roster.id;

create or replace function core.resolve_roster_identity(
  p_company_id uuid,
  p_driver_name text,
  p_dswid text,
  p_fx_id text
)
returns uuid
language sql
stable
set search_path = core, public
as $$
  with input as (
    select
      nullif(regexp_replace(upper(coalesce(p_dswid, '')), '[^A-Z0-9]+', '', 'g'), '') as dswid_exact,
      nullif(regexp_replace(upper(coalesce(p_fx_id, '')), '[^A-Z0-9]+', '', 'g'), '') as fx_exact,
      nullif(regexp_replace(upper(coalesce(p_driver_name, '')), '[^A-Z0-9]+', '', 'g'), '') as name_exact,
      coalesce(
        nullif(public.payroll_dsw_bridge_key(p_dswid), ''),
        nullif(public.payroll_dsw_bridge_key(p_driver_name), '')
      ) as driver_bridge_key
  ),
  candidates as (
    select
      roster.id,
      case
        when input.dswid_exact is not null
          and regexp_replace(upper(coalesce(identity.dswid, '')), '[^A-Z0-9]+', '', 'g') = input.dswid_exact
          then 1
        when input.fx_exact is not null
          and regexp_replace(upper(coalesce(identity.fx_id, '')), '[^A-Z0-9]+', '', 'g') = input.fx_exact
          then 2
        when input.driver_bridge_key is not null
          and public.payroll_dsw_bridge_key(identity.dswid) = input.driver_bridge_key
          then 3
        when input.name_exact is not null
          and regexp_replace(upper(coalesce(roster.full_name, '')), '[^A-Z0-9]+', '', 'g') = input.name_exact
          then 4
        when input.driver_bridge_key is not null
          and public.payroll_dsw_bridge_key(roster.full_name) = input.driver_bridge_key
          then 5
        else null
      end as match_rank
    from core.company_roster roster
    left join core.company_roster_identity_v identity
      on identity.roster_id = roster.id
    cross join input
    where roster.company_id = p_company_id
  ),
  unambiguous as (
    select
      id,
      match_rank,
      count(*) over (partition by match_rank) as candidate_count
    from candidates
    where match_rank is not null
  )
  select id
  from unambiguous
  where candidate_count = 1
  order by match_rank
  limit 1;
$$;

create or replace function public.update_company_roster_operations(
  p_company_slug text,
  p_roster_id uuid,
  p_fx_id text default null,
  p_dswid text default null,
  p_scanner_serial text default null,
  p_dot_exp date default null,
  p_qual_cert_exp date default null,
  p_daily_pay_effective_date date default null,
  p_daily_pay_rate numeric default null,
  p_fuel_card text default null,
  p_pin_id_no text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_company_id uuid;
  v_roster_id uuid;
  v_result jsonb;
  v_fx_id text := nullif(btrim(coalesce(p_fx_id, '')), '');
  v_dswid text := nullif(btrim(coalesce(p_dswid, '')), '');
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found for slug %', p_company_slug;
  end if;

  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'You do not have permission to update this roster record';
  end if;

  select id into v_roster_id
  from core.company_roster
  where id = p_roster_id
    and company_id = v_company_id;

  if v_roster_id is null then
    raise exception 'Roster record not found for %', p_roster_id;
  end if;

  delete from core.company_roster_identifier
  where roster_id = p_roster_id
    and identifier_type in ('fx_id', 'dswid');

  if v_fx_id is not null then
    insert into core.company_roster_identifier (
      roster_id, identifier_type, identifier_value
    ) values (p_roster_id, 'fx_id', v_fx_id);
  end if;

  if v_dswid is not null then
    insert into core.company_roster_identifier (
      roster_id, identifier_type, identifier_value
    ) values (p_roster_id, 'dswid', v_dswid);
  end if;

  insert into core.company_roster_operations_fact (
    roster_id,
    scanner_serial,
    dot_exp,
    qual_cert_exp,
    daily_pay_effective_date,
    daily_pay_rate,
    fuel_card,
    pin_id_no,
    updated_at
  ) values (
    p_roster_id,
    nullif(btrim(coalesce(p_scanner_serial, '')), ''),
    p_dot_exp,
    p_qual_cert_exp,
    p_daily_pay_effective_date,
    p_daily_pay_rate,
    nullif(btrim(coalesce(p_fuel_card, '')), ''),
    nullif(btrim(coalesce(p_pin_id_no, '')), ''),
    now()
  )
  on conflict (roster_id) do update set
    scanner_serial = excluded.scanner_serial,
    dot_exp = excluded.dot_exp,
    qual_cert_exp = excluded.qual_cert_exp,
    daily_pay_effective_date = excluded.daily_pay_effective_date,
    daily_pay_rate = excluded.daily_pay_rate,
    fuel_card = excluded.fuel_card,
    pin_id_no = excluded.pin_id_no,
    updated_at = now();

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  ) values (
    v_company_id,
    p_roster_id,
    'operations',
    'operations_updated',
    'Operations fields updated',
    jsonb_build_object(
      'source', 'update_company_roster_operations_rpc',
      'identifier_source', 'company_roster_identifier'
    ),
    now()
  );

  select jsonb_build_object(
    'roster_member_id', roster.roster_member_id,
    'fx_id', roster.fx_id,
    'dswid', roster.dswid,
    'scanner_serial', operations.scanner_serial,
    'dot_expiration_date', operations.dot_exp,
    'qual_cert_expiration_date', operations.qual_cert_exp,
    'daily_pay_effective_date', operations.daily_pay_effective_date,
    'daily_pay_rate', operations.daily_pay_rate,
    'fuel_card', operations.fuel_card,
    'pin_id_no', operations.pin_id_no
  ) into v_result
  from public.company_roster_view roster
  left join core.company_roster_operations_fact operations
    on operations.roster_id = roster.roster_member_id
  where roster.roster_member_id = p_roster_id
    and roster.company_id = v_company_id;

  if coalesce(v_result ->> 'fx_id', '') is distinct from coalesce(v_fx_id, '')
     or coalesce(v_result ->> 'dswid', '') is distinct from coalesce(v_dswid, '') then
    raise exception 'FedEx identifiers did not persist to the authoritative roster source';
  end if;

  return v_result;
end;
$$;

create or replace function core.import_company_roster_rows(
  p_company_slug text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'core', 'public'
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
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden.'; end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    begin
      if coalesce((v_row ->> 'approved')::boolean, false) is not true then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_decision := upper(trim(coalesce(v_row ->> 'import_decision', '')));
      if v_decision not in ('NEW', 'UPDATE_DRAFT') then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_roster_id := nullif(trim(coalesce(v_row ->> 'roster_member_id', '')), '')::uuid;
      v_email := nullif(lower(trim(coalesce(v_row ->> 'email', ''))), '');
      v_phone := nullif(regexp_replace(coalesce(v_row ->> 'phone', ''), '\D', '', 'g'), '');
      v_fx_id := nullif(trim(coalesce(v_row ->> 'fx_id', '')), '');
      v_dswid := nullif(lower(trim(coalesce(v_row ->> 'dswid', ''))), '');
      v_scanner_identifier := nullif(trim(coalesce(v_row ->> 'scanner_serial', '')), '');
      v_fuel_card_identifier := nullif(trim(coalesce(v_row ->> 'fuel_card', '')), '');
      v_pin_identifier := nullif(trim(coalesce(v_row ->> 'pin_id_no', '')), '');

      if v_decision = 'UPDATE_DRAFT' then
        if v_roster_id is null then
          raise exception 'Approved update is missing roster_member_id.';
        end if;

        perform 1
        from core.company_roster
        where id = v_roster_id and company_id = v_company_id;

        if not found then
          raise exception 'Roster member is invalid for this company.';
        end if;

        if exists (
          select 1
          from core.company_roster roster
          left join core.company_roster_identity_v identity
            on identity.roster_id = roster.id
          left join core.company_roster_license_fact license
            on license.roster_id = roster.id
          where roster.company_id = v_company_id
            and roster.id <> v_roster_id
            and (
              (v_email is not null and lower(trim(roster.email)) = v_email)
              or (v_phone is not null and regexp_replace(coalesce(roster.phone, ''), '\D', '', 'g') = v_phone)
              or (v_fx_id is not null and trim(coalesce(identity.fx_id, '')) = v_fx_id)
              or (v_dswid is not null and lower(trim(coalesce(identity.dswid, ''))) = v_dswid)
              or (
                nullif(lower(trim(coalesce(v_row ->> 'license_number', ''))), '') is not null
                and lower(trim(coalesce(license.license_number, ''))) =
                  lower(trim(v_row ->> 'license_number'))
              )
            )
        ) then
          raise exception 'Unique identity field belongs to another roster member; re-analyze before commit.';
        end if;
      else
        if v_roster_id is not null then
          raise exception 'Approved new row cannot include roster_member_id.';
        end if;

        if exists (
          select 1
          from core.company_roster roster
          left join core.company_roster_identity_v identity
            on identity.roster_id = roster.id
          left join core.company_roster_license_fact license
            on license.roster_id = roster.id
          where roster.company_id = v_company_id
            and (
              (v_email is not null and lower(trim(roster.email)) = v_email)
              or (v_phone is not null and regexp_replace(coalesce(roster.phone, ''), '\D', '', 'g') = v_phone)
              or (v_fx_id is not null and trim(coalesce(identity.fx_id, '')) = v_fx_id)
              or (v_dswid is not null and lower(trim(coalesce(identity.dswid, ''))) = v_dswid)
              or (
                nullif(lower(trim(coalesce(v_row ->> 'license_number', ''))), '') is not null
                and lower(trim(coalesce(license.license_number, ''))) =
                  lower(trim(v_row ->> 'license_number'))
              )
            )
        ) then
          raise exception 'Duplicate identity field discovered after analysis; re-analyze before commit.';
        end if;

        insert into core.company_roster (
          company_id,
          full_name,
          email,
          phone,
          worker_type,
          job_title,
          employment_status,
          market_code,
          hire_date,
          separation_date,
          invite_status,
          compliance_summary,
          notes
        ) values (
          v_company_id,
          nullif(trim(coalesce(v_row ->> 'full_name', '')), ''),
          v_email,
          nullif(trim(coalesce(v_row ->> 'phone', '')), ''),
          nullif(trim(coalesce(v_row ->> 'worker_type', v_row ->> 'role', '')), ''),
          nullif(trim(coalesce(v_row ->> 'job_title', '')), ''),
          coalesce(nullif(trim(coalesce(v_row ->> 'employment_status', v_row ->> 'status', '')), ''), 'Active'),
          nullif(trim(coalesce(v_row ->> 'market_code', v_row ->> 'market', '')), ''),
          nullif(trim(coalesce(v_row ->> 'hire_date', v_row ->> 'start_date', '')), '')::date,
          nullif(trim(coalesce(v_row ->> 'separation_date', '')), '')::date,
          'Not Invited',
          'Missing',
          nullif(trim(coalesce(v_row ->> 'notes', '')), '')
        ) returning id into v_roster_id;

        v_inserted := v_inserted + 1;
      end if;

      if v_decision = 'UPDATE_DRAFT' then
        update core.company_roster
        set
          full_name = coalesce(nullif(trim(coalesce(v_row ->> 'full_name', '')), ''), full_name),
          email = coalesce(v_email, email),
          phone = coalesce(nullif(trim(coalesce(v_row ->> 'phone', '')), ''), phone),
          worker_type = coalesce(nullif(trim(coalesce(v_row ->> 'worker_type', v_row ->> 'role', '')), ''), worker_type),
          job_title = coalesce(nullif(trim(coalesce(v_row ->> 'job_title', '')), ''), job_title),
          employment_status = coalesce(nullif(trim(coalesce(v_row ->> 'employment_status', v_row ->> 'status', '')), ''), employment_status),
          market_code = coalesce(nullif(trim(coalesce(v_row ->> 'market_code', v_row ->> 'market', '')), ''), market_code),
          hire_date = coalesce(nullif(trim(coalesce(v_row ->> 'hire_date', v_row ->> 'start_date', '')), '')::date, hire_date),
          separation_date = coalesce(nullif(trim(coalesce(v_row ->> 'separation_date', '')), '')::date, separation_date),
          notes = coalesce(nullif(trim(coalesce(v_row ->> 'notes', '')), ''), notes)
        where id = v_roster_id and company_id = v_company_id;

        v_updated := v_updated + 1;
      end if;

      perform core.upsert_company_roster_authoritative_facts(
        p_company_slug := p_company_slug,
        p_roster_id := v_roster_id,
        p_date_of_birth := nullif(trim(coalesce(v_row ->> 'date_of_birth', '')), '')::date,
        p_address_line_1 := nullif(trim(coalesce(v_row ->> 'address_line_1', '')), ''),
        p_address_line_2 := nullif(trim(coalesce(v_row ->> 'address_line_2', '')), ''),
        p_city := nullif(trim(coalesce(v_row ->> 'city', '')), ''),
        p_state_region := nullif(trim(coalesce(v_row ->> 'state_region', '')), ''),
        p_postal_code := nullif(trim(coalesce(v_row ->> 'postal_code', '')), ''),
        p_license_number := nullif(trim(coalesce(v_row ->> 'license_number', '')), ''),
        p_issuing_state := nullif(trim(coalesce(v_row ->> 'issuing_state', '')), ''),
        p_license_issue_date := nullif(trim(coalesce(v_row ->> 'license_issue_date', '')), '')::date,
        p_license_expiration_date := nullif(trim(coalesce(v_row ->> 'license_expiration_date', '')), '')::date,
        p_replace_blank_values := false
      );

      insert into core.company_roster_operations_fact (
        roster_id,
        dot_exp,
        qual_cert_exp,
        daily_pay_effective_date,
        daily_pay_rate
      ) values (
        v_roster_id,
        nullif(trim(coalesce(v_row ->> 'dot_expiration_date', '')), '')::date,
        nullif(trim(coalesce(v_row ->> 'qual_cert_expiration_date', '')), '')::date,
        nullif(trim(coalesce(v_row ->> 'daily_pay_effective_date', '')), '')::date,
        nullif(trim(coalesce(v_row ->> 'daily_pay_rate', '')), '')::numeric
      ) on conflict (roster_id) do update set
        dot_exp = coalesce(excluded.dot_exp, core.company_roster_operations_fact.dot_exp),
        qual_cert_exp = coalesce(excluded.qual_cert_exp, core.company_roster_operations_fact.qual_cert_exp),
        daily_pay_effective_date = coalesce(excluded.daily_pay_effective_date, core.company_roster_operations_fact.daily_pay_effective_date),
        daily_pay_rate = coalesce(excluded.daily_pay_rate, core.company_roster_operations_fact.daily_pay_rate),
        updated_at = now();

      if v_fx_id is not null then
        insert into core.company_roster_identifier (
          roster_id, identifier_type, identifier_value
        ) values (v_roster_id, 'fx_id', v_fx_id)
        on conflict (roster_id, identifier_type) do update set
          identifier_value = excluded.identifier_value;
      end if;

      if v_dswid is not null then
        insert into core.company_roster_identifier (
          roster_id, identifier_type, identifier_value
        ) values (v_roster_id, 'dswid', v_dswid)
        on conflict (roster_id, identifier_type) do update set
          identifier_value = excluded.identifier_value;
      end if;

      if v_scanner_identifier is not null then
        perform core.ensure_and_assign_company_asset(
          p_company_slug, v_roster_id, 'SCANNER', v_scanner_identifier
        );
      end if;

      if v_fuel_card_identifier is not null then
        perform core.ensure_and_assign_company_asset(
          p_company_slug, v_roster_id, 'FUEL_CARD', v_fuel_card_identifier
        );
      end if;

      if v_pin_identifier is not null then
        perform core.ensure_and_assign_company_asset(
          p_company_slug, v_roster_id, 'PIN', v_pin_identifier
        );
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row_number', v_row ->> 'row_number',
        'full_name', v_row ->> 'full_name',
        'error', sqlerrm
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

create or replace function public.get_company_driver_scorecard_index(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_as_of_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_model_id uuid;
  v_last_month_start date;
  v_last_month_end date;
  v_mtd_start date;
  v_result jsonb;
begin
  if p_company_id is null or p_start_date is null or p_end_date is null
    or p_as_of_date is null or p_end_date < p_start_date
    or p_as_of_date < p_start_date or (p_end_date - p_start_date) > 365
  then
    raise exception 'A company and valid contract range are required.' using errcode = '22023';
  end if;

  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.' using errcode = '42501';
  end if;

  select model.id into v_model_id
  from core.driver_scorecard_model model
  where model.status = 'ACTIVE'
    and (model.company_id = p_company_id or model.company_id is null)
    and (model.effective_start is null or model.effective_start <= p_as_of_date)
    and (model.effective_end is null or model.effective_end >= p_as_of_date)
  order by (model.company_id is not null) desc, model.version desc
  limit 1;

  v_last_month_start := (date_trunc('month', p_as_of_date)::date - interval '1 month')::date;
  v_last_month_end := (date_trunc('month', p_as_of_date)::date - interval '1 day')::date;
  v_mtd_start := date_trunc('month', p_as_of_date)::date;

  with latest_final_batches as (
    select distinct on (batch.service_date)
      batch.id, batch.service_date
    from core.operations_report_batch batch
    where batch.company_id = p_company_id
      and batch.report_family_key = 'DSW'
      and batch.snapshot_kind = 'FINAL'
      and batch.status = 'LOADED'
      and batch.service_date between p_start_date and least(p_end_date, p_as_of_date)
    order by batch.service_date, batch.created_at desc, batch.id desc
  ),
  source_facts as (
    select
      batch.service_date,
      coalesce(
        raw.matched_roster_member_id,
        core.resolve_roster_identity(
          p_company_id,
          coalesce(nullif(raw.normalized_row_json ->> 'driver_name',''), raw.source_driver_name),
          raw.source_dswid,
          null
        )
      ) as roster_id,
      coalesce(nullif(raw.normalized_row_json ->> 'wa_name',''), raw.source_route_key) as route_name,
      coalesce(nullif(raw.normalized_row_json ->> 'wa_number',''), raw.source_wa_number) as wa_number,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_delivery_stops'),0),0) as delivery_stops,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_delivery_packages'),0),0) as delivery_packages,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_pickup_stops'),0),0) as pickup_stops,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'actual_pickup_packages'),0),0) as pickup_packages,
      greatest(coalesce(raw.early_pickups, core.safe_numeric(raw.normalized_row_json ->> 'early_pickups'),0),0) as early_pickups,
      greatest(coalesce(raw.late_pickups, core.safe_numeric(raw.normalized_row_json ->> 'late_pickups'),0),0) as late_pickups,
      greatest(coalesce(raw.potential_missed_pickups, core.safe_numeric(raw.normalized_row_json ->> 'potential_missed_pickups'),0),0) as potential_missed,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'exceptions'),0),0) as exceptions,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'code_85'),0),0) as code_85,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'dna'),0),0) as dna,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'send_again'),0),0) as send_again,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'required_signature'),0),0) as required_signature,
      greatest(coalesce(core.safe_numeric(raw.normalized_row_json ->> 'miles'),0),0) as miles,
      core.driver_scorecard_hours(raw.normalized_row_json ->> 'on_road_hours') as road_hours,
      core.driver_scorecard_hours(raw.normalized_row_json ->> 'on_duty_hours') as duty_hours,
      core.safe_numeric(raw.normalized_row_json ->> 'ils_percent') as ils_percent
    from latest_final_batches batch
    join core.operations_report_raw_row raw on raw.batch_id = batch.id
    where raw.company_id = p_company_id and raw.row_kind = 'ROUTE'
  ),
  periods as (
    select 'LAST_MONTH'::text as period_key, v_last_month_start as period_start, v_last_month_end as period_end
    union all select 'MTD', v_mtd_start, p_as_of_date
    union all select 'CONTRACT', p_start_date, least(p_end_date, p_as_of_date)
  ),
  roster as (
    select
      person.id as roster_id,
      person.full_name,
      person.employment_status,
      identity.fx_id,
      identity.dswid,
      operations.daily_pay_rate
    from core.company_roster person
    left join core.company_roster_identity_v identity
      on identity.roster_id = person.id
    left join core.company_roster_operations_fact operations
      on operations.roster_id = person.id
    where person.company_id = p_company_id
      and person.employment_status in ('Active','Trainee')
  ),
  aggregate as (
    select
      roster.roster_id,
      period.period_key,
      count(distinct fact.service_date) filter (where fact.roster_id is not null) as operating_days,
      count(*) filter (where fact.roster_id is not null) as route_days,
      coalesce(sum(fact.delivery_stops),0) as delivery_stops,
      coalesce(sum(fact.delivery_packages),0) as delivery_packages,
      coalesce(sum(fact.pickup_stops),0) as pickup_stops,
      coalesce(sum(fact.pickup_packages),0) as pickup_packages,
      coalesce(sum(fact.early_pickups),0) as early_pickups,
      coalesce(sum(fact.late_pickups),0) as late_pickups,
      coalesce(sum(fact.potential_missed),0) as potential_missed,
      coalesce(sum(fact.exceptions),0) as exceptions,
      coalesce(sum(fact.code_85),0) as code_85,
      coalesce(sum(fact.dna),0) as dna,
      coalesce(sum(fact.send_again),0) as send_again,
      coalesce(sum(fact.required_signature),0) as required_signature,
      coalesce(sum(fact.miles),0) as miles,
      coalesce(sum(fact.road_hours),0) as road_hours,
      coalesce(sum(fact.duty_hours),0) as duty_hours,
      case when sum(fact.delivery_packages) filter (where fact.ils_percent is not null) > 0
        then sum(fact.ils_percent * fact.delivery_packages) filter (where fact.ils_percent is not null)
          / sum(fact.delivery_packages) filter (where fact.ils_percent is not null)
        else null end as observed_ils
    from roster
    cross join periods period
    left join source_facts fact on fact.roster_id = roster.roster_id
      and fact.service_date between period.period_start and period.period_end
    group by roster.roster_id, period.period_key
  ),
  drivers as (
    select jsonb_build_object(
      'roster_id', roster.roster_id,
      'full_name', roster.full_name,
      'fx_id', roster.fx_id,
      'dswid', roster.dswid,
      'employment_status', roster.employment_status,
      'daily_pay_rate', roster.daily_pay_rate,
      'periods', jsonb_object_agg(aggregate.period_key, jsonb_build_object(
        'operating_days', aggregate.operating_days,
        'route_days', aggregate.route_days,
        'delivery_stops', aggregate.delivery_stops,
        'delivery_packages', aggregate.delivery_packages,
        'pickup_stops', aggregate.pickup_stops,
        'pickup_packages', aggregate.pickup_packages,
        'early_pickups', aggregate.early_pickups,
        'late_pickups', aggregate.late_pickups,
        'potential_missed_pickups', aggregate.potential_missed,
        'exceptions', aggregate.exceptions,
        'code_85', aggregate.code_85,
        'dna', aggregate.dna,
        'send_again', aggregate.send_again,
        'required_signature', aggregate.required_signature,
        'miles', aggregate.miles,
        'road_hours', aggregate.road_hours,
        'duty_hours', aggregate.duty_hours,
        'observed_ils', aggregate.observed_ils
      ))
    ) as value
    from roster
    join aggregate on aggregate.roster_id = roster.roster_id
    group by roster.roster_id, roster.full_name, roster.fx_id, roster.dswid,
      roster.employment_status, roster.daily_pay_rate
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'contract_start', p_start_date,
      'contract_end', p_end_date,
      'as_of_date', p_as_of_date,
      'last_month_start', v_last_month_start,
      'last_month_end', v_last_month_end,
      'mtd_start', v_mtd_start
    ),
    'model', jsonb_build_object(
      'id', model.id,
      'title', model.title,
      'version', model.version,
      'metrics', coalesce((
        select jsonb_agg(to_jsonb(metric) - 'id' - 'model_id' - 'created_at' - 'updated_at' order by metric.sort_order)
        from core.driver_scorecard_metric metric
        where metric.model_id = model.id and metric.enabled
      ), '[]'::jsonb)
    ),
    'drivers', coalesce((select jsonb_agg(drivers.value order by drivers.value ->> 'full_name') from drivers), '[]'::jsonb),
    'unmatched_route_rows', (select count(*) from source_facts where roster_id is null)
  ) into v_result
  from core.driver_scorecard_model model
  where model.id = v_model_id;

  return coalesce(v_result, jsonb_build_object('drivers','[]'::jsonb));
end;
$$;
