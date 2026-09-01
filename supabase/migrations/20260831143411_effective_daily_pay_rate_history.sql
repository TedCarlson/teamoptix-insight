begin;
-- Compensation rows are effective-dated records. A new row owns its start
-- date through the day before the next row; the newest row remains open.
update core.company_person_compensation
set effective_start_date = created_at::date
where effective_start_date is null;
alter table core.company_person_compensation
  alter column effective_start_date set not null;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_person_compensation_effective_range_ck'
      and conrelid = 'core.company_person_compensation'::regclass
  ) then
    alter table core.company_person_compensation
      add constraint company_person_compensation_effective_range_ck
      check (
        effective_end_date is null
        or effective_end_date >= effective_start_date
      );
  end if;
end
$$;
create unique index if not exists company_person_compensation_one_open_range_idx
  on core.company_person_compensation (company_id, roster_member_id)
  where effective_end_date is null;
create or replace function core.upsert_company_person_compensation_range(
  p_company_id uuid,
  p_roster_id uuid,
  p_pay_frequency text,
  p_amount numeric,
  p_effective_start_date date,
  p_standard_hours_per_week numeric default 40,
  p_standard_days_per_week numeric default 5,
  p_source text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_model_id uuid;
  v_next_start_date date;
  v_pay_frequency text := upper(btrim(coalesce(p_pay_frequency, '')));
begin
  if p_effective_start_date is null then
    raise exception 'An effective start date is required.';
  end if;

  if v_pay_frequency not in ('HOURLY', 'DAILY', 'WEEKLY') then
    raise exception 'Pay structure must be HOURLY, DAILY, or WEEKLY.';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Pay rate must be non-negative.';
  end if;

  select min(compensation.effective_start_date)
  into v_next_start_date
  from core.company_person_compensation compensation
  where compensation.company_id = p_company_id
    and compensation.roster_member_id = p_roster_id
    and compensation.effective_start_date > p_effective_start_date;

  update core.company_person_compensation compensation
  set effective_end_date = p_effective_start_date - 1,
      status = 'ENDED',
      updated_at = now()
  where compensation.company_id = p_company_id
    and compensation.roster_member_id = p_roster_id
    and compensation.effective_start_date < p_effective_start_date
    and (
      compensation.effective_end_date is null
      or compensation.effective_end_date >= p_effective_start_date
    );

  insert into core.company_person_compensation (
    company_id,
    roster_member_id,
    amount,
    pay_frequency,
    standard_hours_per_week,
    standard_days_per_week,
    effective_start_date,
    effective_end_date,
    status,
    source
  ) values (
    p_company_id,
    p_roster_id,
    p_amount,
    v_pay_frequency,
    coalesce(p_standard_hours_per_week, 40),
    coalesce(p_standard_days_per_week, 5),
    p_effective_start_date,
    case
      when v_next_start_date is null then null
      else v_next_start_date - 1
    end,
    case when v_next_start_date is null then 'ACTIVE' else 'ENDED' end,
    nullif(btrim(coalesce(p_source, '')), '')
  )
  on conflict (company_id, roster_member_id, effective_start_date)
  do update set
    amount = excluded.amount,
    pay_frequency = excluded.pay_frequency,
    standard_hours_per_week = excluded.standard_hours_per_week,
    standard_days_per_week = excluded.standard_days_per_week,
    effective_end_date = excluded.effective_end_date,
    status = excluded.status,
    source = excluded.source,
    updated_at = now()
  returning id into v_model_id;

  return v_model_id;
end;
$$;
revoke all on function core.upsert_company_person_compensation_range(
  uuid, uuid, text, numeric, date, numeric, numeric, text
) from public, anon, authenticated;
-- Preserve every existing live daily rate as the first known range when no
-- compensation history has been recorded for that person yet.
insert into core.company_person_compensation (
  company_id,
  roster_member_id,
  amount,
  pay_frequency,
  standard_hours_per_week,
  standard_days_per_week,
  effective_start_date,
  effective_end_date,
  status,
  source
)
select
  roster.company_id,
  operations.roster_id,
  operations.daily_pay_rate,
  'DAILY',
  40,
  5,
  operations.daily_pay_effective_date,
  null,
  'ACTIVE',
  'LEGACY_DAILY'
from core.company_roster_operations_fact operations
join core.company_roster roster on roster.id = operations.roster_id
where operations.daily_pay_rate is not null
  and operations.daily_pay_effective_date is not null
  and not exists (
    select 1
    from core.company_person_compensation compensation
    where compensation.company_id = roster.company_id
      and compensation.roster_member_id = operations.roster_id
  )
on conflict (company_id, roster_member_id, effective_start_date) do nothing;
-- An explicitly saved daily compensation model is authoritative for live
-- payroll from its effective date forward. Keep the legacy snapshot aligned
-- for consumers that have not yet moved to range resolution.
update core.company_roster_operations_fact operations
set daily_pay_rate = current_rate.amount,
    daily_pay_effective_date = current_rate.effective_start_date,
    updated_at = now()
from (
  select distinct on (compensation.roster_member_id)
    compensation.roster_member_id,
    compensation.amount,
    compensation.effective_start_date
  from core.company_person_compensation compensation
  where compensation.pay_frequency = 'DAILY'
    and compensation.effective_end_date is null
  order by
    compensation.roster_member_id,
    compensation.effective_start_date desc,
    compensation.updated_at desc
) current_rate
where operations.roster_id = current_rate.roster_member_id
  and (
    operations.daily_pay_rate is distinct from current_rate.amount
    or operations.daily_pay_effective_date is distinct from current_rate.effective_start_date
  );
create or replace function core.apply_daily_pay_range_to_activity_facts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pay_frequency <> 'DAILY' then
    return new;
  end if;

  update core.payroll_activity_fact fact
  set daily_pay_rate = new.amount,
      daily_pay_effective_date = new.effective_start_date,
      daily_pay_eligible = true,
      review_flags = array_remove(fact.review_flags, 'MISSING_DAILY_PAY_RATE'),
      updated_at = now()
  where fact.company_id = new.company_id
    and fact.roster_member_id = new.roster_member_id
    and fact.service_date >= new.effective_start_date
    and (
      new.effective_end_date is null
      or fact.service_date <= new.effective_end_date
    )
    and fact.source_kind not in ('MANUAL_TRAINING', 'DISPATCH_TRAINING')
    and not (
      coalesce(fact.metadata_json, '{}'::jsonb) ? 'walk_on_assignment_id'
      or coalesce(fact.metadata_json, '{}'::jsonb) ? 'walk_on_payroll_event_id'
    );

  return new;
end;
$$;
revoke all on function core.apply_daily_pay_range_to_activity_facts()
  from public, anon, authenticated;
drop trigger if exists apply_daily_pay_range_to_activity_facts
  on core.company_person_compensation;
create trigger apply_daily_pay_range_to_activity_facts
after insert or update of amount, pay_frequency, effective_start_date, effective_end_date
on core.company_person_compensation
for each row
execute function core.apply_daily_pay_range_to_activity_facts();
-- Repair persisted base-pay facts wherever an effective daily range is known.
update core.payroll_activity_fact fact
set daily_pay_rate = compensation.amount,
    daily_pay_effective_date = compensation.effective_start_date,
    daily_pay_eligible = true,
    review_flags = array_remove(fact.review_flags, 'MISSING_DAILY_PAY_RATE'),
    updated_at = now()
from core.company_person_compensation compensation
where compensation.company_id = fact.company_id
  and compensation.roster_member_id = fact.roster_member_id
  and compensation.pay_frequency = 'DAILY'
  and fact.service_date >= compensation.effective_start_date
  and (
    compensation.effective_end_date is null
    or fact.service_date <= compensation.effective_end_date
  )
  and fact.source_kind not in ('MANUAL_TRAINING', 'DISPATCH_TRAINING')
  and not (
    coalesce(fact.metadata_json, '{}'::jsonb) ? 'walk_on_assignment_id'
    or coalesce(fact.metadata_json, '{}'::jsonb) ? 'walk_on_payroll_event_id'
  );
create or replace function public.get_company_daily_pay_rate_history(
  p_company_slug text,
  p_roster_ids uuid[],
  p_start_date date,
  p_end_date date
)
returns table (
  roster_id uuid,
  daily_pay_rate numeric,
  effective_start date,
  effective_end date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Not authorized.';
  end if;

  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'A valid payroll date range is required.';
  end if;

  return query
  select
    compensation.roster_member_id,
    compensation.amount,
    compensation.effective_start_date,
    compensation.effective_end_date
  from core.company_person_compensation compensation
  where compensation.company_id = v_company_id
    and compensation.pay_frequency = 'DAILY'
    and compensation.roster_member_id = any(coalesce(p_roster_ids, '{}'::uuid[]))
    and compensation.effective_start_date <= p_end_date
    and (
      compensation.effective_end_date is null
      or compensation.effective_end_date >= p_start_date
    )
  order by
    compensation.roster_member_id,
    compensation.effective_start_date desc;
end;
$$;
revoke all on function public.get_company_daily_pay_rate_history(
  text, uuid[], date, date
) from public, anon;
grant execute on function public.get_company_daily_pay_rate_history(
  text, uuid[], date, date
) to authenticated, service_role;
create or replace function public.get_roster_compensation_model(
  p_company_slug text,
  p_roster_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_model core.company_person_compensation%rowtype;
  v_daily_pay_rate numeric;
  v_daily_pay_effective_date date;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Not authorized.';
  end if;

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_id
      and roster.company_id = v_company_id
  ) then
    raise exception 'Roster member not found.';
  end if;

  select compensation.*
  into v_model
  from core.company_person_compensation compensation
  where compensation.company_id = v_company_id
    and compensation.roster_member_id = p_roster_id
    and compensation.effective_end_date is null
  order by
    compensation.effective_start_date desc,
    compensation.updated_at desc
  limit 1;

  if v_model.id is not null
     and v_model.pay_frequency in ('HOURLY', 'DAILY', 'WEEKLY') then
    return jsonb_build_object(
      'basis', v_model.pay_frequency,
      'rate', v_model.amount,
      'effective_date', v_model.effective_start_date,
      'hours_per_week', v_model.standard_hours_per_week,
      'days_per_week', v_model.standard_days_per_week,
      'source', 'MODEL',
      'persisted', true
    );
  end if;

  select operations.daily_pay_rate, operations.daily_pay_effective_date
  into v_daily_pay_rate, v_daily_pay_effective_date
  from core.company_roster_operations_fact operations
  where operations.roster_id = p_roster_id;

  return jsonb_build_object(
    'basis', 'DAILY',
    'rate', v_daily_pay_rate,
    'effective_date', v_daily_pay_effective_date,
    'hours_per_week', 40,
    'days_per_week', 5,
    'source', case
      when v_daily_pay_rate is null then 'DEFAULT'
      else 'LEGACY_DAILY'
    end,
    'persisted', false
  );
end;
$$;
create or replace function public.set_roster_compensation_model(
  p_company_slug text,
  p_roster_id uuid,
  p_pay_frequency text,
  p_amount numeric,
  p_effective_start_date date default current_date,
  p_standard_hours_per_week numeric default 40,
  p_standard_days_per_week numeric default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_pay_frequency text := upper(btrim(coalesce(p_pay_frequency, '')));
  v_effective_start_date date := coalesce(p_effective_start_date, current_date);
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Not authorized.';
  end if;

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_id
      and roster.company_id = v_company_id
  ) then
    raise exception 'Roster member not found.';
  end if;

  if v_pay_frequency not in ('HOURLY', 'DAILY', 'WEEKLY') then
    raise exception 'Pay structure must be HOURLY, DAILY, or WEEKLY.';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Pay rate must be non-negative.';
  end if;

  if coalesce(p_standard_hours_per_week, 40) <= 0
     or coalesce(p_standard_hours_per_week, 40) > 168 then
    raise exception 'Hours per week must be greater than 0 and no more than 168.';
  end if;

  if coalesce(p_standard_days_per_week, 5) <= 0
     or coalesce(p_standard_days_per_week, 5) > 7 then
    raise exception 'Days per week must be greater than 0 and no more than 7.';
  end if;

  perform core.upsert_company_person_compensation_range(
    v_company_id,
    p_roster_id,
    v_pay_frequency,
    p_amount,
    v_effective_start_date,
    coalesce(p_standard_hours_per_week, 40),
    coalesce(p_standard_days_per_week, 5),
    'DRAWER_MODEL'
  );

  if v_pay_frequency = 'DAILY' then
    insert into core.company_roster_operations_fact (
      roster_id,
      daily_pay_effective_date,
      daily_pay_rate,
      updated_at
    ) values (
      p_roster_id,
      v_effective_start_date,
      p_amount,
      now()
    )
    on conflict (roster_id) do update set
      daily_pay_effective_date = excluded.daily_pay_effective_date,
      daily_pay_rate = excluded.daily_pay_rate,
      updated_at = now();
  end if;

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
    'compensation',
    'compensation_rate_effective',
    'Compensation rate range updated',
    jsonb_build_object(
      'pay_frequency', v_pay_frequency,
      'effective_start_date', v_effective_start_date,
      'source', 'set_roster_compensation_model'
    ),
    now()
  );

  return public.get_roster_compensation_model(p_company_slug, p_roster_id);
end;
$$;
comment on function public.set_roster_compensation_model(
  text, uuid, text, numeric, date, numeric, numeric
) is
  'Adds an effective-dated compensation range. Daily ranges also update live payroll; the preceding range closes the day before the new start date.';
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
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_roster_id uuid;
  v_result jsonb;
  v_fx_id text := nullif(btrim(coalesce(p_fx_id, '')), '');
  v_dswid text := nullif(btrim(coalesce(p_dswid, '')), '');
  v_previous_daily_pay_effective_date date;
  v_previous_daily_pay_rate numeric;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found for slug %', p_company_slug;
  end if;

  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'You do not have permission to update this roster record';
  end if;

  select roster.id
  into v_roster_id
  from core.company_roster roster
  where roster.id = p_roster_id
    and roster.company_id = v_company_id;

  if v_roster_id is null then
    raise exception 'Roster record not found for %', p_roster_id;
  end if;

  if (p_daily_pay_rate is null) <> (p_daily_pay_effective_date is null) then
    raise exception 'Daily pay rate and effective date must be provided together.';
  end if;

  if p_daily_pay_rate is not null and p_daily_pay_rate < 0 then
    raise exception 'Daily pay rate must be non-negative.';
  end if;

  select
    operations.daily_pay_effective_date,
    operations.daily_pay_rate
  into
    v_previous_daily_pay_effective_date,
    v_previous_daily_pay_rate
  from core.company_roster_operations_fact operations
  where operations.roster_id = p_roster_id;

  delete from core.company_roster_identifier identifier
  where identifier.roster_id = p_roster_id
    and identifier.identifier_type in ('fx_id', 'dswid');

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

  if p_daily_pay_rate is not null
     and (
       v_previous_daily_pay_rate is distinct from p_daily_pay_rate
       or v_previous_daily_pay_effective_date is distinct from p_daily_pay_effective_date
     ) then
    perform core.upsert_company_person_compensation_range(
      v_company_id,
      p_roster_id,
      'DAILY',
      p_daily_pay_rate,
      p_daily_pay_effective_date,
      40,
      5,
      'OPERATIONS'
    );
  end if;

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
      'identifier_source', 'company_roster_identifier',
      'daily_pay_range_changed',
        p_daily_pay_rate is not null
        and (
          v_previous_daily_pay_rate is distinct from p_daily_pay_rate
          or v_previous_daily_pay_effective_date is distinct from p_daily_pay_effective_date
        )
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
  )
  into v_result
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
revoke all on function public.get_roster_compensation_model(text, uuid)
  from public, anon;
grant execute on function public.get_roster_compensation_model(text, uuid)
  to authenticated, service_role;
revoke all on function public.set_roster_compensation_model(
  text, uuid, text, numeric, date, numeric, numeric
) from public, anon;
grant execute on function public.set_roster_compensation_model(
  text, uuid, text, numeric, date, numeric, numeric
) to authenticated, service_role;
revoke all on function public.update_company_roster_operations(
  text, uuid, text, text, text, date, date, date, numeric, text, text
) from public, anon;
grant execute on function public.update_company_roster_operations(
  text, uuid, text, text, text, date, date, date, numeric, text, text
) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
