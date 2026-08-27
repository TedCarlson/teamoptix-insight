begin;

-- Insight Demo is a permanent, synthetic product environment. It must never
-- be populated by copying a customer tenant or by anonymizing production data
-- at request time. The explicit mode is used by access gates and reset tools
-- to keep every review action inside this company boundary.
alter table core.companies
  add column if not exists experience_mode text not null default 'LIVE';

alter table core.companies
  drop constraint if exists companies_experience_mode_ck;

alter table core.companies
  add constraint companies_experience_mode_ck
  check (experience_mode in ('LIVE', 'DEMO'));

comment on column core.companies.experience_mode is
  'LIVE for customer truth and DEMO for fully synthetic, resettable product experiences. DEMO data must never be derived from a customer tenant.';

insert into core.companies (
  id, company_name, company_slug, company_status, contact_email,
  website_url, company_size_band, experience_mode
) values (
  'd3000000-0000-4000-8000-000000000001'::uuid,
  'Insight Demo',
  'insight-demo',
  'active',
  'app-review@example.invalid',
  'https://teamoptix.io',
  'DEMO',
  'DEMO'
)
on conflict (company_slug) do update
set company_name = excluded.company_name,
    company_status = 'active',
    contact_email = excluded.contact_email,
    website_url = excluded.website_url,
    company_size_band = excluded.company_size_band,
    experience_mode = 'DEMO',
    archived_at = null,
    updated_at = pg_catalog.now();

-- Include the experience mode in the shared access envelope so native clients
-- can preserve least-privilege grants for a demo administrator. Customer admins
-- continue receiving the complete administrator workspace set.
create or replace function core.access_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select
      profile.id as profile_id,
      profile.auth_user_id,
      profile.email,
      profile.first_name,
      profile.last_name,
      profile.display_name,
      profile.mobile_phone,
      profile.profile_status,
      profile.is_platform_owner,
      profile.theme_preference
    from core.profiles profile
    where profile.auth_user_id = auth.uid()
    limit 1
  ),
  memberships as (
    select
      membership.company_id,
      membership.profile_id,
      membership.relationship_type,
      membership.membership_status,
      membership.title,
      company.company_name,
      company.company_slug,
      company.company_status,
      company.primary_industry_id,
      company.experience_mode
    from core.company_memberships membership
    join core.companies company on company.id = membership.company_id
    join me on me.profile_id = membership.profile_id
    where membership.membership_status in ('pending', 'active', 'inactive')
  )
  select jsonb_build_object(
    'auth_user_id', me.auth_user_id,
    'profile_id', me.profile_id,
    'email', me.email,
    'first_name', me.first_name,
    'last_name', me.last_name,
    'display_name', me.display_name,
    'mobile_phone', me.mobile_phone,
    'profile_status', me.profile_status,
    'is_platform_owner', me.is_platform_owner,
    'theme_preference', me.theme_preference,
    'memberships', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'company_id', membership.company_id,
          'company_name', membership.company_name,
          'company_slug', membership.company_slug,
          'company_status', membership.company_status,
          'primary_industry_id', membership.primary_industry_id,
          'experience_mode', membership.experience_mode,
          'relationship_type', membership.relationship_type,
          'membership_status', membership.membership_status,
          'title', membership.title,
          'grants', coalesce((
            select jsonb_agg(company_grant.grant_key order by company_grant.grant_key)
            from core.company_user_grant company_grant
            where company_grant.company_id = membership.company_id
              and company_grant.profile_id = membership.profile_id
              and company_grant.is_active = true
          ), '[]'::jsonb)
        )
        order by
          case when membership.membership_status = 'active' then 0 else 1 end,
          membership.company_name
      )
      from memberships membership
    ), '[]'::jsonb)
  )
  from me;
$$;

revoke all on function core.access_context() from public, anon;
grant execute on function core.access_context() to authenticated, service_role;

