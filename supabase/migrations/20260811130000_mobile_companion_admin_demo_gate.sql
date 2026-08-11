begin;

-- Admin demo mode is a separate evidence plane. It lets an authorized company
-- administrator exercise the native driver experience without impersonating an
-- auth user or writing demo actions into operational driver, fleet, or message
-- acknowledgment truth.
create table core.mobile_companion_demo_event (
  id uuid primary key,
  company_id uuid not null references core.companies(id) on delete cascade,
  actor_profile_id uuid not null references core.profiles(id) on delete restrict,
  selected_roster_member_id uuid not null references core.company_roster(id) on delete restrict,
  event_type text not null,
  payload jsonb not null,
  payload_digest text not null,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mobile_companion_demo_event_type_ck check (
    event_type in (
      'DUTY_SESSION',
      'BREADCRUMB_BATCH',
      'MESSAGE_ACKNOWLEDGMENT',
      'INSPECTION_SUBMISSION'
    )
  ),
  constraint mobile_companion_demo_event_payload_ck check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint mobile_companion_demo_event_digest_ck check (
    payload_digest ~ '^[0-9a-f]{64}$'
  )
);

comment on table core.mobile_companion_demo_event is
  'Audited admin-generated Mobile Companion demo events. These records are isolated from operational duty, breadcrumb, inspection, vehicle, payroll, delivery, and employee-acknowledgment truth.';

create index mobile_companion_demo_event_actor_idx
  on core.mobile_companion_demo_event(actor_profile_id, created_at desc);
create index mobile_companion_demo_event_roster_idx
  on core.mobile_companion_demo_event(company_id, selected_roster_member_id, created_at desc);

alter table core.mobile_companion_demo_event enable row level security;

create policy mobile_companion_demo_event_select_authorized
on core.mobile_companion_demo_event
for select to authenticated
using (
  actor_profile_id = core.current_profile_id()
  or core.can_admin_company(company_id)
);

grant select on core.mobile_companion_demo_event to authenticated;

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
        and nullif(btrim(terminal.timezone), '') is not null
    )
  ),
  admin_company as (
    select distinct company.id, company.company_name, company.company_slug
    from active_profile profile
    join core.companies company
      on company.company_status = 'active'
    where core.is_platform_owner()
       or exists (
         select 1
         from core.company_memberships membership
         where membership.company_id = company.id
           and membership.profile_id = profile.id
           and membership.membership_status = 'active'
           and membership.relationship_type = 'admin'
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
    from admin_company company
    join core.company_roster roster
      on roster.company_id = company.id
     and roster.employment_status in ('Active', 'Trainee')
     and roster.roster_record_kind = 'INTERNAL'
    where exists (
      select 1
      from public.company_terminal terminal
      where terminal.company_id = company.id
        and terminal.is_active = true
        and nullif(btrim(terminal.timezone), '') is not null
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

comment on function public.mobile_companion_access_gate() is
  'Returns the authenticated driver gate plus explicit admin demo gates. Admin demo selections remain separate from operational driver authority.';

revoke all on function public.mobile_companion_access_gate()
  from public, anon;
grant execute on function public.mobile_companion_access_gate()
  to authenticated, service_role;

create or replace function public.sync_mobile_companion_demo_event(
  p_company_slug text,
  p_roster_member_id uuid,
  p_event_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_actor_profile_id uuid;
  v_event_type text;
  v_effective_event_id uuid;
  v_digest text;
  v_existing core.mobile_companion_demo_event%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select profile.id into v_actor_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;

  if v_actor_profile_id is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED';
  end if;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null or not core.can_admin_company(v_company_id) then
    raise exception 'COMPANY_ADMIN_REQUIRED';
  end if;

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
      and roster.employment_status in ('Active', 'Trainee')
      and roster.roster_record_kind = 'INTERNAL'
  ) then
    raise exception 'ELIGIBLE_DEMO_DRIVER_REQUIRED';
  end if;

  v_event_type := upper(btrim(coalesce(p_event_type, '')));
  if v_event_type not in (
    'DUTY_SESSION',
    'BREADCRUMB_BATCH',
    'MESSAGE_ACKNOWLEDGMENT',
    'INSPECTION_SUBMISSION'
  ) then
    raise exception 'INVALID_DEMO_EVENT_TYPE';
  end if;

  if p_event_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_DEMO_EVENT';
  end if;

  -- Message ids are shared across every selected driver. Derive an actor- and
  -- driver-scoped UUID so acknowledging the same message through two demo gates
  -- remains independently idempotent.
  v_effective_event_id := case
    when v_event_type = 'MESSAGE_ACKNOWLEDGMENT' then (
      substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 1, 8)
      || '-' || substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 9, 4)
      || '-' || substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 13, 4)
      || '-' || substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 17, 4)
      || '-' || substr(md5(v_actor_profile_id::text || ':' || p_roster_member_id::text || ':' || p_event_id::text), 21, 12)
    )::uuid
    else p_event_id
  end;

  v_digest := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_effective_event_id::text, 0)
  );

  select event.* into v_existing
  from core.mobile_companion_demo_event event
  where event.id = v_effective_event_id;

  if found then
    if v_existing.company_id <> v_company_id
       or v_existing.actor_profile_id <> v_actor_profile_id
       or v_existing.selected_roster_member_id <> p_roster_member_id
       or v_existing.event_type <> v_event_type
       or v_existing.payload_digest <> v_digest then
      raise exception 'DEMO_EVENT_ID_CONFLICT';
    end if;

    update core.mobile_companion_demo_event
    set last_received_at = now()
    where id = v_effective_event_id
    returning * into v_existing;
  else
    insert into core.mobile_companion_demo_event (
      id,
      company_id,
      actor_profile_id,
      selected_roster_member_id,
      event_type,
      payload,
      payload_digest
    ) values (
      v_effective_event_id,
      v_company_id,
      v_actor_profile_id,
      p_roster_member_id,
      v_event_type,
      p_payload || jsonb_build_object(
        'demo_mode', true,
        'truth_status', 'ADMIN_DEMO_ONLY',
        'actor_profile_id', v_actor_profile_id,
        'selected_roster_member_id', p_roster_member_id
      ),
      v_digest
    )
    returning * into v_existing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_existing.id,
    'event_type', v_existing.event_type,
    'duplicate_event', v_existing.first_received_at <> v_existing.last_received_at,
    'server_received_at', v_existing.last_received_at
  );
