begin;

create or replace function public.mobile_companion_create_walk_on_candidate(
  p_company_slug text,
  p_full_name text,
  p_seen_date date default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_roster_id uuid;
  v_full_name text := nullif(pg_catalog.btrim(coalesce(p_full_name, '')), '');
  v_timezone text;
  v_service_date date;
begin
  select profile.id into v_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;
  if v_profile_id is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = pg_catalog.lower(pg_catalog.btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;
  if v_company_id is null then raise exception 'ACTIVE_COMPANY_REQUIRED'; end if;
  if not core.mobile_companion_can_use_workspace(v_company_id, 'dispatch') then
    raise exception 'DISPATCH_GRANT_REQUIRED';
  end if;
  if v_full_name is null then raise exception 'CANDIDATE_NAME_REQUIRED'; end if;

  select terminal.timezone into v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
    and nullif(pg_catalog.btrim(terminal.timezone), '') is not null
  order by terminal.created_at, terminal.terminal_id
  limit 1;
  if nullif(pg_catalog.btrim(v_timezone), '') is null then
    raise exception 'ACTIVE_TERMINAL_TIMEZONE_REQUIRED';
  end if;
  v_service_date := coalesce(p_seen_date, (pg_catalog.now() at time zone v_timezone)::date);
  if v_service_date > (pg_catalog.now() at time zone v_timezone)::date then
    raise exception 'FUTURE_WALK_ON_SERVICE_DATE';
  end if;

  select roster.id into v_roster_id
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.roster_record_kind = 'INTERNAL'
    and roster.employment_status = 'Candidate'
    and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(roster.full_name), '\s+', ' ', 'g')) =
        pg_catalog.lower(pg_catalog.regexp_replace(v_full_name, '\s+', ' ', 'g'))
  order by roster.created_at desc
  limit 1;

  if v_roster_id is null then
    insert into core.company_roster (
      company_id, full_name, worker_type, job_title, employment_status,
      invite_status, compliance_summary, notes, roster_record_kind
    ) values (
      v_company_id, v_full_name, 'Candidate', 'Driver Candidate', 'Candidate',
      'Not Invited', 'Pending',
      coalesce(nullif(pg_catalog.btrim(coalesce(p_note, '')), ''), 'Candidate created from Mobile Companion walk-on workflow.'),
      'INTERNAL'
    ) returning id into v_roster_id;
  end if;

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail,
    event_metadata, occurred_at, created_by_profile_id
  ) values (
    v_company_id, v_roster_id, 'hiring', 'walk_on_candidate_created',
    'Candidate created from the mobile walk-on workflow.',
    pg_catalog.jsonb_build_object('source', 'mobile_companion_walk_on', 'service_date', v_service_date),
    pg_catalog.now(), v_profile_id
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'record_mode', 'CANDIDATE',
    'roster_member_id', v_roster_id,
    'full_name', v_full_name,
    'service_date', v_service_date
  );
end;
$$;

