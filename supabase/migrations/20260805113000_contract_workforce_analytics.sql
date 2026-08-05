-- Contract-scoped workforce analytics from authoritative roster, schedule,
-- dispatch, and time-off records. This function is read-only.

create or replace function public.get_company_workforce_analytics(
  p_company_slug text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
begin
  select id
  into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or (p_end_date - p_start_date) > 365
  then
    raise exception 'A valid workforce date range of no more than 366 days is required.'
      using errcode = '22023';
  end if;

  if not core.can_read_company_data(v_company_id) then
    raise exception 'You do not have access to this company.'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'active', (
        select count(*) from core.company_roster r
        where r.company_id = v_company_id and r.employment_status = 'Active'
      ),
      'trainees', (
        select count(*) from core.company_roster r
        where r.company_id = v_company_id and r.employment_status = 'Trainee'
      ),
      'candidates', (
        select count(*) from core.company_roster r
        where r.company_id = v_company_id and r.employment_status = 'Candidate'
      ),
      'former', (
        select count(*) from core.company_roster r
        where r.company_id = v_company_id and r.employment_status = 'Former'
      ),
      'contract_hires', (
        select count(*) from core.company_roster r
        where r.company_id = v_company_id
          and r.hire_date between p_start_date and p_end_date
      ),
      'contract_separations', (
        select count(*) from core.company_roster r
        where r.company_id = v_company_id
          and r.separation_date between p_start_date and p_end_date
      ),
      'call_outs', (
        select count(*)
        from core.dispatch_event e
        join core.dispatch_day d on d.id = e.dispatch_day_id
        where d.company_id = v_company_id
          and d.dispatch_date between p_start_date and p_end_date
          and e.event_code = 'CALL_OUT'
      ),
      'no_shows', (
        select count(*)
        from core.dispatch_event e
        join core.dispatch_day d on d.id = e.dispatch_day_id
        where d.company_id = v_company_id
          and d.dispatch_date between p_start_date and p_end_date
          and e.event_code = 'NO_SHOW'
      ),
      'late_arrivals', (
        select count(*)
        from core.dispatch_event e
        join core.dispatch_day d on d.id = e.dispatch_day_id
        where d.company_id = v_company_id
          and d.dispatch_date between p_start_date and p_end_date
          and e.event_code = 'LATE_ARRIVAL'
      ),
      'pending_time_off', (
        select count(*) from public.driver_time_off_request t
        where t.company_id = v_company_id and t.status = 'PENDING'
      )
    ),
    'coverage', jsonb_build_object(
      'schedule_start', (
        select min(s.service_date) from public.schedule_day_fact_view s
        where s.company_id = v_company_id
          and s.service_date between p_start_date and p_end_date
      ),
      'schedule_end', (
        select max(s.service_date) from public.schedule_day_fact_view s
        where s.company_id = v_company_id
          and s.service_date between p_start_date and p_end_date
      ),
      'dispatch_start', (
        select min(d.dispatch_date) from core.dispatch_day d
        where d.company_id = v_company_id
          and d.dispatch_date between p_start_date and p_end_date
      ),
      'dispatch_end', (
        select max(d.dispatch_date) from core.dispatch_day d
        where d.company_id = v_company_id
          and d.dispatch_date between p_start_date and p_end_date
      )
    ),
    'worker_types', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'label', worker_type,
        'count', total
      ) order by total desc, worker_type), '[]'::jsonb)
      from (
        select coalesce(nullif(btrim(r.worker_type), ''), 'Unassigned') as worker_type,
          count(*) as total
        from core.company_roster r
        where r.company_id = v_company_id
          and r.employment_status in ('Active', 'Trainee')
        group by 1
      ) types
    ),
    'schedule_patterns', (
      with person_weeks as (
        select
          s.roster_member_id,
          s.service_date - ((extract(dow from s.service_date)::integer + 1) % 7) as week_start,
          count(*) filter (where s.planned_on) as planned_days
        from public.schedule_day_fact_view s
        where s.company_id = v_company_id
          and s.service_date between p_start_date and p_end_date
        group by s.roster_member_id,
          s.service_date - ((extract(dow from s.service_date)::integer + 1) % 7)
      )
      select jsonb_build_object(
        'four_or_less', count(*) filter (where planned_days <= 4),
        'five_day', count(*) filter (where planned_days = 5),
        'six_plus', count(*) filter (where planned_days >= 6),
        'person_weeks', count(*)
      )
      from person_weeks
      where planned_days > 0
    ),
    'monthly', (
      with months as (
        select
          month_start::date,
          least(
            (month_start + interval '1 month - 1 day')::date,
            p_end_date
          ) as month_end
        from generate_series(
          date_trunc('month', p_start_date)::date,
          date_trunc('month', p_end_date)::date,
          interval '1 month'
        ) month_start
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(m.month_start, 'YYYY-MM'),
        'start_date', greatest(m.month_start, p_start_date),
        'end_date', m.month_end,
        'known_headcount', (
          select count(*)
          from core.company_roster r
          where r.company_id = v_company_id
            and r.employment_status <> 'Candidate'
            and coalesce(r.hire_date, r.created_at::date) <= m.month_end
            and (r.separation_date is null or r.separation_date > m.month_end)
        ),
        'hires', (
          select count(*) from core.company_roster r
          where r.company_id = v_company_id
            and r.hire_date between greatest(m.month_start, p_start_date) and m.month_end
        ),
        'separations', (
          select count(*) from core.company_roster r
          where r.company_id = v_company_id
            and r.separation_date between greatest(m.month_start, p_start_date) and m.month_end
        ),
        'scheduled_assignments', (
          select count(*) from public.schedule_day_fact_view s
          where s.company_id = v_company_id
            and s.service_date between greatest(m.month_start, p_start_date) and m.month_end
            and s.planned_on
        ),
        'scheduled_days', (
          select count(distinct s.service_date) from public.schedule_day_fact_view s
          where s.company_id = v_company_id
            and s.service_date between greatest(m.month_start, p_start_date) and m.month_end
            and s.planned_on
        ),
        'call_outs', (
          select count(*) from core.dispatch_event e
          join core.dispatch_day d on d.id = e.dispatch_day_id
          where d.company_id = v_company_id
            and d.dispatch_date between greatest(m.month_start, p_start_date) and m.month_end
            and e.event_code = 'CALL_OUT'
        ),
        'no_shows', (
          select count(*) from core.dispatch_event e
          join core.dispatch_day d on d.id = e.dispatch_day_id
          where d.company_id = v_company_id
            and d.dispatch_date between greatest(m.month_start, p_start_date) and m.month_end
            and e.event_code = 'NO_SHOW'
        ),
        'late_arrivals', (
          select count(*) from core.dispatch_event e
          join core.dispatch_day d on d.id = e.dispatch_day_id
          where d.company_id = v_company_id
            and d.dispatch_date between greatest(m.month_start, p_start_date) and m.month_end
            and e.event_code = 'LATE_ARRIVAL'
        ),
        'approved_time_off_days', (
          select coalesce(sum(t.day_count), 0) from public.driver_time_off_request t
          where t.company_id = v_company_id
            and t.status = 'APPROVED'
            and t.start_date between greatest(m.month_start, p_start_date) and m.month_end
        )
      ) order by m.month_start), '[]'::jsonb)
      from months m
    )
  );
end;
$$;

revoke all on function public.get_company_workforce_analytics(text, date, date)
  from public;

grant execute on function public.get_company_workforce_analytics(text, date, date)
  to authenticated, service_role;