-- A reviewer is a limited administrator of Insight Demo. This preserves
-- manager reads and demo-only driver actions without granting any authority in
-- a customer tenant.
create or replace function public.mobile_companion_access_gate()
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  roster_member_id uuid,
  driver_name text,
  access_mode text
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_profile as (
    select profile.id
    from core.profiles profile
    where profile.auth_user_id = auth.uid()
      and profile.profile_status = 'active'
    limit 1
  ),
  direct_driver as (
    select
      company.id as company_id,
      company.company_name,
      company.company_slug,
      roster.id as roster_member_id,
      roster.full_name as driver_name,
      'DRIVER'::text as access_mode,
      count(*) over (partition by company.id) as eligible_roster_count
    from active_profile profile
    join core.company_memberships membership
      on membership.profile_id = profile.id
     and membership.membership_status = 'active'
    join core.companies company
      on company.id = membership.company_id
     and company.company_status = 'active'
    join core.company_roster roster
      on roster.company_id = company.id
     and roster.profile_id = profile.id
     and roster.employment_status in ('Active', 'Trainee')
     and roster.roster_record_kind = 'INTERNAL'
    where exists (
      select 1
      from public.company_terminal terminal
      where terminal.company_id = company.id
        and terminal.is_active = true
        and nullif(pg_catalog.btrim(terminal.timezone), '') is not null
    )
  ),
  demo_company as (
    select distinct company.id, company.company_name, company.company_slug
    from active_profile profile
    join core.companies company on company.company_status = 'active'
    where core.is_platform_owner()
       or exists (
         select 1
         from core.company_memberships membership
         where membership.company_id = company.id
           and membership.profile_id = profile.id
           and membership.membership_status = 'active'
           and (
             membership.relationship_type = 'admin'
             or (
               company.experience_mode = 'DEMO'
               and exists (
                 select 1
                 from core.company_user_grant company_grant
                 where company_grant.company_id = company.id
                   and company_grant.profile_id = profile.id
                   and company_grant.is_active = true
               )
             )
           )
       )
  ),
  admin_preview as (
    select
      company.id as company_id,
      company.company_name,
      company.company_slug,
      roster.id as roster_member_id,
      roster.full_name as driver_name,
      'ADMIN_DEMO'::text as access_mode
    from demo_company company
    join core.company_roster roster
      on roster.company_id = company.id
     and roster.employment_status in ('Active', 'Trainee')
     and roster.roster_record_kind = 'INTERNAL'
    where exists (
      select 1
      from public.company_terminal terminal
      where terminal.company_id = company.id
        and terminal.is_active = true
        and nullif(pg_catalog.btrim(terminal.timezone), '') is not null
    )
  )
  select
    direct.company_id,
    direct.company_name,
    direct.company_slug,
    direct.roster_member_id,
    direct.driver_name,
    direct.access_mode
  from direct_driver direct
  where direct.eligible_roster_count = 1

  union all

  select
    preview.company_id,
    preview.company_name,
    preview.company_slug,
    preview.roster_member_id,
    preview.driver_name,
    preview.access_mode
  from admin_preview preview

  order by company_name, access_mode, driver_name, roster_member_id;
$$;

revoke all on function public.mobile_companion_access_gate()
  from public, anon;
grant execute on function public.mobile_companion_access_gate()
  to authenticated, service_role;

comment on function public.mobile_companion_access_gate() is
  'Returns the authenticated driver gate and isolated admin demo gates. A limited Insight Demo administrator may preview a synthetic driver without customer authority.';