create or replace function public.mobile_companion_upsert_walk_on_assignment(
  p_company_slug text,
  p_seen_date date default null,
  p_roster_member_id uuid default null,
  p_full_name text default null,
  p_dswid text default null,
  p_workforce_unit_id uuid default null,
  p_new_workforce_unit_name text default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_roster_id uuid := p_roster_member_id;
  v_walk_on_id uuid;
  v_workforce_unit_id uuid := p_workforce_unit_id;
  v_full_name text := nullif(pg_catalog.btrim(coalesce(p_full_name, '')), '');
  v_dswid text := nullif(pg_catalog.btrim(coalesce(p_dswid, '')), '');
  v_unit_name text := nullif(pg_catalog.btrim(coalesce(p_new_workforce_unit_name, '')), '');
  v_timezone text;
  v_service_date date;
begin
  select profile.id into v_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;
  if v_profile_id is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = pg_catalog.lower(pg_catalog.btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;
  if v_company_id is null then raise exception 'ACTIVE_COMPANY_REQUIRED'; end if;
  if not core.mobile_companion_can_use_workspace(v_company_id, 'dispatch') then
    raise exception 'DISPATCH_GRANT_REQUIRED';
  end if;

  select terminal.timezone into v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
    and nullif(pg_catalog.btrim(terminal.timezone), '') is not null
  order by terminal.created_at, terminal.terminal_id
  limit 1;
  if nullif(pg_catalog.btrim(v_timezone), '') is null then
    raise exception 'ACTIVE_TERMINAL_TIMEZONE_REQUIRED';
  end if;
  v_service_date := coalesce(p_seen_date, (pg_catalog.now() at time zone v_timezone)::date);
  if v_service_date > (pg_catalog.now() at time zone v_timezone)::date then
    raise exception 'FUTURE_WALK_ON_SERVICE_DATE';
  end if;

  if v_unit_name is not null then
    insert into core.company_walk_on_workforce_unit (
      company_id, unit_name, normalized_name, created_by_profile_id
    ) values (
      v_company_id, v_unit_name,
      pg_catalog.lower(pg_catalog.regexp_replace(v_unit_name, '\s+', ' ', 'g')),
      v_profile_id
    )
    on conflict (company_id, normalized_name) do update set
      unit_name = excluded.unit_name,
      status = 'ACTIVE',
      updated_at = pg_catalog.now()
    returning id into v_workforce_unit_id;
  end if;

  if v_workforce_unit_id is null then raise exception 'WORKFORCE_UNIT_REQUIRED'; end if;
  if not exists (
    select 1 from core.company_walk_on_workforce_unit unit
    where unit.id = v_workforce_unit_id
      and unit.company_id = v_company_id
      and unit.status = 'ACTIVE'
  ) then raise exception 'WORKFORCE_UNIT_OUTSIDE_COMPANY_SCOPE'; end if;

  if v_roster_id is not null then
    select roster.id, roster.full_name, identity.dswid
    into v_roster_id, v_full_name, v_dswid
    from core.company_roster roster
    left join core.company_roster_identity_v identity on identity.roster_id = roster.id
    where roster.id = v_roster_id
      and roster.company_id = v_company_id
      and roster.roster_record_kind = 'WALK_ON';
    if v_roster_id is null then raise exception 'WALK_ON_OUTSIDE_COMPANY_SCOPE'; end if;
  else
    if v_full_name is null or v_dswid is null then raise exception 'WALK_ON_NAME_AND_DSWID_REQUIRED'; end if;

    select roster.id into v_roster_id
    from core.company_roster roster
    join core.company_roster_identifier identifier
      on identifier.roster_id = roster.id
     and identifier.identifier_type = 'dswid'
    where roster.company_id = v_company_id
      and roster.roster_record_kind = 'WALK_ON'
      and pg_catalog.regexp_replace(pg_catalog.upper(identifier.identifier_value), '[^A-Z0-9]+', '', 'g') =
          pg_catalog.regexp_replace(pg_catalog.upper(v_dswid), '[^A-Z0-9]+', '', 'g')
    limit 1;

    if v_roster_id is null then
      insert into core.company_roster (
        company_id, full_name, worker_type, job_title, employment_status,
        invite_status, compliance_summary, notes, roster_record_kind
      ) values (
        v_company_id, v_full_name, 'Driver', 'Support Driver', 'Support',
        'Not Invited', 'Missing',
        coalesce(nullif(pg_catalog.btrim(coalesce(p_note, '')), ''), 'Reusable walk-on support driver.'),
        'WALK_ON'
      ) returning id into v_roster_id;
    end if;
  end if;

  if v_dswid is not null then
    if exists (
      select 1
      from core.company_roster_identifier identifier
      join core.company_roster roster on roster.id = identifier.roster_id
      where roster.company_id = v_company_id
        and roster.id <> v_roster_id
        and identifier.identifier_type = 'dswid'
        and pg_catalog.regexp_replace(pg_catalog.upper(identifier.identifier_value), '[^A-Z0-9]+', '', 'g') =
            pg_catalog.regexp_replace(pg_catalog.upper(v_dswid), '[^A-Z0-9]+', '', 'g')
    ) then raise exception 'DSWID_ALREADY_ASSIGNED'; end if;

    insert into core.company_roster_identifier (roster_id, identifier_type, identifier_value)
    values (v_roster_id, 'dswid', v_dswid)
    on conflict (roster_id, identifier_type) do update set identifier_value = excluded.identifier_value;
  end if;

  insert into core.walk_on_driver (
    company_id, full_name, normalized_name, first_seen_date, last_seen_date,
    dispatch_count, status, candidate_roster_id, workforce_unit_id, created_by_profile_id
  ) values (
    v_company_id, v_full_name,
    pg_catalog.lower(pg_catalog.regexp_replace(v_full_name, '\s+', ' ', 'g')),
    v_service_date, v_service_date, 1, 'ACTIVE', v_roster_id,
    v_workforce_unit_id, v_profile_id
  )
  on conflict (company_id, normalized_name) do update set
    full_name = excluded.full_name,
    first_seen_date = least(core.walk_on_driver.first_seen_date, excluded.first_seen_date),
    last_seen_date = greatest(core.walk_on_driver.last_seen_date, excluded.last_seen_date),
    dispatch_count = core.walk_on_driver.dispatch_count + 1,
    status = 'ACTIVE',
    candidate_roster_id = excluded.candidate_roster_id,
    workforce_unit_id = excluded.workforce_unit_id,
    updated_at = pg_catalog.now()
  returning id into v_walk_on_id;

  insert into core.company_walk_on_assignment (
    company_id, walk_on_driver_id, roster_member_id, workforce_unit_id,
    service_date, note, created_by_profile_id
  ) values (
    v_company_id, v_walk_on_id, v_roster_id, v_workforce_unit_id,
    v_service_date, nullif(pg_catalog.btrim(coalesce(p_note, '')), ''), v_profile_id
  )
  on conflict (company_id, roster_member_id, service_date) do update set
    walk_on_driver_id = excluded.walk_on_driver_id,
    workforce_unit_id = excluded.workforce_unit_id,
    assignment_status = 'ACTIVE',
    note = coalesce(excluded.note, core.company_walk_on_assignment.note),
    updated_at = pg_catalog.now();

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail,
    event_metadata, occurred_at, created_by_profile_id
  ) values (
    v_company_id, v_roster_id, 'operations', 'walk_on_assigned',
    'Walk-on support driver assigned for a service date.',
    pg_catalog.jsonb_build_object(
      'source', 'mobile_companion_walk_on',
      'service_date', v_service_date,
      'workforce_unit_id', v_workforce_unit_id,
      'dswid', v_dswid
    ),
    pg_catalog.now(), v_profile_id
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'record_mode', 'WALK_ON',
    'roster_member_id', v_roster_id,
    'walk_on_driver_id', v_walk_on_id,
    'workforce_unit_id', v_workforce_unit_id,
    'full_name', v_full_name,
    'dswid', v_dswid,
    'service_date', v_service_date
  );
end;
$$;

create or replace function public.mobile_companion_manage_walk_on_identity(
  p_company_slug text,
  p_roster_member_id uuid,
  p_full_name text,
  p_dswid text,
  p_workforce_unit_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_walk_on_id uuid;
  v_full_name text := nullif(pg_catalog.btrim(coalesce(p_full_name, '')), '');
  v_dswid text := nullif(pg_catalog.btrim(coalesce(p_dswid, '')), '');
  v_status text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_status, '')));
