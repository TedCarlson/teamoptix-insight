begin;

alter table public.schedule_override
  add column if not exists workflow_status text,
  add column if not exists separation_effective_date date,
  add column if not exists schedule_baseline_id uuid,
  add column if not exists superseded_override_ids uuid[] not null default '{}',
  add column if not exists repaint_evidence jsonb not null default '{}'::jsonb,
  add column if not exists separation_processed_at timestamptz,
  add column if not exists notification_sent_at timestamptz,
  add column if not exists notification_provider_id text,
  add column if not exists notification_attempts integer not null default 0,
  add column if not exists notification_last_error text;

alter table public.schedule_override
  drop constraint if exists schedule_override_workflow_status_ck;
alter table public.schedule_override
  add constraint schedule_override_workflow_status_ck check (
    workflow_status is null or workflow_status in (
      'SUBMITTED',
      'COUNTDOWN_ACTIVE',
      'SEPARATION_PROCESSED',
      'NOTIFICATION_PENDING',
      'COMPLETED',
      'CANCELLED',
      'RESCINDED'
    )
  );

create index if not exists schedule_override_resignation_due_idx
  on public.schedule_override (separation_effective_date, workflow_status)
  where override_type = 'RESIGNATION_NOTICE' and is_active = true;

create table if not exists core.resignation_workflow_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  resignation_override_id uuid not null references public.schedule_override(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  event_key text not null,
  event_detail text,
  event_metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references core.profiles(id),
  occurred_at timestamptz not null default now(),
  constraint resignation_workflow_event_key_ck check (length(btrim(event_key)) > 0)
);

create index if not exists resignation_workflow_event_override_idx
  on core.resignation_workflow_event (resignation_override_id, occurred_at);