-- Service-role provisioning binds an existing Supabase Auth user to the demo
-- company after the reviewer credential is created. Passwords are never stored
-- in SQL, source control, profile metadata, or the application bundle.
create or replace function public.provision_insight_demo_reviewer(
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_email text;
  v_company_id uuid;
  v_profile_id uuid;
  v_conflicting_auth_user_id uuid;
begin
  if p_auth_user_id is null then
    raise exception 'AUTH_USER_ID_REQUIRED';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(auth_user.email))
  into v_auth_email
  from auth.users auth_user
  where auth_user.id = p_auth_user_id;

  if nullif(v_auth_email, '') is null then
    raise exception 'AUTH_USER_EMAIL_REQUIRED';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = 'insight-demo'
    and company.company_status = 'active'
    and company.experience_mode = 'DEMO';

  if v_company_id is null then
    raise exception 'INSIGHT_DEMO_COMPANY_REQUIRED';
  end if;

  select profile.id, profile.auth_user_id
  into v_profile_id, v_conflicting_auth_user_id
  from core.profiles profile
  where profile.auth_user_id = p_auth_user_id
     or pg_catalog.lower(profile.email) = v_auth_email
  order by case when profile.auth_user_id = p_auth_user_id then 0 else 1 end
  limit 1;

  if v_profile_id is not null
     and v_conflicting_auth_user_id is not null
     and v_conflicting_auth_user_id <> p_auth_user_id then
    raise exception 'PROFILE_EMAIL_ALREADY_BOUND';
  end if;

  if v_profile_id is not null and (
    exists (
      select 1
      from core.profiles profile
      where profile.id = v_profile_id
        and profile.is_platform_owner = true
    )
    or exists (
      select 1
      from core.company_memberships membership
      where membership.profile_id = v_profile_id
        and membership.company_id <> v_company_id
    )
  ) then
    raise exception 'REVIEWER_PROFILE_MUST_BE_DEMO_ONLY';
  end if;

  if v_profile_id is null then
    insert into core.profiles (
      auth_user_id, email, first_name, last_name, display_name,
      profile_status, is_platform_owner
    ) values (
      p_auth_user_id, v_auth_email, 'App', 'Reviewer', 'App Reviewer',
      'active', false
    )
    returning id into v_profile_id;
  else
    update core.profiles
    set auth_user_id = p_auth_user_id,
        email = v_auth_email,
        first_name = 'App',
        last_name = 'Reviewer',
        display_name = 'App Reviewer',
        profile_status = 'active',
        is_platform_owner = false,
        archived_at = null,
        updated_at = pg_catalog.now()
    where id = v_profile_id;
  end if;

  update core.company_memberships membership
  set membership_status = 'active',
      relationship_type = 'admin',
      title = 'Demo Administrator',
      invited_at = coalesce(membership.invited_at, pg_catalog.now()),
      accepted_at = coalesce(membership.accepted_at, pg_catalog.now()),
      started_at = coalesce(membership.started_at, current_date),
      ended_at = null,
      notes = 'Dedicated App Review access. Insight Demo only.',
      updated_at = pg_catalog.now()
  where membership.company_id = v_company_id
    and membership.profile_id = v_profile_id;

  if not found then
    insert into core.company_memberships (
      company_id, profile_id, membership_status, relationship_type, title,
      invited_at, accepted_at, started_at, notes
    ) values (
      v_company_id, v_profile_id, 'active', 'admin', 'Demo Administrator',
      pg_catalog.now(), pg_catalog.now(), current_date,
      'Dedicated App Review access. Insight Demo only.'
    );
  end if;

  -- Keep the reviewer surface intentionally small. In particular, uploads,
  -- payroll, hiring, company configuration, grant management, and customer
  -- opportunity data are out of scope.
  delete from core.company_user_grant company_grant
  where company_grant.company_id = v_company_id
    and company_grant.profile_id = v_profile_id;

  insert into core.company_user_grant (
    company_id, profile_id, grant_key, is_active, granted_by_profile_id
  )
  select v_company_id, v_profile_id, grant_key, true, null
  from unnest(array[
    'schedule', 'dispatch', 'delivery_window', 'reports', 'fleet', 'routes'
  ]::text[]) as grant_key;

  return jsonb_build_object(
    'ok', true,
    'auth_user_id', p_auth_user_id,
    'profile_id', v_profile_id,
    'company_id', v_company_id,
    'company_slug', 'insight-demo',
    'experience_mode', 'DEMO',
    'grants', jsonb_build_array(
      'schedule', 'dispatch', 'delivery_window', 'reports', 'fleet', 'routes'
    )
  );
end;
$$;

revoke all on function public.provision_insight_demo_reviewer(uuid)
  from public, anon, authenticated;
grant execute on function public.provision_insight_demo_reviewer(uuid)
  to service_role;

comment on function public.provision_insight_demo_reviewer(uuid) is
  'Binds one existing Auth user to the isolated Insight Demo company with the minimum App Review grants. Service role only; credentials are managed by Supabase Auth.';