end;
$$;

revoke all on function public.sync_mobile_companion_demo_event(
  text, uuid, uuid, text, jsonb
) from public, anon;
grant execute on function public.sync_mobile_companion_demo_event(
  text, uuid, uuid, text, jsonb
) to authenticated, service_role;

create or replace function public.mobile_companion_demo_messages(
  p_company_slug text,
  p_roster_member_id uuid
)
returns table (
  id uuid,
  title text,
  body text,
  requires_ack boolean,
  published_at timestamptz,
  acknowledged_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null or not core.can_admin_company(v_company_id) then
    raise exception 'COMPANY_ADMIN_REQUIRED';
  end if;

  if not exists (
    select 1 from core.company_roster roster
    where roster.id = p_roster_member_id
      and roster.company_id = v_company_id
      and roster.employment_status in ('Active', 'Trainee')
      and roster.roster_record_kind = 'INTERNAL'
  ) then
    raise exception 'ELIGIBLE_DEMO_DRIVER_REQUIRED';
  end if;

  return query
  select
    message.id,
    message.title,
    message.body,
    message.requires_ack,
    message.published_at,
    acknowledgment.acknowledged_at
  from core.company_message message
  left join lateral (
    select event.created_at as acknowledged_at
    from core.mobile_companion_demo_event event
    where event.company_id = v_company_id
      and event.selected_roster_member_id = p_roster_member_id
      and event.actor_profile_id = core.current_profile_id()
      and event.event_type = 'MESSAGE_ACKNOWLEDGMENT'
      and event.payload ->> 'message_id' = message.id::text
    order by event.created_at desc
    limit 1
  ) acknowledgment on true
  where message.company_id = v_company_id
    and message.status = 'published'
    and message.archived_at is null
    and message.visibility in ('all', 'drivers')
    and (
      message.visibility = 'all'
      or not exists (
        select 1 from core.company_message_recipient recipient
        where recipient.company_id = v_company_id
          and recipient.message_id = message.id
      )
      or exists (
        select 1 from core.company_message_recipient recipient
        where recipient.company_id = v_company_id
          and recipient.message_id = message.id
          and recipient.roster_member_id = p_roster_member_id
      )
    )
  order by message.published_at desc nulls last
  limit 50;
end;
$$;

revoke all on function public.mobile_companion_demo_messages(text, uuid)
  from public, anon;
grant execute on function public.mobile_companion_demo_messages(text, uuid)
  to authenticated, service_role;

commit;