create table if not exists core.resignation_asset_recovery_case (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  resignation_override_id uuid not null references public.schedule_override(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  asset_id uuid not null references core.asset(id) on delete cascade,
  original_assignment_id uuid references core.asset_assignment(id),
  recovery_status text not null default 'RECOVERY_PENDING',
  release_trigger_status text not null default 'PENDING',
  release_triggered_at timestamptz,
  release_last_error text,
  recovered_at timestamptz,
  reconciled_at timestamptz,
  closed_at timestamptz,
  recovered_by_assignment_id uuid references core.asset_assignment(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resignation_asset_recovery_status_ck check (
    recovery_status in ('RECOVERY_PENDING', 'RECOVERED', 'RECONCILED', 'CLOSED')
  ),
  constraint resignation_asset_release_trigger_status_ck check (
    release_trigger_status in ('PENDING', 'SENT', 'FAILED')
  ),
  unique (resignation_override_id, asset_id)
);

create index if not exists resignation_asset_recovery_open_idx
  on core.resignation_asset_recovery_case (company_id, recovery_status, created_at)
  where closed_at is null;

alter table core.resignation_workflow_event enable row level security;
alter table core.resignation_asset_recovery_case enable row level security;

drop policy if exists resignation_workflow_event_select on core.resignation_workflow_event;
create policy resignation_workflow_event_select
  on core.resignation_workflow_event for select to authenticated
  using (core.can_access_company(company_id));

drop policy if exists resignation_asset_recovery_select on core.resignation_asset_recovery_case;
create policy resignation_asset_recovery_select
  on core.resignation_asset_recovery_case for select to authenticated
  using (core.can_access_company(company_id));

grant select on core.resignation_workflow_event to authenticated, service_role;
grant select on core.resignation_asset_recovery_case to authenticated, service_role;

insert into core.asset_status (
  status_key,
  status_label,
  status_group,
  is_assignable,
  is_active,
  sort_order
)
values (
  'RECOVERY_PENDING',
  'Recovery pending',
  'RECOVERY',
  true,
  true,
  35
)
on conflict (status_key) do update set
  status_label = excluded.status_label,
  status_group = excluded.status_group,
  is_assignable = true,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function core.resignation_repaint_horizon(
  p_company_id uuid,
  p_roster_member_id uuid,
  p_window_start date,
  p_last_scheduled_date date
) returns integer
language sql
stable
set search_path = core, public
as $$
  select greatest(
    70,
    (coalesce(
      (
        select max(fact.service_date)
        from public.schedule_day_fact fact
        where fact.company_id = p_company_id
          and fact.roster_member_id = p_roster_member_id
      ),
      p_last_scheduled_date
    ) - p_window_start) + 1,
    (p_last_scheduled_date - p_window_start) + 1
  )::integer;
$$;

create or replace function core.repaint_resignation_schedule(
  p_override_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_override public.schedule_override%rowtype;
  v_horizon integer;
  v_repaint jsonb;
  v_removed_count integer := 0;
begin
  select * into v_override
  from public.schedule_override
  where id = p_override_id
    and override_type = 'RESIGNATION_NOTICE'
  for update;

  if v_override.id is null then
    raise exception 'Resignation notice not found';
  end if;

  if v_override.schedule_baseline_id is not null then
    update public.schedule_baseline
    set is_active = true,
        effective_end = null,
        updated_at = now()
    where id = v_override.schedule_baseline_id
      and company_id = v_override.company_id
      and roster_member_id = v_override.roster_member_id;
  end if;

  v_horizon := core.resignation_repaint_horizon(
    v_override.company_id,
    v_override.roster_member_id,
    v_override.start_date,
    v_override.end_date
  );

  select public.paint_schedule_day_fact_for_roster_member(
    v_override.company_id,
    v_override.roster_member_id,
    v_override.start_date,
    v_horizon
  ) into v_repaint;

  if v_override.schedule_baseline_id is not null then
    update public.schedule_baseline
    set is_active = false,
        effective_end = v_override.end_date,
        updated_at = now()
    where id = v_override.schedule_baseline_id
      and company_id = v_override.company_id
      and roster_member_id = v_override.roster_member_id;
  end if;

  delete from public.schedule_day_fact
  where company_id = v_override.company_id
    and roster_member_id = v_override.roster_member_id
    and service_date > v_override.end_date;
  get diagnostics v_removed_count = row_count;

  v_repaint := coalesce(v_repaint, '{}'::jsonb) || jsonb_build_object(
    'notice_date', v_override.start_date,
    'last_scheduled_date', v_override.end_date,
    'separation_effective_date', v_override.separation_effective_date,
    'future_rows_removed', v_removed_count,
    'repainted_at', now()
  );

  update public.schedule_override
  set repaint_evidence = v_repaint,
      workflow_status = case
        when workflow_status in ('SUBMITTED', 'COUNTDOWN_ACTIVE') then 'COUNTDOWN_ACTIVE'
        else workflow_status
      end,
      updated_at = now()
  where id = v_override.id;

  insert into core.resignation_workflow_event (
    company_id,
    resignation_override_id,
    roster_member_id,
    event_key,
    event_detail,
    event_metadata,
    created_by_profile_id
  ) values (
    v_override.company_id,
    v_override.id,
    v_override.roster_member_id,
    'SCHEDULE_REPAINTED',
    'Loaded schedule repainted immediately through the last scheduled day; later rows were removed.',
    v_repaint,
    core.current_profile_id()
  );

  return v_repaint;
end;
$$;

create or replace function core.submit_company_resignation_notice(
  p_company_slug text,
  p_roster_member_id uuid,
  p_last_scheduled_date date,
  p_manager_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_terminal_id uuid;
  v_timezone text := 'America/New_York';
  v_notice_date date;
  v_baseline_id uuid;
  v_override_id uuid;
  v_superseded_ids uuid[] := '{}';
  v_repaint jsonb;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden'; end if;
  select terminal.terminal_id, terminal.timezone
  into v_terminal_id, v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
  order by terminal.created_at
  limit 1;
  v_terminal_id := coalesce(v_terminal_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_timezone := coalesce(v_timezone, 'America/New_York');
  v_notice_date := (now() at time zone v_timezone)::date;

  if p_last_scheduled_date is null or p_last_scheduled_date < v_notice_date then
    raise exception 'Last scheduled day must be today or later';
  end if;

  perform 1
  from core.company_roster roster
  where roster.id = p_roster_member_id
    and roster.company_id = v_company_id
    and roster.employment_status in ('Active', 'Trainee')
  for update;
  if not found then raise exception 'Active or trainee roster member not found'; end if;

  if exists (
    select 1 from public.schedule_override existing
    where existing.company_id = v_company_id
      and existing.roster_member_id = p_roster_member_id
      and existing.override_type = 'RESIGNATION_NOTICE'
      and existing.is_active = true
      and existing.workflow_status not in ('CANCELLED', 'RESCINDED')
  ) then
    raise exception 'An active resignation notice already exists for this roster member';
  end if;

  select baseline.id into v_baseline_id
  from public.schedule_baseline baseline
  where baseline.company_id = v_company_id
    and baseline.roster_member_id = p_roster_member_id
    and baseline.is_active = true
    and baseline.effective_end is null
  order by baseline.updated_at desc, baseline.created_at desc
  limit 1;

  select coalesce(array_agg(existing.id), '{}') into v_superseded_ids
  from public.schedule_override existing
  where existing.company_id = v_company_id
    and existing.roster_member_id = p_roster_member_id
    and existing.override_type = 'ADD_IN'
    and existing.is_active = true
    and existing.end_date > p_last_scheduled_date;

  update public.schedule_override
  set is_active = false,
      updated_at = now()
  where id = any(v_superseded_ids);

  insert into public.schedule_override (
    company_id,
    terminal_id,
    roster_member_id,
    override_type,
    start_date,
    end_date,
    route_name_override,
    is_active,
    manager_note,
    workflow_status,
    separation_effective_date,
    schedule_baseline_id,
    superseded_override_ids
  ) values (
    v_company_id,
    v_terminal_id,
    p_roster_member_id,
    'RESIGNATION_NOTICE',
    v_notice_date,
    p_last_scheduled_date,
    null,
    true,
    nullif(btrim(coalesce(p_manager_note, '')), ''),
    'SUBMITTED',
    p_last_scheduled_date + 1,
    v_baseline_id,
    v_superseded_ids
  ) returning id into v_override_id;

  insert into core.resignation_workflow_event (
    company_id,
    resignation_override_id,
    roster_member_id,
    event_key,
    event_detail,
    event_metadata,
    created_by_profile_id
  ) values (
    v_company_id,
    v_override_id,
    p_roster_member_id,
    'SUBMITTED',
    'Resignation notice submitted; all downstream work was registered.',
    jsonb_build_object(
      'notice_date', v_notice_date,
      'last_scheduled_date', p_last_scheduled_date,
      'separation_effective_date', p_last_scheduled_date + 1,
      'superseded_add_in_override_ids', to_jsonb(v_superseded_ids)
    ),
    core.current_profile_id()
  );

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    created_by_profile_id
  ) values (
    v_company_id,
    p_roster_member_id,
    'separation',
    'resignation_notice_submitted',
    'Advance resignation notice submitted.',
    jsonb_build_object(
      'workflow_id', v_override_id,
      'notice_date', v_notice_date,
      'last_scheduled_date', p_last_scheduled_date,
      'separation_effective_date', p_last_scheduled_date + 1
    ),
    core.current_profile_id()
  );

  v_repaint := core.repaint_resignation_schedule(v_override_id);

  return jsonb_build_object(
    'ok', true,
    'workflow_id', v_override_id,
    'notice_date', v_notice_date,
    'last_scheduled_date', p_last_scheduled_date,
    'separation_effective_date', p_last_scheduled_date + 1,
    'workflow_status', 'COUNTDOWN_ACTIVE',
    'commit', v_repaint
  );
end;
$$;

create or replace function core.update_company_resignation_notice(
  p_company_slug text,
  p_override_id uuid,
  p_last_scheduled_date date,
  p_manager_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_override public.schedule_override%rowtype;
  v_repaint jsonb;
  v_superseded_ids uuid[] := '{}';
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if v_company_id is null then raise exception 'Company not found'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden'; end if;
  if p_last_scheduled_date is null or p_last_scheduled_date < current_date then
    raise exception 'Last scheduled day must be today or later';
  end if;

  select * into v_override
  from public.schedule_override
  where id = p_override_id
    and company_id = v_company_id
    and override_type = 'RESIGNATION_NOTICE'
  for update;

  if v_override.id is null then raise exception 'Resignation notice not found'; end if;
  if v_override.workflow_status not in ('SUBMITTED', 'COUNTDOWN_ACTIVE') then
    raise exception 'Only a pending resignation notice can be changed';
  end if;

  update public.schedule_override
  set end_date = p_last_scheduled_date,
      separation_effective_date = p_last_scheduled_date + 1,
      manager_note = coalesce(nullif(btrim(coalesce(p_manager_note, '')), ''), manager_note),
      workflow_status = 'COUNTDOWN_ACTIVE',
      updated_at = now()
  where id = p_override_id;

  update public.schedule_override add_in
  set is_active = true,
      updated_at = now()
  where add_in.id = any(v_override.superseded_override_ids)
    and add_in.override_type = 'ADD_IN'
    and add_in.end_date <= p_last_scheduled_date;

  select coalesce(array_agg(add_in.id), '{}') into v_superseded_ids
  from public.schedule_override add_in
  where add_in.company_id = v_company_id
    and add_in.roster_member_id = v_override.roster_member_id
    and add_in.override_type = 'ADD_IN'
    and add_in.is_active = true
    and add_in.end_date > p_last_scheduled_date;

  update public.schedule_override
  set is_active = false,
      updated_at = now()
  where id = any(v_superseded_ids);

  update public.schedule_override
  set superseded_override_ids = v_superseded_ids,
      updated_at = now()
  where id = p_override_id;

  v_repaint := core.repaint_resignation_schedule(p_override_id);

  insert into core.resignation_workflow_event (
    company_id, resignation_override_id, roster_member_id, event_key,
    event_detail, event_metadata, created_by_profile_id
  ) values (
    v_company_id, p_override_id, v_override.roster_member_id, 'LAST_DAY_CHANGED',
    'Last scheduled day changed; countdown and loaded schedule were repainted immediately.',
    jsonb_build_object(
      'previous_last_scheduled_date', v_override.end_date,
      'last_scheduled_date', p_last_scheduled_date,
      'separation_effective_date', p_last_scheduled_date + 1,
      'repaint', v_repaint
    ),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true,
    'workflow_id', p_override_id,
    'last_scheduled_date', p_last_scheduled_date,
    'separation_effective_date', p_last_scheduled_date + 1,
    'workflow_status', 'COUNTDOWN_ACTIVE',
    'commit', v_repaint
  );
end;
$$;

create or replace function core.cancel_company_resignation_notice(
  p_company_slug text,
  p_override_id uuid,
  p_disposition text default 'CANCELLED'
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_override public.schedule_override%rowtype;
  v_horizon integer;
  v_repaint jsonb;
  v_disposition text;
begin
  v_disposition := upper(coalesce(nullif(btrim(p_disposition), ''), 'CANCELLED'));
  if v_disposition not in ('CANCELLED', 'RESCINDED') then
    raise exception 'Disposition must be CANCELLED or RESCINDED';
  end if;

  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if v_company_id is null then raise exception 'Company not found'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden'; end if;

  select * into v_override
  from public.schedule_override
  where id = p_override_id
    and company_id = v_company_id
    and override_type = 'RESIGNATION_NOTICE'
  for update;

  if v_override.id is null then raise exception 'Resignation notice not found'; end if;
  if v_override.workflow_status not in ('SUBMITTED', 'COUNTDOWN_ACTIVE') then
    raise exception 'Only a pending resignation notice can be cancelled or rescinded';
  end if;

  if v_override.schedule_baseline_id is not null then
    update public.schedule_baseline
    set is_active = true,
        effective_end = null,
        updated_at = now()
    where id = v_override.schedule_baseline_id
      and company_id = v_company_id
      and roster_member_id = v_override.roster_member_id;
  end if;

  update public.schedule_override
  set is_active = false,
      workflow_status = v_disposition,
      updated_at = now()
  where id = p_override_id;

  update public.schedule_override
  set is_active = true,
      updated_at = now()
  where id = any(v_override.superseded_override_ids);

  v_horizon := core.resignation_repaint_horizon(
    v_company_id,
    v_override.roster_member_id,
    v_override.start_date,
    v_override.end_date
  );

  select public.paint_schedule_day_fact_for_roster_member(
    v_company_id,
    v_override.roster_member_id,
    v_override.start_date,
    v_horizon
  ) into v_repaint;

  insert into core.resignation_workflow_event (
    company_id, resignation_override_id, roster_member_id, event_key,
    event_detail, event_metadata, created_by_profile_id
  ) values (
    v_company_id, p_override_id, v_override.roster_member_id, v_disposition,
    'Resignation notice ended and the loaded schedule was restored immediately.',
    jsonb_build_object('repaint', v_repaint),
    core.current_profile_id()
  );

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail,
    event_metadata, created_by_profile_id
  ) values (
    v_company_id, v_override.roster_member_id, 'separation',
    lower(v_disposition), 'Resignation notice ended before separation.',
    jsonb_build_object('workflow_id', p_override_id, 'repaint', v_repaint),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true,
    'workflow_id', p_override_id,
    'workflow_status', v_disposition,
    'commit', v_repaint
  );
end;
$$;

create or replace function core.guard_resignation_schedule_add_in()
returns trigger
language plpgsql
set search_path = core, public
as $$
begin
  if new.is_active = true
    and new.override_type = 'ADD_IN'
    and exists (
      select 1
      from public.schedule_override resignation
      where resignation.company_id = new.company_id
        and resignation.roster_member_id = new.roster_member_id
        and resignation.override_type = 'RESIGNATION_NOTICE'
        and resignation.is_active = true
        and resignation.workflow_status in (
          'SUBMITTED', 'COUNTDOWN_ACTIVE', 'SEPARATION_PROCESSED',
          'NOTIFICATION_PENDING', 'COMPLETED'
        )
        and new.end_date >= resignation.separation_effective_date
        and resignation.id <> new.id
    ) then
    raise exception 'Assignments cannot be added on or after the resignation separation date';
  end if;
  return new;
end;
$$;

drop trigger if exists schedule_override_guard_resignation_add_in on public.schedule_override;
create trigger schedule_override_guard_resignation_add_in
before insert or update of override_type, start_date, end_date, is_active
on public.schedule_override
for each row execute function core.guard_resignation_schedule_add_in();

create or replace function core.close_asset_recovery_on_assignment()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_case record;
begin
  for v_case in
    select recovery.id, recovery.company_id, recovery.asset_id,
           recovery.roster_member_id
    from core.resignation_asset_recovery_case recovery
    where recovery.asset_id = new.asset_id
      and recovery.closed_at is null
    for update
  loop
    update core.resignation_asset_recovery_case
    set recovery_status = 'CLOSED',
        release_trigger_status = case
          when release_trigger_status = 'PENDING' then 'SENT'
          else release_trigger_status
        end,
        recovered_at = coalesce(recovered_at, now()),
        reconciled_at = coalesce(reconciled_at, now()),
        closed_at = now(),
        recovered_by_assignment_id = new.id,
        updated_at = now()
    where id = v_case.id;

    insert into core.asset_event (
      asset_id, company_id, event_key, event_label, person_id,
      roster_member_id, event_notes
    ) values (
      new.asset_id, new.company_id, 'RECOVERY_RECONCILED_BY_ASSIGNMENT',
      'Recovery reconciled by new assignment', new.person_id,
      new.roster_member_id,
      'New custody confirmed physical recovery; the recovery case was closed without changing the new assignment.'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists asset_assignment_reconcile_resignation_recovery on core.asset_assignment;
create trigger asset_assignment_reconcile_resignation_recovery
after insert on core.asset_assignment
for each row execute function core.close_asset_recovery_on_assignment();

create or replace function core.process_resignation_asset_release(
  p_case_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_case core.resignation_asset_recovery_case%rowtype;
  v_recovery_status_id uuid;
begin
  select * into v_case
  from core.resignation_asset_recovery_case
  where id = p_case_id
  for update;

  if v_case.id is null then raise exception 'Asset recovery case not found'; end if;
  if v_case.closed_at is not null then
    return jsonb_build_object('ok', true, 'case_id', v_case.id, 'already_closed', true);
  end if;

  select id into v_recovery_status_id
  from core.asset_status
  where status_key = 'RECOVERY_PENDING';

  begin
    update core.asset
    set asset_status_id = v_recovery_status_id,
        assignment_muted = false,
        updated_at = now()
    where id = v_case.asset_id
      and company_id = v_case.company_id;

    update core.resignation_asset_recovery_case
    set release_trigger_status = 'SENT',
        release_triggered_at = now(),
        release_last_error = null,
        updated_at = now()
    where id = v_case.id;

    return jsonb_build_object('ok', true, 'case_id', v_case.id, 'asset_id', v_case.asset_id);
  exception when others then
    update core.resignation_asset_recovery_case
    set release_trigger_status = 'FAILED',
        release_last_error = sqlerrm,
        updated_at = now()
    where id = v_case.id;
    return jsonb_build_object('ok', false, 'case_id', v_case.id, 'asset_id', v_case.asset_id, 'error', sqlerrm);
  end;
end;
$$;

create or replace function core.process_due_resignation_workflows()
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_workflow record;
  v_asset record;
  v_case_id uuid;
  v_processed_ids uuid[] := '{}';
begin
  for v_workflow in
    select notice.*
    from public.schedule_override notice
    left join lateral (
      select terminal.timezone
      from public.company_terminal terminal
      where terminal.company_id = notice.company_id
        and terminal.is_active = true
      order by terminal.created_at
      limit 1
    ) terminal on true
    where notice.override_type = 'RESIGNATION_NOTICE'
      and notice.is_active = true
      and notice.workflow_status = 'COUNTDOWN_ACTIVE'
      and (now() at time zone coalesce(terminal.timezone, 'America/New_York'))::date
        >= notice.separation_effective_date
    order by notice.separation_effective_date, notice.created_at
    for update of notice skip locked
  loop
    update core.company_roster
    set employment_status = 'Former',
        separation_date = v_workflow.separation_effective_date
    where id = v_workflow.roster_member_id
      and company_id = v_workflow.company_id
      and employment_status <> 'Former';

    insert into core.company_roster_event (
      company_id, roster_id, event_category, event_type, event_detail, event_metadata
    ) values (
      v_workflow.company_id, v_workflow.roster_member_id, 'separation',
      'resignation_completed', 'Roster status moved to Former by the scheduled resignation workflow.',
      jsonb_build_object(
        'workflow_id', v_workflow.id,
        'notice_date', v_workflow.start_date,
        'last_scheduled_date', v_workflow.end_date,
        'separation_effective_date', v_workflow.separation_effective_date
      )
    );

    for v_asset in
      select asset.id as asset_id, assignment.id as assignment_id
      from core.asset asset
      left join core.asset_assignment assignment
        on assignment.asset_id = asset.id and assignment.released_at is null
      where asset.company_id = v_workflow.company_id
        and asset.assigned_roster_member_id = v_workflow.roster_member_id
    loop
      insert into core.resignation_asset_recovery_case (
        company_id, resignation_override_id, roster_member_id,
        asset_id, original_assignment_id
      ) values (
        v_workflow.company_id, v_workflow.id, v_workflow.roster_member_id,
        v_asset.asset_id, v_asset.assignment_id
      ) on conflict (resignation_override_id, asset_id) do update
        set updated_at = now()
      returning id into v_case_id;

      perform core.process_resignation_asset_release(v_case_id);
    end loop;

    update public.schedule_override
    set workflow_status = 'NOTIFICATION_PENDING',
        separation_processed_at = coalesce(separation_processed_at, now()),
        updated_at = now()
    where id = v_workflow.id;

    insert into core.resignation_workflow_event (
      company_id, resignation_override_id, roster_member_id, event_key,
      event_detail, event_metadata
    ) values (
      v_workflow.company_id, v_workflow.id, v_workflow.roster_member_id,
      'SEPARATION_PROCESSED',
      'Roster separation completed; asset release cases were initiated without blocking completion.',
      jsonb_build_object('separation_effective_date', v_workflow.separation_effective_date)
    );

    v_processed_ids := array_append(v_processed_ids, v_workflow.id);
  end loop;

  for v_case_id in
    select recovery.id
    from core.resignation_asset_recovery_case recovery
    where recovery.closed_at is null
      and recovery.release_trigger_status = 'FAILED'
    order by recovery.updated_at
    limit 50
    for update skip locked
  loop
    perform core.process_resignation_asset_release(v_case_id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed_count', cardinality(v_processed_ids),
    'workflow_ids', to_jsonb(v_processed_ids)
  );
end;
$$;

create or replace function core.get_pending_resignation_notifications()
returns setof jsonb
language sql
security definer
set search_path = core, public
as $$
  select jsonb_build_object(
    'workflow_id', notice.id,
    'company_slug', company.company_slug,
    'company_name', company.company_name,
    'employee_name', roster.full_name,
    'notice_date', notice.start_date,
    'last_scheduled_date', notice.end_date,
    'separation_date', notice.separation_effective_date,
    'recipients', coalesce(recipients.emails, '[]'::jsonb),
    'repaint_evidence', notice.repaint_evidence,
    'assets', coalesce(assets.items, '[]'::jsonb)
  )
  from public.schedule_override notice
  join core.companies company on company.id = notice.company_id
  join core.company_roster roster on roster.id = notice.roster_member_id
  left join lateral (
    select jsonb_agg(distinct email) filter (where email is not null) as emails
    from (
      select nullif(btrim(coalesce(profile.email, contact.email)), '') as email
      from core.company_leadership_assignment assignment
      left join core.profiles profile on profile.id = assignment.profile_id
      left join core.company_roster contact on contact.id = assignment.roster_member_id
      where assignment.company_id = notice.company_id
        and assignment.role_key in ('authorized_operator', 'business_contact')
    ) leadership
  ) recipients on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'case_id', recovery.id,
      'asset_identifier', asset.asset_identifier,
      'asset_type_label', asset_type.asset_type_label,
      'recovery_status', recovery.recovery_status,
      'release_trigger_status', recovery.release_trigger_status
    ) order by asset_type.asset_type_label, asset.asset_identifier) as items
    from core.resignation_asset_recovery_case recovery
    join core.asset asset on asset.id = recovery.asset_id
    join core.asset_type asset_type on asset_type.id = asset.asset_type_id
    where recovery.resignation_override_id = notice.id
  ) assets on true
  where notice.override_type = 'RESIGNATION_NOTICE'
    and notice.is_active = true
    and notice.workflow_status = 'NOTIFICATION_PENDING'
  order by notice.separation_effective_date, notice.created_at;
$$;

create or replace function core.record_resignation_notification_result(
  p_override_id uuid,
  p_provider_id text,
  p_error text
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_notice public.schedule_override%rowtype;
begin
  select * into v_notice
  from public.schedule_override
  where id = p_override_id and override_type = 'RESIGNATION_NOTICE'
  for update;
  if v_notice.id is null then raise exception 'Resignation notice not found'; end if;

  update public.schedule_override
  set workflow_status = case when p_error is null then 'COMPLETED' else 'NOTIFICATION_PENDING' end,
      notification_sent_at = case when p_error is null then now() else notification_sent_at end,
      notification_provider_id = case when p_error is null then p_provider_id else notification_provider_id end,
      notification_attempts = notification_attempts + 1,
      notification_last_error = p_error,
      updated_at = now()
  where id = p_override_id;

  insert into core.resignation_workflow_event (
    company_id, resignation_override_id, roster_member_id, event_key,
    event_detail, event_metadata
  ) values (
    v_notice.company_id, v_notice.id, v_notice.roster_member_id,
    case when p_error is null then 'COMPLETION_EMAIL_SENT' else 'COMPLETION_EMAIL_FAILED' end,
    case when p_error is null
      then 'Completion evidence email sent to the configured AO and Business Contact.'
      else 'Completion email will retry automatically.'
    end,
    jsonb_build_object('provider_id', p_provider_id, 'error', p_error)
  );

  return jsonb_build_object(
    'ok', p_error is null,
    'workflow_id', p_override_id,
    'workflow_status', case when p_error is null then 'COMPLETED' else 'NOTIFICATION_PENDING' end
  );
end;
$$;

create or replace function core.reconcile_resignation_asset_recovery(
  p_company_slug text,
  p_case_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_case core.resignation_asset_recovery_case%rowtype;
  v_asset core.asset%rowtype;
  v_available_status_id uuid;
begin
  select id into v_company_id from core.companies where company_slug = p_company_slug;
  if v_company_id is null then raise exception 'Company not found'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden'; end if;

  select * into v_case
  from core.resignation_asset_recovery_case
  where id = p_case_id and company_id = v_company_id
  for update;
  if v_case.id is null then raise exception 'Asset recovery case not found'; end if;
  if v_case.closed_at is not null then
    return jsonb_build_object('ok', true, 'case_id', v_case.id, 'already_closed', true);
  end if;

  select * into v_asset from core.asset where id = v_case.asset_id for update;

  if v_asset.assigned_roster_member_id is null and v_asset.assigned_person_id is null then
    select id into v_available_status_id from core.asset_status where status_key = 'AVAILABLE';
    update core.asset
    set asset_status_id = v_available_status_id,
        released_at = coalesce(released_at, now()),
        updated_at = now()
    where id = v_asset.id;
  end if;

  update core.resignation_asset_recovery_case
  set recovery_status = 'CLOSED',
      recovered_at = coalesce(recovered_at, now()),
      reconciled_at = coalesce(reconciled_at, now()),
      closed_at = now(),
      updated_at = now()
  where id = v_case.id;

  insert into core.asset_event (
    asset_id, company_id, event_key, event_label, roster_member_id, event_notes
  ) values (
    v_asset.id, v_company_id, 'RECOVERY_RECONCILED', 'Recovery reconciled',
    v_asset.assigned_roster_member_id,
    case when v_asset.assigned_roster_member_id is null
      then 'Physical recovery verified; asset is available.'
      else 'Physical recovery verified; current asset assignment was preserved.'
    end
  );

  return jsonb_build_object(
    'ok', true,
    'case_id', v_case.id,
    'asset_id', v_asset.id,
    'assigned_roster_member_id', v_asset.assigned_roster_member_id,
    'asset_available', v_asset.assigned_roster_member_id is null
  );
end;
$$;

create or replace function public.submit_company_resignation_notice(
  p_company_slug text,
  p_roster_member_id uuid,
  p_last_scheduled_date date,
  p_manager_note text default null
) returns jsonb
language sql
security definer
set search_path = public, core
as $$
  select core.submit_company_resignation_notice(
    p_company_slug, p_roster_member_id, p_last_scheduled_date, p_manager_note
  );
$$;

create or replace function public.update_company_resignation_notice(
  p_company_slug text,
  p_override_id uuid,
  p_last_scheduled_date date,
  p_manager_note text default null
) returns jsonb
language sql
security definer
set search_path = public, core
as $$
  select core.update_company_resignation_notice(
    p_company_slug, p_override_id, p_last_scheduled_date, p_manager_note
  );
$$;

create or replace function public.cancel_company_resignation_notice(
  p_company_slug text,
  p_override_id uuid,
  p_disposition text default 'CANCELLED'
) returns jsonb
language sql
security definer
set search_path = public, core
as $$
  select core.cancel_company_resignation_notice(
    p_company_slug, p_override_id, p_disposition
  );
$$;

create or replace function public.process_due_resignation_workflows()
returns jsonb
language sql
security definer
set search_path = public, core
as $$ select core.process_due_resignation_workflows(); $$;

create or replace function public.get_pending_resignation_notifications()
returns setof jsonb
language sql
security definer
set search_path = public, core
as $$ select * from core.get_pending_resignation_notifications(); $$;

create or replace function public.record_resignation_notification_result(
  p_override_id uuid,
  p_provider_id text,
  p_error text
) returns jsonb
language sql
security definer
set search_path = public, core
as $$
  select core.record_resignation_notification_result(
    p_override_id, p_provider_id, p_error
  );
$$;

create or replace function public.reconcile_resignation_asset_recovery(
  p_company_slug text,
  p_case_id uuid
) returns jsonb
language sql
security definer
set search_path = public, core
as $$
  select core.reconcile_resignation_asset_recovery(p_company_slug, p_case_id);
$$;

revoke all on function public.submit_company_resignation_notice(text, uuid, date, text) from public;
revoke all on function public.update_company_resignation_notice(text, uuid, date, text) from public;
revoke all on function public.cancel_company_resignation_notice(text, uuid, text) from public;
revoke all on function public.process_due_resignation_workflows() from public;
revoke all on function public.get_pending_resignation_notifications() from public;
revoke all on function public.record_resignation_notification_result(uuid, text, text) from public;
revoke all on function public.reconcile_resignation_asset_recovery(text, uuid) from public;

grant execute on function public.submit_company_resignation_notice(text, uuid, date, text)
  to authenticated, service_role;
grant execute on function public.update_company_resignation_notice(text, uuid, date, text)
  to authenticated, service_role;
grant execute on function public.cancel_company_resignation_notice(text, uuid, text)
  to authenticated, service_role;
grant execute on function public.process_due_resignation_workflows()
  to service_role;
grant execute on function public.get_pending_resignation_notifications()
  to service_role;
grant execute on function public.record_resignation_notification_result(uuid, text, text)
  to service_role;
grant execute on function public.reconcile_resignation_asset_recovery(text, uuid)
  to authenticated, service_role;

comment on function public.submit_company_resignation_notice(text, uuid, date, text) is
  'Submit-once resignation workflow: locks the notice date, repaints the loaded schedule immediately, and registers the LD+1 cascade.';
comment on table core.resignation_asset_recovery_case is
  'Non-blocking physical asset recovery cases created by completed resignation cascades. New assignments reconcile open cases automatically.';

commit;