-- Refreshes only records that carry deterministic Insight Demo identities or
-- the insight-demo:// source prefix. Reviewer-created inspections, evidence,
-- messages, and other interactions are deliberately preserved.
create or replace function public.refresh_insight_demo_workspace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_terminal_id constant uuid := 'd3000000-0000-4000-8000-000000000002'::uuid;
  v_service_date date;
  v_batch_id uuid;
  v_route record;
  v_planned_stops integer;
  v_actual_stops integer;
  v_planned_packages integer;
  v_actual_packages integer;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = 'insight-demo'
    and company.company_status = 'active'
    and company.experience_mode = 'DEMO';

  if v_company_id is null then
    raise exception 'INSIGHT_DEMO_COMPANY_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insight-demo-workspace', 0)
  );

  if exists (
    select 1 from public.company_terminal terminal
    where terminal.terminal_id = v_terminal_id
      and terminal.company_id <> v_company_id
  ) then
    raise exception 'INSIGHT_DEMO_ID_COLLISION';
  end if;

  if exists (
    select 1
    from core.company_roster roster
    where roster.id in (
      'd3000000-0000-4000-8000-000000000201'::uuid,
      'd3000000-0000-4000-8000-000000000202'::uuid,
      'd3000000-0000-4000-8000-000000000203'::uuid,
      'd3000000-0000-4000-8000-000000000204'::uuid,
      'd3000000-0000-4000-8000-000000000205'::uuid
    ) and roster.company_id <> v_company_id
  ) or exists (
    select 1
    from public.route_baseline route
    where route.id in (
      'd3000000-0000-4000-8000-000000000101'::uuid,
      'd3000000-0000-4000-8000-000000000102'::uuid,
      'd3000000-0000-4000-8000-000000000103'::uuid,
      'd3000000-0000-4000-8000-000000000104'::uuid
    ) and route.company_id <> v_company_id
  ) or exists (
    select 1
    from fleet.vehicle vehicle
    where vehicle.id in (
      'd3000000-0000-4000-8000-000000000501'::uuid,
      'd3000000-0000-4000-8000-000000000502'::uuid,
      'd3000000-0000-4000-8000-000000000503'::uuid
    ) and vehicle.company_id <> v_company_id
  ) or exists (
    select 1
    from core.company_message message
    where message.id in (
      'd3000000-0000-4000-8000-000000000601'::uuid,
      'd3000000-0000-4000-8000-000000000602'::uuid,
      'd3000000-0000-4000-8000-000000000603'::uuid
    ) and message.company_id <> v_company_id
  ) or exists (
    select 1
    from fleet.defect defect
    where defect.id = 'd3000000-0000-4000-8000-000000000701'::uuid
      and defect.company_id <> v_company_id
  ) or exists (
    select 1
    from fleet.work_order work_order
    where work_order.id = 'd3000000-0000-4000-8000-000000000702'::uuid
      and work_order.company_id <> v_company_id
  ) then
    raise exception 'INSIGHT_DEMO_ID_COLLISION';
  end if;

  insert into public.company_terminal (
    terminal_id, company_id, terminal_code, terminal_name, timezone,
    is_active, city, state_region
  ) values (
    v_terminal_id, v_company_id, 'DEMO', 'Insight Demonstration Terminal',
    'America/New_York', true, 'Demonstration City', 'DE'
  )
  on conflict (terminal_id) do update
  set terminal_code = excluded.terminal_code,
      terminal_name = excluded.terminal_name,
      timezone = excluded.timezone,
      is_active = true,
      city = excluded.city,
      state_region = excluded.state_region;

  insert into core.company_roster (
    id, company_id, full_name, worker_type, job_title, employment_status,
    market_code, hire_date, invite_status, compliance_summary, notes,
    roster_record_kind, seat_type
  ) values
    ('d3000000-0000-4000-8000-000000000201', v_company_id,
      'Avery Lane', 'Driver', 'Delivery Professional', 'Active', 'DEMO',
      current_date - 420, 'Not Invited', 'Compliant',
      'Synthetic Insight Demo identity. No customer source.', 'INTERNAL', 'FIELD'),
    ('d3000000-0000-4000-8000-000000000202', v_company_id,
      'Jordan Reed', 'Driver', 'Delivery Professional', 'Active', 'DEMO',
      current_date - 360, 'Not Invited', 'Compliant',
      'Synthetic Insight Demo identity. No customer source.', 'INTERNAL', 'FIELD'),
    ('d3000000-0000-4000-8000-000000000203', v_company_id,
      'Morgan Shaw', 'Driver', 'Delivery Professional', 'Active', 'DEMO',
      current_date - 300, 'Not Invited', 'Compliant',
      'Synthetic Insight Demo identity. No customer source.', 'INTERNAL', 'FIELD'),
    ('d3000000-0000-4000-8000-000000000204', v_company_id,
      'Taylor Quinn', 'Driver', 'Delivery Professional', 'Active', 'DEMO',
      current_date - 240, 'Not Invited', 'Expiring',
      'Synthetic Insight Demo identity. No customer source.', 'INTERNAL', 'FIELD'),
    ('d3000000-0000-4000-8000-000000000205', v_company_id,
      'Cameron Blake', 'Trainee', 'Driver Trainee', 'Trainee', 'DEMO',
      current_date - 14, 'Not Invited', 'Missing',
      'Synthetic trainee. Grouped separately and excluded from readiness.',
      'INTERNAL', 'TRAINING')
  on conflict (id) do update
  set full_name = excluded.full_name,
      worker_type = excluded.worker_type,
      job_title = excluded.job_title,
      employment_status = excluded.employment_status,
      market_code = excluded.market_code,
      hire_date = excluded.hire_date,
      invite_status = excluded.invite_status,
      compliance_summary = excluded.compliance_summary,
      notes = excluded.notes,
      roster_record_kind = excluded.roster_record_kind,
      seat_type = excluded.seat_type,
      email = null,
      phone = null,
      profile_id = null,
      separation_date = null;

  insert into public.route_baseline (
    id, company_id, terminal_id, route_name, current_wa_num,
    route_location, route_type, threshold_stops, threshold_rate,
    runs_s, runs_u, runs_m, runs_t, runs_w, runs_h, runs_f,
    is_active, effective_start, effective_end
  ) values
    ('d3000000-0000-4000-8000-000000000101', v_company_id, v_terminal_id,
      'Route Alpha', 'DEMO-A', 'North', 'CORE', 68, 18.0,
      true, false, true, true, true, true, true, true, current_date - 365, null),
    ('d3000000-0000-4000-8000-000000000102', v_company_id, v_terminal_id,
      'Route Bravo', 'DEMO-B', 'Central', 'CORE', 72, 17.5,
      true, false, true, true, true, true, true, true, current_date - 365, null),
    ('d3000000-0000-4000-8000-000000000103', v_company_id, v_terminal_id,
      'Route Cedar', 'DEMO-C', 'South', 'CORE', 64, 18.5,
      true, false, true, true, true, true, true, true, current_date - 365, null),
    ('d3000000-0000-4000-8000-000000000104', v_company_id, v_terminal_id,
      'Route Delta', 'DEMO-D', 'West', 'CORE', 70, 18.0,
      true, false, true, true, true, true, true, true, current_date - 365, null)
  on conflict (id) do update
  set terminal_id = excluded.terminal_id,
      route_name = excluded.route_name,
      current_wa_num = excluded.current_wa_num,
      route_location = excluded.route_location,
      route_type = excluded.route_type,
      threshold_stops = excluded.threshold_stops,
      threshold_rate = excluded.threshold_rate,
      runs_s = excluded.runs_s,
      runs_u = excluded.runs_u,
      runs_m = excluded.runs_m,
      runs_t = excluded.runs_t,
      runs_w = excluded.runs_w,
      runs_h = excluded.runs_h,
      runs_f = excluded.runs_f,
      is_active = true,
      effective_start = excluded.effective_start,
      effective_end = null,
      updated_at = pg_catalog.now();

  delete from public.schedule_day_fact fact
  where fact.company_id = v_company_id
    and fact.source_kind = 'INSIGHT_DEMO';

  insert into public.schedule_day_fact (
    company_id, terminal_id, service_date, roster_member_id,
    planned_on, route_name, source_kind, rotation_mode, anchor_date
  )
  select
    v_company_id,
    v_terminal_id,
    series.day_value::date,
    roster.id,
    case
      when roster.employment_status = 'Trainee' then
        pg_catalog.date_part('isodow', series.day_value)::integer in (2, 4, 6)
      else pg_catalog.date_part('isodow', series.day_value)::integer <> 7
    end,
    case
      when roster.employment_status = 'Trainee' then null
      when pg_catalog.date_part('isodow', series.day_value)::integer = 7 then null
      else route.route_name
    end,
    'INSIGHT_DEMO',
    'NONE',
    current_date - 60
  from pg_catalog.generate_series(
    current_date - 60,
    current_date + 180,
    interval '1 day'
  ) as series(day_value)
  cross join (values
    ('d3000000-0000-4000-8000-000000000201'::uuid, 'd3000000-0000-4000-8000-000000000101'::uuid),
    ('d3000000-0000-4000-8000-000000000202'::uuid, 'd3000000-0000-4000-8000-000000000102'::uuid),
    ('d3000000-0000-4000-8000-000000000203'::uuid, 'd3000000-0000-4000-8000-000000000103'::uuid),
    ('d3000000-0000-4000-8000-000000000204'::uuid, 'd3000000-0000-4000-8000-000000000104'::uuid),
    ('d3000000-0000-4000-8000-000000000205'::uuid, null::uuid)
  ) as pairing(roster_id, route_id)
  join core.company_roster roster on roster.id = pairing.roster_id
  left join public.route_baseline route on route.id = pairing.route_id
  on conflict (company_id, service_date, roster_member_id) do update
  set terminal_id = excluded.terminal_id,
      planned_on = excluded.planned_on,
      route_name = excluded.route_name,
      source_kind = excluded.source_kind,
      rotation_mode = excluded.rotation_mode,
      anchor_date = excluded.anchor_date,
      preset_id = null,
      baseline_id = null,
      override_id = null;

  insert into fleet.vehicle (
    id, company_id, unit_number, fedex_vehicle_id, vehicle_type, status,
    year, make, model, vin, plate_number, plate_state, terminal_name,
    primary_route, primary_roster_member_id, odometer_miles,
    odometer_recorded_at, gvwr_lbs, fuel_type, ownership_type,
    in_service_date, notes, gvwr_source, gvwr_evidence_reference,
    gvwr_verified_status, gvwr_verified_at
  ) values
    ('d3000000-0000-4000-8000-000000000501', v_company_id,
      'DEMO-A', 'DEMO-A', 'STEP_VAN', 'ASSIGNED', 2024, 'Demo', 'Parcel Van',
      'DEMO0000000000001', 'DEMO-A', 'DE', 'Insight Demonstration Terminal',
      'Route Alpha', 'd3000000-0000-4000-8000-000000000201', 18420,
      pg_catalog.now(), 9990, 'Synthetic manufacturer record', 'LEASED',
      current_date - 240, 'Synthetic Insight Demo unit. Not a customer asset.',
      'MANUAL_ENTRY', 'insight-demo://vehicle/DEMO-A', 'VERIFIED', pg_catalog.now()),
    ('d3000000-0000-4000-8000-000000000502', v_company_id,
      'DEMO-B', 'DEMO-B', 'CUTAWAY', 'SPARE', 2023, 'Demo', 'Cargo Cutaway',
      'DEMO0000000000002', 'DEMO-B', 'DE', 'Insight Demonstration Terminal',
      'Route Bravo', 'd3000000-0000-4000-8000-000000000202', 26780,
      pg_catalog.now(), 12300, 'Synthetic manufacturer record', 'OWNED',
      current_date - 420, 'Synthetic Insight Demo unit. Not a customer asset.',
      'MANUAL_ENTRY', 'insight-demo://vehicle/DEMO-B', 'VERIFIED', pg_catalog.now()),
    ('d3000000-0000-4000-8000-000000000503', v_company_id,
      'DEMO-C', 'DEMO-C', 'CARGO_VAN', 'MAINTENANCE', 2022, 'Demo', 'Cargo Van',
      'DEMO0000000000003', 'DEMO-C', 'DE', 'Insight Demonstration Terminal',
      'Route Cedar', 'd3000000-0000-4000-8000-000000000203', 41260,
      pg_catalog.now(), 8800, 'Synthetic manufacturer record', 'FINANCED',
      current_date - 560, 'Synthetic Insight Demo unit. Not a customer asset.',
      'MANUAL_ENTRY', 'insight-demo://vehicle/DEMO-C', 'VERIFIED', pg_catalog.now())
  on conflict (id) do update
  set unit_number = excluded.unit_number,
      fedex_vehicle_id = excluded.fedex_vehicle_id,
      vehicle_type = excluded.vehicle_type,
      status = excluded.status,
      year = excluded.year,
      make = excluded.make,
      model = excluded.model,
      vin = excluded.vin,
      plate_number = excluded.plate_number,
      plate_state = excluded.plate_state,
      terminal_name = excluded.terminal_name,
      primary_route = excluded.primary_route,
      primary_roster_member_id = excluded.primary_roster_member_id,
      odometer_miles = excluded.odometer_miles,
      odometer_recorded_at = excluded.odometer_recorded_at,
      gvwr_lbs = excluded.gvwr_lbs,
      fuel_type = excluded.fuel_type,
      ownership_type = excluded.ownership_type,
      in_service_date = excluded.in_service_date,
      notes = excluded.notes,
      gvwr_source = excluded.gvwr_source,
      gvwr_evidence_reference = excluded.gvwr_evidence_reference,
      gvwr_verified_status = excluded.gvwr_verified_status,
      gvwr_verified_at = excluded.gvwr_verified_at,
      updated_at = pg_catalog.now();

  insert into fleet.defect (
    id, company_id, vehicle_id, reported_by_roster_member_id, category,
    summary, description, vehicle_location, severity, status,
    safe_to_operate_driver, reported_at
  ) values (
    'd3000000-0000-4000-8000-000000000701', v_company_id,
    'd3000000-0000-4000-8000-000000000503',
    'd3000000-0000-4000-8000-000000000203', 'LIGHTING',
    'Rear marker lamp intermittent',
    'Synthetic demo issue for fleet triage and work-order review.',
    'Insight Demonstration Terminal', 'REPAIR_SOON', 'WORK_ORDERED', false,
    pg_catalog.now() - interval '2 days'
  )
  on conflict (id) do update
  set vehicle_id = excluded.vehicle_id,
      reported_by_roster_member_id = excluded.reported_by_roster_member_id,
      category = excluded.category,
      summary = excluded.summary,
      description = excluded.description,
      vehicle_location = excluded.vehicle_location,
      severity = excluded.severity,
      status = excluded.status,
      safe_to_operate_driver = excluded.safe_to_operate_driver,
      updated_at = pg_catalog.now();

  insert into fleet.work_order (
    id, company_id, vehicle_id, source, status, priority, title,
    scope_of_work, opened_at, scheduled_for, odometer_open
  ) values (
    'd3000000-0000-4000-8000-000000000702', v_company_id,
    'd3000000-0000-4000-8000-000000000503', 'INSPECTION', 'IN_PROGRESS',
    'DUE_SOON', 'Inspect rear lighting circuit',
    'Diagnose the synthetic marker-lamp fault and document resolution.',
    pg_catalog.now() - interval '2 days', pg_catalog.now() + interval '1 day', 41260
  )
  on conflict (id) do update
  set vehicle_id = excluded.vehicle_id,
      source = excluded.source,
      status = excluded.status,
      priority = excluded.priority,
      title = excluded.title,
      scope_of_work = excluded.scope_of_work,
      scheduled_for = excluded.scheduled_for,
      odometer_open = excluded.odometer_open,
      updated_at = pg_catalog.now();

  insert into fleet.work_order_defect (work_order_id, defect_id, company_id)
  values (
    'd3000000-0000-4000-8000-000000000702',
    'd3000000-0000-4000-8000-000000000701',
    v_company_id
  )
  on conflict (work_order_id, defect_id) do nothing;

  insert into core.company_message (
    id, company_id, title, body, status, visibility, requires_ack,
    published_at
  ) values
    ('d3000000-0000-4000-8000-000000000601', v_company_id,
      'Welcome to Insight Demo',
      'This workspace contains synthetic people, routes, vehicles, and operating facts created only for product review.',
      'published', 'all', false, pg_catalog.now() - interval '3 days'),
    ('d3000000-0000-4000-8000-000000000602', v_company_id,
      'Morning operating note',
      'Review the schedule, service posture, and fleet exception before the demonstration shift begins.',
      'published', 'drivers', true, pg_catalog.now() - interval '1 day'),
    ('d3000000-0000-4000-8000-000000000603', v_company_id,
      'Inspection reminder',
      'Use Inspect to select a demo unit and complete a pre-trip or post-trip workflow.',
      'published', 'all', false, pg_catalog.now() - interval '4 hours')
  on conflict (id) do update
  set title = excluded.title,
      body = excluded.body,
      status = excluded.status,
      visibility = excluded.visibility,
      requires_ack = excluded.requires_ack,
      published_at = excluded.published_at,
      archived_at = null,
      updated_at = pg_catalog.now();

  delete from core.operations_report_batch batch
  where batch.company_id = v_company_id
    and batch.source_filename like 'insight-demo://%';

  for v_service_date in
    select series.day_value::date
    from pg_catalog.generate_series(
      current_date - 30,
      current_date,
      interval '1 day'
    ) as series(day_value)
    where pg_catalog.date_part('isodow', series.day_value)::integer <> 7
    order by series.day_value
  loop
    insert into core.operations_report_batch (
      company_id, report_family_key, report_shape_key, service_date,
      snapshot_kind, source_filename, source_hash, detected_sheet_name,
      detected_header_row, detected_headers, row_count, route_row_count,
      participant_row_count, skipped_row_count, status, metadata_json,
      created_at, updated_at
    ) values (
      v_company_id,
      'DSW',
      case when v_service_date = current_date
        then 'DSW_DAILY_SERVICE_WORKSHEET'
        else 'DSW_FINALIZED_DAY'
      end,
      v_service_date,
      case when v_service_date = current_date then 'IN_DAY' else 'FINAL' end,
      'insight-demo://dsw/' || pg_catalog.to_char(v_service_date, 'YYYY-MM-DD') || '.json',
      pg_catalog.md5('insight-demo:' || v_service_date::text),
      'Synthetic DSW',
      1,
      array['Route', 'Driver', 'Vehicle', 'Stops', 'Packages'],
      4, 4, 0, 0, 'LOADED',
      pg_catalog.jsonb_build_object(
        'data_policy', 'SYNTHETIC_ONLY',
        'generated_at_text', pg_catalog.to_char(pg_catalog.now(), 'YYYY-MM-DD HH24:MI'),
        'terminal_identity', 'Insight Demonstration Terminal',
        'contract_filter', 'Insight Demo',
        'source', 'INSIGHT_DEMO_REFRESH'
      ),
      v_service_date::timestamp + interval '20 hours',
      pg_catalog.now()
    )
    returning id into v_batch_id;

    for v_route in
      select * from (values
        (1, 'd3000000-0000-4000-8000-000000000101'::uuid, 'Route Alpha', 'DEMO-A', 'Avery Lane', 'd3000000-0000-4000-8000-000000000201'::uuid),
        (2, 'd3000000-0000-4000-8000-000000000102'::uuid, 'Route Bravo', 'DEMO-B', 'Jordan Reed', 'd3000000-0000-4000-8000-000000000202'::uuid),
        (3, 'd3000000-0000-4000-8000-000000000103'::uuid, 'Route Cedar', 'DEMO-C', 'Morgan Shaw', 'd3000000-0000-4000-8000-000000000203'::uuid),
        (4, 'd3000000-0000-4000-8000-000000000104'::uuid, 'Route Delta', 'DEMO-D', 'Taylor Quinn', 'd3000000-0000-4000-8000-000000000204'::uuid)
      ) as route(
        route_index, route_id, route_name, unit_number, driver_name,
        roster_member_id
      )
    loop
      v_planned_stops := 58 + v_route.route_index * 4
        + pg_catalog.mod(pg_catalog.date_part('day', v_service_date)::integer, 5);
      v_actual_stops := greatest(
        0,
        v_planned_stops - pg_catalog.mod(v_route.route_index + pg_catalog.date_part('day', v_service_date)::integer, 3)
      );
      v_planned_packages := v_planned_stops * 2 + 18 + v_route.route_index * 3;
      v_actual_packages := greatest(
        0,
        v_planned_packages - (v_planned_stops - v_actual_stops) * 2
      );

      insert into core.operations_report_raw_row (
        batch_id, company_id, sheet_name, source_row_index, row_kind,
        raw_row_json, normalized_row_json, source_route_key,
        source_wa_number, source_driver_name, matched_roster_member_id,
        match_method, match_confidence
      ) values (
        v_batch_id,
        v_company_id,
        'Synthetic DSW',
        v_route.route_index,
        'ROUTE',
        pg_catalog.jsonb_build_object('synthetic', true),
        pg_catalog.jsonb_build_object(
          'route_baseline_id', v_route.route_id,
          'wa_name', v_route.route_name,
          'wa_number', v_route.unit_number,
          'driver_name', v_route.driver_name,
          'vehicle_text', v_route.unit_number,
          'vscan_packages', v_planned_packages,
          'planned_delivery_stops', v_planned_stops,
          'planned_delivery_packages', v_planned_packages,
          'planned_pickup_stops', 4 + v_route.route_index,
          'planned_pickup_packages', 7 + v_route.route_index,
          'actual_delivery_stops', v_actual_stops,
          'actual_delivery_packages', v_actual_packages,
          'actual_pickup_stops', 4 + v_route.route_index,
          'actual_pickup_packages', 7 + v_route.route_index,
          'diff', v_actual_stops - v_planned_stops,
          'exceptions', v_planned_stops - v_actual_stops,
          'code_85', 0,
          'dna', 0,
          'send_again', v_planned_stops - v_actual_stops,
          'miles', 42 + v_route.route_index * 6,
          'on_road_hours', 7.1 + v_route.route_index * 0.2,
          'on_duty_hours', 8.0 + v_route.route_index * 0.2,
          'ils_percent', pg_catalog.round((v_actual_stops::numeric / v_planned_stops::numeric) * 100, 1),
          'route_match_method', 'SYNTHETIC_BASELINE',
          'data_policy', 'SYNTHETIC_ONLY'
        ),
        'DEMO-' || v_route.route_name,
        v_route.unit_number,
        v_route.driver_name,
        v_route.roster_member_id,
        'SYNTHETIC_BASELINE',
        1
      );
    end loop;

    insert into core.operations_report_summary_row (
      batch_id, company_id, report_family_key, service_date,
      summary_scope, summary_label, contract_code, terminal_code,
      source_row_index, raw_row_json, normalized_row_json
    )
    select
      v_batch_id,
      v_company_id,
      'DSW',
      v_service_date,
      'CONTRACT',
      'Insight Demo',
      'DEMO',
      'DEMO',
      100,
      pg_catalog.jsonb_build_object('synthetic', true),
      pg_catalog.jsonb_build_object(
        'planned_delivery_stops', pg_catalog.sum((raw_row.normalized_row_json->>'planned_delivery_stops')::integer),
        'planned_delivery_packages', pg_catalog.sum((raw_row.normalized_row_json->>'planned_delivery_packages')::integer),
        'planned_pickup_stops', pg_catalog.sum((raw_row.normalized_row_json->>'planned_pickup_stops')::integer),
        'planned_pickup_packages', pg_catalog.sum((raw_row.normalized_row_json->>'planned_pickup_packages')::integer),
        'actual_delivery_stops', pg_catalog.sum((raw_row.normalized_row_json->>'actual_delivery_stops')::integer),
        'actual_delivery_packages', pg_catalog.sum((raw_row.normalized_row_json->>'actual_delivery_packages')::integer),
        'actual_pickup_stops', pg_catalog.sum((raw_row.normalized_row_json->>'actual_pickup_stops')::integer),
        'actual_pickup_packages', pg_catalog.sum((raw_row.normalized_row_json->>'actual_pickup_packages')::integer),
        'ils_percent', pg_catalog.round(
          pg_catalog.sum((raw_row.normalized_row_json->>'actual_delivery_stops')::numeric)
          / nullif(pg_catalog.sum((raw_row.normalized_row_json->>'planned_delivery_stops')::numeric), 0)
          * 100,
          1
        ),
        'route_count', 4,
        'data_policy', 'SYNTHETIC_ONLY'
      )
    from core.operations_report_raw_row raw_row
    where raw_row.batch_id = v_batch_id
      and raw_row.row_kind = 'ROUTE';
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'company_id', v_company_id,
    'company_slug', 'insight-demo',
    'data_policy', 'SYNTHETIC_ONLY',
    'active_drivers', 4,
    'trainees', 1,
    'routes', 4,
    'vehicles', 3,
    'history_days', 30,
    'reviewer_interactions_preserved', true
  );
end;
$$;

revoke all on function public.refresh_insight_demo_workspace()
  from public, anon, authenticated;
grant execute on function public.refresh_insight_demo_workspace()
  to service_role;

comment on function public.refresh_insight_demo_workspace() is
  'Refreshes the permanent Insight Demo workspace with fully synthetic rolling schedule, service, fleet, route, roster, and message facts. Reviewer-created interactions are preserved. Service role only.';

select public.refresh_insight_demo_workspace();

commit;
