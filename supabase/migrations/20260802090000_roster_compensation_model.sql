begin;

-- Additive planning metadata only. Live payroll continues to resolve
-- core.company_roster_operations_fact.daily_pay_rate and its effective date.
alter table core.company_person_compensation
  add column if not exists standard_days_per_week numeric(4,2) not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_person_compensation_amount_ck'
      and conrelid = 'core.company_person_compensation'::regclass
  ) then
    alter table core.company_person_compensation
      add constraint company_person_compensation_amount_ck check (amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'company_person_compensation_hours_ck'
      and conrelid = 'core.company_person_compensation'::regclass
  ) then
    alter table core.company_person_compensation
      add constraint company_person_compensation_hours_ck
      check (standard_hours_per_week > 0 and standard_hours_per_week <= 168);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'company_person_compensation_days_ck'
      and conrelid = 'core.company_person_compensation'::regclass
  ) then
    alter table core.company_person_compensation
      add constraint company_person_compensation_days_ck
      check (standard_days_per_week > 0 and standard_days_per_week <= 7);
  end if;
end
$$;

create or replace function public.get_roster_compensation_model(
  p_company_slug text,
  p_roster_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_model core.company_person_compensation%rowtype;
  v_daily_pay_rate numeric;
  v_daily_pay_effective_date date;
begin
  select c.id into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Not authorized.';
  end if;

  if not exists (
    select 1 from core.company_roster r
    where r.id = p_roster_id and r.company_id = v_company_id
  ) then
    raise exception 'Roster member not found.';
  end if;

  select compensation.* into v_model
  from core.company_person_compensation compensation
  where compensation.company_id = v_company_id
    and compensation.roster_member_id = p_roster_id
    and compensation.status = 'ACTIVE'
  order by compensation.effective_start_date desc nulls last,
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
    'source', case when v_daily_pay_rate is null then 'DEFAULT' else 'LEGACY_DAILY' end,
    'persisted', false
  );
end;
$$;

comment on function public.get_roster_compensation_model(text, uuid) is
  'Resolves drawer-only annual earnings modeling, falling back to live daily pay without modifying payroll.';

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
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_model_id uuid;
begin
  select c.id into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Not authorized.';
  end if;

  if not exists (
    select 1 from core.company_roster r
    where r.id = p_roster_id and r.company_id = v_company_id
  ) then
    raise exception 'Roster member not found.';
  end if;

  p_pay_frequency := upper(btrim(coalesce(p_pay_frequency, '')));

  if p_pay_frequency not in ('HOURLY', 'DAILY', 'WEEKLY') then
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

  select compensation.id into v_model_id
  from core.company_person_compensation compensation
  where compensation.company_id = v_company_id
    and compensation.roster_member_id = p_roster_id
    and compensation.status = 'ACTIVE'
  order by compensation.effective_start_date desc nulls last,
           compensation.updated_at desc
  limit 1;

  if v_model_id is null then
    insert into core.company_person_compensation (
      company_id,
      roster_member_id,
      amount,
      pay_frequency,
      standard_hours_per_week,
      standard_days_per_week,
      effective_start_date,
      status,
      source
    ) values (
      v_company_id,
      p_roster_id,
      p_amount,
      p_pay_frequency,
      coalesce(p_standard_hours_per_week, 40),
      coalesce(p_standard_days_per_week, 5),
      coalesce(p_effective_start_date, current_date),
      'ACTIVE',
      'DRAWER_MODEL'
    ) returning id into v_model_id;
  else
    update core.company_person_compensation
    set amount = p_amount,
        pay_frequency = p_pay_frequency,
        standard_hours_per_week = coalesce(p_standard_hours_per_week, 40),
        standard_days_per_week = coalesce(p_standard_days_per_week, 5),
        effective_start_date = coalesce(p_effective_start_date, current_date),
        effective_end_date = null,
        status = 'ACTIVE',
        source = 'DRAWER_MODEL',
        updated_at = now()
    where id = v_model_id;
  end if;

  return public.get_roster_compensation_model(p_company_slug, p_roster_id);
end;
$$;

comment on function public.set_roster_compensation_model(text, uuid, text, numeric, date, numeric, numeric) is
  'Stores drawer-only compensation modeling. This function intentionally never writes live payroll daily-pay fields.';

revoke all on function public.get_roster_compensation_model(text, uuid) from public;
grant execute on function public.get_roster_compensation_model(text, uuid) to authenticated, service_role;

revoke all on function public.set_roster_compensation_model(text, uuid, text, numeric, date, numeric, numeric) from public;
grant execute on function public.set_roster_compensation_model(text, uuid, text, numeric, date, numeric, numeric) to authenticated, service_role;

commit;
