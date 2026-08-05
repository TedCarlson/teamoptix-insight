-- Keep FedEx identifiers congruent across their authoritative identity source
-- and the legacy operations compatibility columns, then provide a single
-- atomic candidate promotion transaction.

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
    fx_id,
    dswid,
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
    v_fx_id,
    v_dswid,
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
    fx_id = excluded.fx_id,
    dswid = excluded.dswid,
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
      'authoritative_identifiers_verified', true
    ),
    now()
  );

  select jsonb_build_object(
    'roster_member_id', crv.roster_member_id,
    'fx_id', crv.fx_id,
    'dswid', crv.dswid,
    'scanner_serial', ops.scanner_serial,
    'dot_expiration_date', ops.dot_exp,
    'qual_cert_expiration_date', ops.qual_cert_exp,
    'daily_pay_effective_date', ops.daily_pay_effective_date,
    'daily_pay_rate', ops.daily_pay_rate,
    'fuel_card', ops.fuel_card,
    'pin_id_no', ops.pin_id_no
  ) into v_result
  from public.company_roster_view crv
  left join core.company_roster_operations_fact ops
    on ops.roster_id = crv.roster_member_id
  where crv.roster_member_id = p_roster_id
    and crv.company_id = v_company_id;

  if coalesce(v_result ->> 'fx_id', '') is distinct from coalesce(v_fx_id, '')
     or coalesce(v_result ->> 'dswid', '') is distinct from coalesce(v_dswid, '') then
    raise exception 'FedEx identifiers did not persist to the authoritative roster source';
  end if;

  return v_result;
end;
$$;

revoke all on function public.update_company_roster_operations(
  text, uuid, text, text, text, date, date, date, numeric, text, text
) from public;
grant execute on function public.update_company_roster_operations(
  text, uuid, text, text, text, date, date, date, numeric, text, text
) to authenticated, service_role;

-- Backfill compatibility fields only for identifiers that are unique. The
-- authoritative identifier table remains the source used by both drawers.
with fx as (
  select roster_id, max(identifier_value) as identifier_value
  from core.company_roster_identifier
  where identifier_type = 'fx_id'
  group by roster_id
), unique_fx as (
  select fx.*
  from fx
  join (
    select identifier_value
    from fx
    group by identifier_value
    having count(*) = 1
  ) guard using (identifier_value)
), ds as (
  select roster_id, max(identifier_value) as identifier_value
  from core.company_roster_identifier
  where identifier_type = 'dswid'
  group by roster_id
)
update core.company_roster_operations_fact operations
set
  fx_id = unique_fx.identifier_value,
  dswid = ds.identifier_value,
  updated_at = now()
from unique_fx
left join ds on ds.roster_id = unique_fx.roster_id
where operations.roster_id = unique_fx.roster_id;

create or replace function public.promote_company_candidate(
  p_company_slug text,
  p_roster_id uuid,
  p_target_status text,
  p_trainee_daily_pay_rate numeric default null,
  p_baseline_daily_pay_rate numeric default null
) returns jsonb
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_company_id uuid;
  v_roster core.company_roster;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_baseline_rate numeric;
  v_status_result jsonb;
begin
  if p_target_status not in ('Trainee', 'Active') then
    raise exception 'Promotion target must be Trainee or Active';
  end if;

  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'You do not have permission to promote this candidate';
  end if;

  select * into v_roster
  from core.company_roster
  where id = p_roster_id
    and company_id = v_company_id
  for update;

  if v_roster.id is null then
    raise exception 'Candidate roster record not found';
  end if;

  if v_roster.employment_status <> 'Candidate' then
    raise exception 'Only a Candidate can use the direct promotion workflow';
  end if;

  if p_target_status = 'Trainee' then
    if p_trainee_daily_pay_rate is null or p_trainee_daily_pay_rate <= 0 then
      raise exception 'A trainee daily pay rate is required';
    end if;

    update core.company_roster_trainee_pay_override
    set
      is_active = false,
      effective_end = v_today - 1,
      updated_at = now()
    where company_id = v_company_id
      and roster_id = p_roster_id
      and is_active = true;

    insert into core.company_roster_trainee_pay_override (
      company_id,
      roster_id,
      trainee_daily_pay_rate,
      effective_start,
      is_active
    ) values (
      v_company_id,
      p_roster_id,
      p_trainee_daily_pay_rate,
      v_today,
      true
    );
  else
    select daily_pay_rate into v_baseline_rate
    from core.company_roster_operations_fact
    where roster_id = p_roster_id;

    v_baseline_rate := coalesce(p_baseline_daily_pay_rate, v_baseline_rate);

    if v_baseline_rate is null or v_baseline_rate <= 0 then
      raise exception 'A baseline daily pay rate is required before activation';
    end if;

    insert into core.company_roster_operations_fact (
      roster_id,
      daily_pay_rate,
      daily_pay_effective_date,
      updated_at
    ) values (
      p_roster_id,
      v_baseline_rate,
      v_today,
      now()
    )
    on conflict (roster_id) do update set
      daily_pay_rate = excluded.daily_pay_rate,
      daily_pay_effective_date = case
        when p_baseline_daily_pay_rate is not null then excluded.daily_pay_effective_date
        else coalesce(
          core.company_roster_operations_fact.daily_pay_effective_date,
          excluded.daily_pay_effective_date
        )
      end,
      updated_at = now();

    update core.company_roster_trainee_pay_override
    set
      is_active = false,
      effective_end = v_today - 1,
      updated_at = now()
    where company_id = v_company_id
      and roster_id = p_roster_id
      and is_active = true;
  end if;

  v_status_result := public.roster_set_employment_status(
    p_company_slug,
    p_roster_id,
    p_target_status,
    v_today,
    'Direct promotion from candidate workflow'
  );

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
    'onboarding',
    'candidate_promoted',
    'Candidate promoted directly to ' || p_target_status || '.',
    jsonb_build_object(
      'source', 'candidate_promotion_workflow',
      'target_status', p_target_status,
      'effective_date', v_today,
      'readiness_bypass', true,
      'trainee_daily_pay_rate', case
        when p_target_status = 'Trainee' then p_trainee_daily_pay_rate
        else null
      end,
      'baseline_daily_pay_rate', case
        when p_target_status = 'Active' then v_baseline_rate
        else null
      end
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', p_roster_id,
    'employment_status', p_target_status,
    'effective_date', v_today,
    'hire_date', v_status_result ->> 'hire_date',
    'trainee_daily_pay_rate', case
      when p_target_status = 'Trainee' then p_trainee_daily_pay_rate
      else null
    end,
    'daily_pay_rate', case
      when p_target_status = 'Active' then v_baseline_rate
      else null
    end
  );
end;
$$;

revoke all on function public.promote_company_candidate(
  text, uuid, text, numeric, numeric
) from public;
grant execute on function public.promote_company_candidate(
  text, uuid, text, numeric, numeric
) to authenticated, service_role;

notify pgrst, 'reload schema';