begin
  select profile.id into v_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;
  if v_profile_id is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = pg_catalog.lower(pg_catalog.btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;
  if v_company_id is null then raise exception 'ACTIVE_COMPANY_REQUIRED'; end if;
  if not core.mobile_companion_can_use_workspace(v_company_id, 'dispatch') then
    raise exception 'DISPATCH_GRANT_REQUIRED';
  end if;
  if v_full_name is null or v_dswid is null then raise exception 'WALK_ON_NAME_AND_DSWID_REQUIRED'; end if;
  if v_status not in ('ACTIVE', 'ARCHIVED') then raise exception 'INVALID_WALK_ON_STATUS'; end if;

  if not exists (
    select 1 from core.company_walk_on_workforce_unit unit
    where unit.id = p_workforce_unit_id
      and unit.company_id = v_company_id
      and unit.status = 'ACTIVE'
  ) then raise exception 'WORKFORCE_UNIT_OUTSIDE_COMPANY_SCOPE'; end if;

  select walk_on.id into v_walk_on_id
  from core.walk_on_driver walk_on
  join core.company_roster roster
    on roster.id = walk_on.candidate_roster_id
   and roster.company_id = walk_on.company_id
  where walk_on.company_id = v_company_id
    and walk_on.candidate_roster_id = p_roster_member_id
    and roster.roster_record_kind = 'WALK_ON';
  if v_walk_on_id is null then raise exception 'WALK_ON_OUTSIDE_COMPANY_SCOPE'; end if;

  if exists (
    select 1
    from core.company_roster_identifier identifier
    join core.company_roster roster on roster.id = identifier.roster_id
    where roster.company_id = v_company_id
      and roster.id <> p_roster_member_id
      and identifier.identifier_type = 'dswid'
      and pg_catalog.regexp_replace(pg_catalog.upper(identifier.identifier_value), '[^A-Z0-9]+', '', 'g') =
          pg_catalog.regexp_replace(pg_catalog.upper(v_dswid), '[^A-Z0-9]+', '', 'g')
  ) then raise exception 'DSWID_ALREADY_ASSIGNED'; end if;

  update core.company_roster
  set full_name = v_full_name, employment_status = 'Support', roster_record_kind = 'WALK_ON'
  where id = p_roster_member_id and company_id = v_company_id;

  insert into core.company_roster_identifier (roster_id, identifier_type, identifier_value)
  values (p_roster_member_id, 'dswid', v_dswid)
  on conflict (roster_id, identifier_type) do update set identifier_value = excluded.identifier_value;

  update core.walk_on_driver
  set
    full_name = v_full_name,
    normalized_name = pg_catalog.lower(pg_catalog.regexp_replace(v_full_name, '\s+', ' ', 'g')),
    workforce_unit_id = p_workforce_unit_id,
    status = v_status,
    updated_at = pg_catalog.now()
  where id = v_walk_on_id;

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail,
    event_metadata, occurred_at, created_by_profile_id
  ) values (
    v_company_id, p_roster_member_id, 'operations',
    case when v_status = 'ARCHIVED' then 'walk_on_archived' else 'walk_on_updated' end,
    case when v_status = 'ARCHIVED' then 'Walk-on roster row archived.' else 'Walk-on roster row updated.' end,
    pg_catalog.jsonb_build_object(
      'source', 'mobile_companion_walk_on',
      'dswid', v_dswid,
      'workforce_unit_id', p_workforce_unit_id,
      'status', v_status
    ),
    pg_catalog.now(), v_profile_id
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'walk_on_driver_id', v_walk_on_id,
    'roster_member_id', p_roster_member_id,
    'full_name', v_full_name,
    'dswid', v_dswid,
    'workforce_unit_id', p_workforce_unit_id,
    'status', v_status
  );
end;
$$;

revoke all on function public.mobile_companion_create_walk_on_candidate(text, text, date, text) from public, anon;
grant execute on function public.mobile_companion_create_walk_on_candidate(text, text, date, text) to authenticated, service_role;

revoke all on function public.mobile_companion_upsert_walk_on_assignment(text, date, uuid, text, text, uuid, text, text) from public, anon;
grant execute on function public.mobile_companion_upsert_walk_on_assignment(text, date, uuid, text, text, uuid, text, text) to authenticated, service_role;

revoke all on function public.mobile_companion_manage_walk_on_identity(text, uuid, text, text, uuid, text) from public, anon;
grant execute on function public.mobile_companion_manage_walk_on_identity(text, uuid, text, text, uuid, text) to authenticated, service_role;

comment on function public.mobile_companion_upsert_walk_on_assignment(text, date, uuid, text, text, uuid, text, text)
is 'Creates or reuses a dated walk-on identity for a manager with an explicit Dispatch workspace grant.';

commit;

notify pgrst, 'reload schema';
