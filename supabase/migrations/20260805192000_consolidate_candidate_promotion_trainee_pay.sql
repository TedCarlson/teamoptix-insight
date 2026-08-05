-- Keep candidate promotion and the existing trainee-pay workflow on one
-- authoritative implementation. The helper RPC calls participate in the
-- surrounding promotion transaction, so status and compensation remain atomic.

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

    perform public.set_roster_trainee_pay_override(
      p_company_slug,
      p_roster_id,
      p_trainee_daily_pay_rate,
      v_today
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

    perform public.close_roster_trainee_pay_override(
      p_company_slug,
      p_roster_id,
      v_today - 1
    );
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
