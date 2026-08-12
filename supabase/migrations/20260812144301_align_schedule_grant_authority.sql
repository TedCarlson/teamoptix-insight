begin;

-- Schedule is one governed company workspace. Web and native clients must use
-- the same active membership and workspace-grant authority instead of
-- maintaining client-specific permission branches.
create or replace function core.can_use_company_workspace(
  p_company_id uuid,
  p_grant_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and (
      core.is_platform_owner()
      or exists (
        select 1
        from core.profiles profile
        join core.company_memberships membership
          on membership.profile_id = profile.id
         and membership.company_id = p_company_id
         and membership.membership_status = 'active'
        where profile.auth_user_id = auth.uid()
          and profile.profile_status = 'active'
          and (
            membership.relationship_type = 'admin'
            or exists (
              select 1
              from core.company_user_grant workspace_grant
              where workspace_grant.company_id = p_company_id
                and workspace_grant.profile_id = profile.id
                and workspace_grant.grant_key = p_grant_key
                and workspace_grant.is_active = true
            )
          )
      )
    );
$$;

comment on function core.can_use_company_workspace(uuid, text) is
  'Shared workspace authority for active platform owners, company admins, or active company members with the requested active grant.';

revoke all on function core.can_use_company_workspace(uuid, text)
  from public, anon;
grant execute on function core.can_use_company_workspace(uuid, text)
  to authenticated, service_role;

create or replace function core.can_manage_schedule(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.can_use_company_workspace(p_company_id, 'schedule');
$$;

comment on function core.can_manage_schedule(uuid) is
  'Shared Schedule mutation authority used by all clients.';

revoke all on function core.can_manage_schedule(uuid) from public, anon;
grant execute on function core.can_manage_schedule(uuid)
  to authenticated, service_role;

-- Preserve existing mobile RPC callers while moving their grant decision onto
-- the shared company-workspace predicate.
create or replace function core.mobile_companion_can_use_workspace(
  p_company_id uuid,
  p_grant_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.can_use_company_workspace(p_company_id, p_grant_key);
$$;

revoke all on function core.mobile_companion_can_use_workspace(uuid, text)
  from public, anon;
grant execute on function core.mobile_companion_can_use_workspace(uuid, text)
  to authenticated, service_role;

-- Keep existing driver read/self-service policies intact. Only the leadership
-- mutation policies are aligned to the Schedule grant.
drop policy if exists schedule_baseline_insert on public.schedule_baseline;
create policy schedule_baseline_insert
on public.schedule_baseline for insert to authenticated
with check (core.can_manage_schedule(company_id));

drop policy if exists schedule_baseline_update on public.schedule_baseline;
create policy schedule_baseline_update
on public.schedule_baseline for update to authenticated
using (core.can_manage_schedule(company_id))
with check (core.can_manage_schedule(company_id));

drop policy if exists schedule_baseline_delete on public.schedule_baseline;
create policy schedule_baseline_delete
on public.schedule_baseline for delete to authenticated
using (core.can_manage_schedule(company_id));

drop policy if exists schedule_day_fact_insert on public.schedule_day_fact;
create policy schedule_day_fact_insert
on public.schedule_day_fact for insert to authenticated
with check (core.can_manage_schedule(company_id));

drop policy if exists schedule_day_fact_update on public.schedule_day_fact;
create policy schedule_day_fact_update
on public.schedule_day_fact for update to authenticated
using (core.can_manage_schedule(company_id))
with check (core.can_manage_schedule(company_id));

drop policy if exists schedule_day_fact_delete on public.schedule_day_fact;
create policy schedule_day_fact_delete
on public.schedule_day_fact for delete to authenticated
using (core.can_manage_schedule(company_id));

drop policy if exists schedule_override_insert on public.schedule_override;
create policy schedule_override_insert
on public.schedule_override for insert to authenticated
with check (core.can_manage_schedule(company_id));

drop policy if exists schedule_override_update on public.schedule_override;
create policy schedule_override_update
on public.schedule_override for update to authenticated
using (core.can_manage_schedule(company_id))
with check (core.can_manage_schedule(company_id));

drop policy if exists schedule_override_delete on public.schedule_override;
create policy schedule_override_delete
on public.schedule_override for delete to authenticated
using (core.can_manage_schedule(company_id));

drop policy if exists schedule_preset_insert on public.schedule_preset;
create policy schedule_preset_insert
on public.schedule_preset for insert to authenticated
with check (core.can_manage_schedule(company_id));

drop policy if exists schedule_preset_update on public.schedule_preset;
create policy schedule_preset_update
on public.schedule_preset for update to authenticated
using (core.can_manage_schedule(company_id))
with check (core.can_manage_schedule(company_id));

drop policy if exists schedule_preset_delete on public.schedule_preset;
create policy schedule_preset_delete
on public.schedule_preset for delete to authenticated
using (core.can_manage_schedule(company_id));

drop policy if exists driver_time_off_request_update_company
  on public.driver_time_off_request;
create policy driver_time_off_request_update_company
on public.driver_time_off_request for update to authenticated
using (core.can_manage_schedule(company_id))
with check (core.can_manage_schedule(company_id));

create or replace function public.review_driver_time_off_request(
  p_company_slug text,
  p_request_id uuid,
  p_decision text,
  p_manager_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_reviewer_profile_id uuid;
  v_decision text;
  v_note text;
  v_request public.driver_time_off_request%rowtype;
  v_override_id uuid;
  v_inserted_override_id uuid;
  v_terminal_id uuid;
  v_requested_date date;
  v_span_start date;
  v_span_end date;
  v_commit jsonb;
  v_duplicate boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select profile.id into v_reviewer_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null or not core.can_manage_schedule(v_company_id) then
    raise exception 'SCHEDULE_GRANT_REQUIRED';
  end if;

  v_decision := upper(btrim(coalesce(p_decision, '')));
  if v_decision not in ('APPROVED', 'DENIED') then
    raise exception 'INVALID_TIME_OFF_DECISION';
  end if;
  v_note := nullif(btrim(coalesce(p_manager_note, '')), '');
  if length(v_note) > 500 then
    raise exception 'TIME_OFF_NOTE_MAX_500';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select request.* into v_request
  from public.driver_time_off_request request
  where request.id = p_request_id
    and request.company_id = v_company_id
  for update;

  if not found then
    raise exception 'TIME_OFF_REQUEST_NOT_FOUND';
  end if;

  if v_request.status = v_decision then
    v_duplicate := true;
    v_override_id := v_request.schedule_override_id;
  elsif v_request.status <> 'PENDING' then
    raise exception 'ONLY_PENDING_TIME_OFF_CAN_BE_REVIEWED';
  elsif v_decision = 'DENIED' then
    update public.driver_time_off_request
    set status = 'DENIED',
        reviewed_by_auth_user_id = auth.uid(),
        reviewed_at = now(),
        manager_note = v_note,
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    select terminal.terminal_id into v_terminal_id
    from public.company_terminal terminal
    where terminal.company_id = v_company_id
      and terminal.is_active = true
    order by terminal.created_at, terminal.terminal_id
    limit 1;
    v_terminal_id := coalesce(
      v_terminal_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    );

    foreach v_requested_date in array v_request.requested_dates loop
      if v_span_start is null then
        v_span_start := v_requested_date;
        v_span_end := v_requested_date;
      elsif v_requested_date = v_span_end + 1 then
        v_span_end := v_requested_date;
      else
        insert into public.schedule_override (
          company_id, terminal_id, roster_member_id, override_type,
          start_date, end_date, route_name_override, source_request_id,
          is_active, manager_note
        ) values (
          v_company_id, v_terminal_id, v_request.roster_member_id, 'TIME_OFF',
          v_span_start, v_span_end, null, v_request.id, true, v_note
        ) returning id into v_inserted_override_id;
        v_override_id := coalesce(v_override_id, v_inserted_override_id);
        v_span_start := v_requested_date;
        v_span_end := v_requested_date;
      end if;
    end loop;

    if v_span_start is not null then
      insert into public.schedule_override (
        company_id, terminal_id, roster_member_id, override_type,
        start_date, end_date, route_name_override, source_request_id,
        is_active, manager_note
      ) values (
        v_company_id, v_terminal_id, v_request.roster_member_id, 'TIME_OFF',
        v_span_start, v_span_end, null, v_request.id, true, v_note
      ) returning id into v_inserted_override_id;
      v_override_id := coalesce(v_override_id, v_inserted_override_id);
    end if;

    update public.driver_time_off_request
    set status = 'APPROVED',
        reviewed_by_auth_user_id = auth.uid(),
        reviewed_at = now(),
        manager_note = v_note,
        schedule_override_id = v_override_id,
        updated_at = now()
    where id = v_request.id
    returning * into v_request;

    select public.paint_schedule_day_fact_for_roster_member(
      v_company_id,
      v_request.roster_member_id,
      v_request.start_date,
      70
    ) into v_commit;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate_action', v_duplicate,
    'request_id', v_request.id,
    'decision', v_request.status,
    'schedule_override_id', v_override_id,
    'commit', coalesce(v_commit, '{}'::jsonb)
  );
end;
$$;

comment on function public.review_driver_time_off_request(text, uuid, text, text) is
  'Reviews a driver time-off request under shared Schedule workspace authority and preserves idempotent approval/denial behavior.';

revoke all on function public.review_driver_time_off_request(
  text, uuid, text, text
) from public, anon;
grant execute on function public.review_driver_time_off_request(
  text, uuid, text, text
) to authenticated, service_role;

-- Resignation notices are Schedule workflows. Replacing these existing
-- authoritative functions changes only their authorization predicate; their
-- downstream repaint, audit, and lifecycle behavior remains unchanged.
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
  if not core.can_manage_schedule(v_company_id) then
    raise exception 'Schedule grant required';
  end if;
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
  if not core.can_manage_schedule(v_company_id) then
    raise exception 'Schedule grant required';
  end if;
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
  if not core.can_manage_schedule(v_company_id) then
    raise exception 'Schedule grant required';
  end if;

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

comment on function core.submit_company_resignation_notice(text, uuid, date, text) is
  'Submits the authoritative resignation Schedule workflow for a company administrator or active Schedule grantee.';
comment on function core.update_company_resignation_notice(text, uuid, date, text) is
  'Updates the authoritative resignation Schedule workflow for a company administrator or active Schedule grantee.';
comment on function core.cancel_company_resignation_notice(text, uuid, text) is
  'Cancels or rescinds the authoritative resignation Schedule workflow for a company administrator or active Schedule grantee.';

commit;
