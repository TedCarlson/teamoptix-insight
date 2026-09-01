-- Additive runner fleet identity, assignment, and acknowledged control plane.
-- This migration intentionally creates no runner or assignment rows and starts no work.

create table if not exists core.operations_runner (
  id uuid primary key default gen_random_uuid(),
  runner_key text not null unique,
  display_name text not null,
  runner_role text not null,
  environment text not null,
  lifecycle_state text not null default 'PROVISIONING',
  credential_version bigint not null default 1,
  software_version text,
  capabilities_json jsonb not null default '{}'::jsonb,
  deployment_metadata_json jsonb not null default '{}'::jsonb,
  last_bootstrap_at timestamptz,
  last_heartbeat_at timestamptz,
  last_commit_at timestamptz,
  retired_at timestamptz,
  retirement_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_runner_key_ck
    check (runner_key = lower(btrim(runner_key)) and runner_key ~ '^r-[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint operations_runner_display_name_ck
    check (length(btrim(display_name)) between 3 and 160),
  constraint operations_runner_role_ck
    check (runner_role in ('DEDICATED', 'SUPPORT')),
  constraint operations_runner_environment_ck
    check (environment in ('prod', 'staging', 'dev')),
  constraint operations_runner_lifecycle_ck
    check (lifecycle_state in ('PROVISIONING', 'DISABLED', 'ACTIVE', 'DRAINING', 'RETIRED')),
  constraint operations_runner_credential_version_ck
    check (credential_version > 0),
  constraint operations_runner_retirement_ck
    check ((lifecycle_state = 'RETIRED') = (retired_at is not null))
);

create table if not exists core.operations_runner_alias (
  alias_key text primary key,
  runner_id uuid not null references core.operations_runner(id) on delete restrict,
  retired_at timestamptz not null,
  retirement_reason text not null,
  created_at timestamptz not null default now(),
  constraint operations_runner_alias_key_ck
    check (length(btrim(alias_key)) between 3 and 128),
  constraint operations_runner_alias_reason_ck
    check (length(btrim(retirement_reason)) between 3 and 500)
);

create index if not exists operations_runner_alias_runner_id_idx
  on core.operations_runner_alias(runner_id);

create table if not exists core.operations_runner_assignment (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references core.operations_runner(id) on delete restrict,
  company_id uuid not null references core.companies(id) on delete restrict,
  terminal_id uuid not null references public.company_terminal(terminal_id) on delete restrict,
  assignment_kind text not null,
  assignment_status text not null default 'PENDING',
  assignment_version bigint not null default 1,
  credential_version bigint not null,
  allowed_lanes text[] not null,
  service_date_start date,
  service_date_end date,
  assignment_reason text,
  effective_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_runner_assignment_kind_ck
    check (assignment_kind in ('DEDICATED', 'SUPPORT')),
  constraint operations_runner_assignment_status_ck
    check (assignment_status in ('PENDING', 'ACTIVE', 'DRAINING', 'COMPLETED', 'REVOKED', 'EXPIRED')),
  constraint operations_runner_assignment_version_ck
    check (assignment_version > 0 and credential_version > 0),
  constraint operations_runner_assignment_lanes_ck
    check (cardinality(allowed_lanes) > 0),
  constraint operations_runner_assignment_dates_ck
    check (service_date_end is null or service_date_start is null or service_date_end >= service_date_start),
  constraint operations_runner_assignment_support_expiry_ck
    check (assignment_kind <> 'SUPPORT' or expires_at is not null),
  constraint operations_runner_assignment_terminal_state_ck
    check (
      (assignment_status not in ('COMPLETED', 'REVOKED', 'EXPIRED'))
      or completed_at is not null
      or revoked_at is not null
    )
);

create unique index if not exists operations_runner_assignment_one_live_runner_idx
  on core.operations_runner_assignment(runner_id)
  where assignment_status in ('PENDING', 'ACTIVE', 'DRAINING');

create unique index if not exists operations_runner_assignment_one_dedicated_company_idx
  on core.operations_runner_assignment(company_id)
  where assignment_kind = 'DEDICATED'
    and assignment_status in ('PENDING', 'ACTIVE', 'DRAINING');

create index if not exists operations_runner_assignment_company_status_idx
  on core.operations_runner_assignment(company_id, assignment_status, updated_at desc);

create index if not exists operations_runner_assignment_runner_id_idx
  on core.operations_runner_assignment(runner_id);

create index if not exists operations_runner_assignment_terminal_id_idx
  on core.operations_runner_assignment(terminal_id);

create index if not exists operations_runner_assignment_created_by_idx
  on core.operations_runner_assignment(created_by_profile_id)
  where created_by_profile_id is not null;

create table if not exists core.operations_runner_command (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  runner_id uuid not null references core.operations_runner(id) on delete restrict,
  assignment_id uuid not null references core.operations_runner_assignment(id) on delete restrict,
  company_id uuid not null references core.companies(id) on delete restrict,
  terminal_id uuid not null references public.company_terminal(terminal_id) on delete restrict,
  command_type text not null,
  command_state text not null default 'REQUESTED',
  expected_assignment_version bigint not null,
  expected_config_version bigint not null,
  requested_by_profile_id uuid not null references core.profiles(id) on delete restrict,
  reason text,
  expires_at timestamptz not null,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  supervisor_version text,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_runner_command_type_ck
    check (command_type in ('PAUSE', 'DRAIN_STOP', 'EMERGENCY_STOP', 'RESUME')),
  constraint operations_runner_command_state_ck
    check (command_state in ('REQUESTED', 'DELIVERED', 'ACKNOWLEDGED', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED')),
  constraint operations_runner_command_versions_ck
    check (expected_assignment_version > 0 and expected_config_version >= 0),
  constraint operations_runner_command_emergency_reason_ck
    check (command_type <> 'EMERGENCY_STOP' or length(btrim(coalesce(reason, ''))) >= 3)
);

create unique index if not exists operations_runner_command_one_open_idx
  on core.operations_runner_command(runner_id)
  where command_state in ('REQUESTED', 'DELIVERED', 'ACKNOWLEDGED');

create index if not exists operations_runner_command_company_created_idx
  on core.operations_runner_command(company_id, created_at desc);

create index if not exists operations_runner_command_delivery_idx
  on core.operations_runner_command(runner_id, assignment_id, command_state, created_at)
  where command_state = 'REQUESTED';

create index if not exists operations_runner_command_assignment_id_idx
  on core.operations_runner_command(assignment_id);

create index if not exists operations_runner_command_terminal_id_idx
  on core.operations_runner_command(terminal_id);

create index if not exists operations_runner_command_requested_by_idx
  on core.operations_runner_command(requested_by_profile_id);

drop trigger if exists operations_runner_touch_updated_at on core.operations_runner;
create trigger operations_runner_touch_updated_at
before update on core.operations_runner
for each row execute function core.set_updated_at();

drop trigger if exists operations_runner_assignment_touch_updated_at on core.operations_runner_assignment;
create trigger operations_runner_assignment_touch_updated_at
before update on core.operations_runner_assignment
for each row execute function core.set_updated_at();

drop trigger if exists operations_runner_command_touch_updated_at on core.operations_runner_command;
create trigger operations_runner_command_touch_updated_at
before update on core.operations_runner_command
for each row execute function core.set_updated_at();

alter table core.operations_runner_schedule
  add column if not exists assignment_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'core.operations_runner_schedule'::regclass
      and conname = 'operations_runner_schedule_assignment_id_fkey'
  ) then
    alter table core.operations_runner_schedule
      add constraint operations_runner_schedule_assignment_id_fkey
      foreign key (assignment_id)
      references core.operations_runner_assignment(id)
      on delete restrict;
  end if;
end;
$$;

create unique index if not exists operations_runner_schedule_assignment_id_idx
  on core.operations_runner_schedule(assignment_id)
  where assignment_id is not null;

alter table core.operations_runner enable row level security;
alter table core.operations_runner_alias enable row level security;
alter table core.operations_runner_assignment enable row level security;
alter table core.operations_runner_command enable row level security;

drop policy if exists operations_runner_platform_owner_select on core.operations_runner;
create policy operations_runner_platform_owner_select
on core.operations_runner for select to authenticated
using (core.is_platform_owner());

drop policy if exists operations_runner_alias_platform_owner_select on core.operations_runner_alias;
create policy operations_runner_alias_platform_owner_select
on core.operations_runner_alias for select to authenticated
using (core.is_platform_owner());

drop policy if exists operations_runner_assignment_platform_owner_select on core.operations_runner_assignment;
create policy operations_runner_assignment_platform_owner_select
on core.operations_runner_assignment for select to authenticated
using (core.is_platform_owner());

drop policy if exists operations_runner_command_platform_owner_select on core.operations_runner_command;
create policy operations_runner_command_platform_owner_select
on core.operations_runner_command for select to authenticated
using (core.is_platform_owner());

drop policy if exists operations_runner_command_platform_owner_insert on core.operations_runner_command;
create policy operations_runner_command_platform_owner_insert
on core.operations_runner_command for insert to authenticated
with check (
  core.is_platform_owner()
  and requested_by_profile_id = core.current_profile_id()
);

drop policy if exists operations_runner_command_platform_owner_update on core.operations_runner_command;
create policy operations_runner_command_platform_owner_update
on core.operations_runner_command for update to authenticated
using (core.is_platform_owner())
with check (core.is_platform_owner());

revoke all on core.operations_runner from public, anon, authenticated;
revoke all on core.operations_runner_alias from public, anon, authenticated;
revoke all on core.operations_runner_assignment from public, anon, authenticated;
revoke all on core.operations_runner_command from public, anon, authenticated;
grant select on core.operations_runner to authenticated;
grant select on core.operations_runner_alias to authenticated;
grant select on core.operations_runner_assignment to authenticated;
grant select, insert, update on core.operations_runner_command to authenticated;

create or replace view public.operations_runner_fleet_v
with (security_invoker = true)
as
select
  runner.id as runner_id,
  runner.runner_key,
  runner.display_name,
  runner.runner_role,
  runner.environment,
  runner.lifecycle_state,
  runner.software_version,
  runner.last_bootstrap_at,
  runner.last_heartbeat_at,
  runner.last_commit_at,
  assignment.id as assignment_id,
  assignment.assignment_kind,
  assignment.assignment_status,
  assignment.assignment_version,
  assignment.credential_version,
  assignment.allowed_lanes,
  assignment.service_date_start,
  assignment.service_date_end,
  assignment.effective_at,
  assignment.expires_at as assignment_expires_at,
  company.id as company_id,
  company.company_slug,
  company.company_name,
  terminal.terminal_id,
  terminal.terminal_code,
  terminal.terminal_name,
  schedule.collection_enabled,
  schedule.config_version,
  schedule.applied_version,
  schedule.runner_state,
  schedule.runner_last_seen_at,
  schedule.runner_last_error,
  command.id as latest_command_id,
  command.command_type as latest_command_type,
  command.command_state as latest_command_state,
  command.created_at as latest_command_requested_at,
  command.acknowledged_at as latest_command_acknowledged_at,
  command.completed_at as latest_command_completed_at
from core.operations_runner runner
left join core.operations_runner_assignment assignment
  on assignment.runner_id = runner.id
 and assignment.assignment_status in ('PENDING', 'ACTIVE', 'DRAINING')
left join core.companies company on company.id = assignment.company_id
left join public.company_terminal terminal on terminal.terminal_id = assignment.terminal_id
left join core.operations_runner_schedule schedule on schedule.assignment_id = assignment.id
left join lateral (
  select candidate.*
  from core.operations_runner_command candidate
  where candidate.runner_id = runner.id
  order by candidate.created_at desc
  limit 1
) command on true;

create or replace view public.operations_runner_command_v
with (security_invoker = true)
as
select
  command.id,
  command.idempotency_key,
  command.runner_id,
  runner.runner_key,
  runner.display_name as runner_display_name,
  command.assignment_id,
  command.company_id,
  company.company_slug,
  company.company_name,
  command.terminal_id,
  terminal.terminal_code,
  terminal.terminal_name,
  command.command_type,
  command.command_state,
  command.expected_assignment_version,
  command.expected_config_version,
  command.requested_by_profile_id,
  btrim(profile.first_name || ' ' || profile.last_name) as requested_by_name,
  command.reason,
  command.expires_at,
  command.delivered_at,
  command.acknowledged_at,
  command.completed_at,
  command.failed_at,
  command.supervisor_version,
  command.result_json,
  command.created_at,
  command.updated_at
from core.operations_runner_command command
join core.operations_runner runner on runner.id = command.runner_id
join core.operations_runner_assignment assignment on assignment.id = command.assignment_id
join core.companies company on company.id = command.company_id
join public.company_terminal terminal on terminal.terminal_id = command.terminal_id
join core.profiles profile on profile.id = command.requested_by_profile_id
where assignment.runner_id = command.runner_id
  and assignment.company_id = command.company_id
  and assignment.terminal_id = command.terminal_id;

revoke all on public.operations_runner_fleet_v from public, anon;
revoke all on public.operations_runner_command_v from public, anon;
grant select on public.operations_runner_fleet_v to authenticated, service_role;
grant select on public.operations_runner_command_v to authenticated, service_role;

create or replace function public.request_operations_runner_command(
  p_company_slug text,
  p_runner_id uuid,
  p_assignment_id uuid,
  p_command_type text,
  p_expected_assignment_version bigint,
  p_expected_config_version bigint,
  p_reason text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assignment core.operations_runner_assignment%rowtype;
  v_profile_id uuid;
  v_command_type text := upper(btrim(coalesce(p_command_type, '')));
  v_current_config_version bigint;
  v_command_id uuid;
begin
  if not core.is_platform_owner() then
    raise exception 'Only Team Optix platform owners can control runners.'
      using errcode = '42501';
  end if;

  v_profile_id := core.current_profile_id();
  if v_profile_id is null then
    raise exception 'A current platform profile is required.'
      using errcode = '42501';
  end if;

  if v_command_type not in ('PAUSE', 'DRAIN_STOP', 'EMERGENCY_STOP', 'RESUME') then
    raise exception 'Unsupported runner command.' using errcode = '22023';
  end if;

  select assignment.*
  into v_assignment
  from core.operations_runner_assignment assignment
  join core.operations_runner runner on runner.id = assignment.runner_id
  join core.companies company on company.id = assignment.company_id
  where assignment.id = p_assignment_id
    and assignment.runner_id = p_runner_id
    and company.company_slug = btrim(p_company_slug)
    and assignment.assignment_status in ('ACTIVE', 'DRAINING')
    and (assignment.expires_at is null or assignment.expires_at > now())
    and runner.lifecycle_state <> 'RETIRED';

  if not found then
    raise exception 'The runner assignment is not active for this company.'
      using errcode = '23503';
  end if;

  if v_assignment.assignment_version <> p_expected_assignment_version then
    raise exception 'The runner assignment changed. Refresh before issuing a command.'
      using errcode = '40001';
  end if;

  select schedule.config_version
  into v_current_config_version
  from core.operations_runner_schedule schedule
  where schedule.assignment_id = v_assignment.id;

  if coalesce(v_current_config_version, 0) <> p_expected_config_version then
    raise exception 'The runner configuration changed. Refresh before issuing a command.'
      using errcode = '40001';
  end if;

  if v_command_type = 'EMERGENCY_STOP'
     and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Emergency stop requires a reason.' using errcode = '22023';
  end if;

  select command.id
  into v_command_id
  from core.operations_runner_command command
  where command.idempotency_key = p_idempotency_key
    and command.runner_id = p_runner_id
    and command.assignment_id = p_assignment_id
    and command.company_id = v_assignment.company_id
    and command.terminal_id = v_assignment.terminal_id
    and command.command_type = v_command_type
    and command.expected_assignment_version = p_expected_assignment_version
    and command.expected_config_version = p_expected_config_version;

  if found then
    return v_command_id;
  elsif exists (
    select 1
    from core.operations_runner_command command
    where command.idempotency_key = p_idempotency_key
  ) then
    raise exception 'The command idempotency key is already bound to different work.'
      using errcode = '23505';
  end if;

  if v_command_type = 'EMERGENCY_STOP' then
    update core.operations_runner_command
    set command_state = 'CANCELLED',
        completed_at = now(),
        result_json = jsonb_build_object('superseded_by', 'EMERGENCY_STOP')
    where runner_id = p_runner_id
      and command_state in ('REQUESTED', 'DELIVERED', 'ACKNOWLEDGED');
  elsif exists (
    select 1
    from core.operations_runner_command command
    where command.runner_id = p_runner_id
      and command.command_state in ('REQUESTED', 'DELIVERED', 'ACKNOWLEDGED')
  ) then
    raise exception 'This runner already has an unacknowledged control command.'
      using errcode = '55000';
  end if;

  insert into core.operations_runner_command (
    idempotency_key,
    runner_id,
    assignment_id,
    company_id,
    terminal_id,
    command_type,
    expected_assignment_version,
    expected_config_version,
    requested_by_profile_id,
    reason,
    expires_at
  ) values (
    p_idempotency_key,
    p_runner_id,
    p_assignment_id,
    v_assignment.company_id,
    v_assignment.terminal_id,
    v_command_type,
    p_expected_assignment_version,
    p_expected_config_version,
    v_profile_id,
    nullif(btrim(coalesce(p_reason, '')), ''),
    now() + interval '10 minutes'
  )
  returning id into v_command_id;

  return v_command_id;
end;
$$;

revoke all on function public.request_operations_runner_command(
  text, uuid, uuid, text, bigint, bigint, text, uuid
) from public, anon;
grant execute on function public.request_operations_runner_command(
  text, uuid, uuid, text, bigint, bigint, text, uuid
) to authenticated;

create or replace function public.claim_operations_runner_command(
  p_runner_key text,
  p_runner_id uuid,
  p_assignment_id uuid,
  p_supervisor_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command core.operations_runner_command%rowtype;
begin
  if not exists (
    select 1
    from core.operations_runner runner
    join core.operations_runner_assignment assignment on assignment.runner_id = runner.id
    where runner.id = p_runner_id
      and runner.runner_key = btrim(p_runner_key)
      and runner.lifecycle_state <> 'RETIRED'
      and assignment.id = p_assignment_id
      and assignment.assignment_status in ('ACTIVE', 'DRAINING')
      and (assignment.expires_at is null or assignment.expires_at > now())
  ) then
    raise exception 'Runner identity or assignment is invalid.' using errcode = '42501';
  end if;

  update core.operations_runner_command
  set command_state = 'EXPIRED', completed_at = now()
  where runner_id = p_runner_id
    and assignment_id = p_assignment_id
    and command_state in ('REQUESTED', 'DELIVERED')
    and expires_at <= now();

  select command.*
  into v_command
  from core.operations_runner_command command
  where command.runner_id = p_runner_id
    and command.assignment_id = p_assignment_id
    and (
      command.command_state = 'REQUESTED'
      or (
        command.command_state = 'DELIVERED'
        and command.delivered_at <= now() - interval '15 seconds'
      )
    )
    and command.expires_at > now()
  order by
    case when command.command_type = 'EMERGENCY_STOP' then 0 else 1 end,
    command.created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update core.operations_runner_command
  set command_state = 'DELIVERED',
      delivered_at = now(),
      supervisor_version = nullif(btrim(coalesce(p_supervisor_version, '')), '')
  where id = v_command.id;

  return jsonb_build_object(
    'id', v_command.id,
    'idempotency_key', v_command.idempotency_key,
    'runner_id', v_command.runner_id,
    'assignment_id', v_command.assignment_id,
    'company_id', v_command.company_id,
    'terminal_id', v_command.terminal_id,
    'command_type', v_command.command_type,
    'expected_assignment_version', v_command.expected_assignment_version,
    'expected_config_version', v_command.expected_config_version,
    'reason', v_command.reason,
    'expires_at', v_command.expires_at
  );
end;
$$;

revoke all on function public.claim_operations_runner_command(text, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.claim_operations_runner_command(text, uuid, uuid, text)
to service_role;

create or replace function public.ack_operations_runner_command(
  p_runner_key text,
  p_runner_id uuid,
  p_assignment_id uuid,
  p_command_id uuid,
  p_command_state text,
  p_result_json jsonb default '{}'::jsonb,
  p_supervisor_version text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text := upper(btrim(coalesce(p_command_state, '')));
  v_updated integer;
  v_command_type text;
begin
  if v_state not in ('ACKNOWLEDGED', 'SUCCEEDED', 'FAILED') then
    raise exception 'Unsupported command acknowledgement state.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from core.operations_runner runner
    where runner.id = p_runner_id
      and runner.runner_key = btrim(p_runner_key)
      and runner.lifecycle_state <> 'RETIRED'
  ) then
    raise exception 'Runner identity is invalid.' using errcode = '42501';
  end if;

  select command.command_type
  into v_command_type
  from core.operations_runner_command command
  where command.id = p_command_id
    and command.runner_id = p_runner_id
    and command.assignment_id = p_assignment_id;

  if not found then
    raise exception 'Runner command identity is invalid.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from core.operations_runner_command command
    where command.id = p_command_id
      and command.runner_id = p_runner_id
      and command.assignment_id = p_assignment_id
      and command.command_state = v_state
  ) then
    return true;
  end if;

  update core.operations_runner_command command
  set command_state = v_state,
      acknowledged_at = coalesce(command.acknowledged_at, now()),
      completed_at = case when v_state = 'SUCCEEDED' then now() else command.completed_at end,
      failed_at = case when v_state = 'FAILED' then now() else command.failed_at end,
      supervisor_version = coalesce(nullif(btrim(coalesce(p_supervisor_version, '')), ''), command.supervisor_version),
      result_json = coalesce(p_result_json, '{}'::jsonb)
  where command.id = p_command_id
    and command.runner_id = p_runner_id
    and command.assignment_id = p_assignment_id
    and command.command_state in ('DELIVERED', 'ACKNOWLEDGED');

  get diagnostics v_updated = row_count;

  if v_updated = 1 and v_state = 'SUCCEEDED' then
    update core.operations_runner
    set lifecycle_state = case
          when v_command_type = 'RESUME' then 'ACTIVE'
          else 'DISABLED'
        end,
        last_heartbeat_at = now()
    where id = p_runner_id;

    update core.operations_runner_schedule
    set collection_enabled = (v_command_type = 'RESUME'),
        runner_state = case
          when v_command_type = 'RESUME' then 'IDLE'
          else 'DISABLED'
        end,
        runner_last_seen_at = now(),
        runner_last_error = null,
        updated_at = now()
    where assignment_id = p_assignment_id;
  end if;

  return v_updated = 1;
end;
$$;

revoke all on function public.ack_operations_runner_command(
  text, uuid, uuid, uuid, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.ack_operations_runner_command(
  text, uuid, uuid, uuid, text, jsonb, text
) to service_role;

create or replace function public.get_operations_runner_bootstrap(
  p_runner_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runner core.operations_runner%rowtype;
  v_assignment core.operations_runner_assignment%rowtype;
  v_schedule core.operations_runner_schedule%rowtype;
  v_company_slug text;
  v_profile_id uuid;
  v_credential_version bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select runner.*
  into v_runner
  from core.operations_runner runner
  where runner.runner_key = btrim(p_runner_key)
    and runner.lifecycle_state <> 'RETIRED';

  if not found then
    return null;
  end if;

  select assignment.*
  into v_assignment
  from core.operations_runner_assignment assignment
  where assignment.runner_id = v_runner.id
    and assignment.assignment_status in ('ACTIVE', 'DRAINING')
    and (assignment.expires_at is null or assignment.expires_at > now())
  order by assignment.effective_at desc nulls last, assignment.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select schedule.*
  into v_schedule
  from core.operations_runner_schedule schedule
  where schedule.assignment_id = v_assignment.id
    and schedule.runner_key = v_runner.runner_key
    and schedule.company_id = v_assignment.company_id;

  if not found then
    return null;
  end if;

  select company.company_slug
  into v_company_slug
  from core.companies company
  where company.id = v_assignment.company_id;

  select profile.id, credential.credential_version
  into v_profile_id, v_credential_version
  from core.automation_profile profile
  left join core.automation_credential credential
    on credential.profile_id = profile.id
  where profile.company_id = v_assignment.company_id
    and profile.provider_key = 'FEDEX'
  order by profile.created_at
  limit 1;

  update core.operations_runner
  set last_bootstrap_at = now(),
      last_heartbeat_at = now()
  where id = v_runner.id;

  return jsonb_build_object(
    'schema_version', 5,
    'runner_key', v_runner.runner_key,
    'runner_id', v_runner.id,
    'assignment_id', v_assignment.id,
    'assignment_version', v_assignment.assignment_version,
    'terminal_id', v_assignment.terminal_id,
    'allowed_lanes', to_jsonb(v_assignment.allowed_lanes),
    'company_id', v_assignment.company_id,
    'company_slug', v_company_slug,
    'timezone', v_schedule.timezone,
    'collection_enabled', v_schedule.collection_enabled,
    'config_version', v_schedule.config_version,
    'previous_day_close', jsonb_build_object(
      'enabled', v_schedule.previous_day_close_enabled,
      'start_time', to_char(v_schedule.previous_day_close_time, 'HH24:MI'),
      'reports', coalesce(
        v_schedule.report_config_json -> 'previous_day_close',
        '["DSW"]'::jsonb
      )
    ),
    'dro_am', coalesce(
      v_schedule.report_config_json -> 'dro_am',
      jsonb_build_object(
        'enabled', false,
        'start_time', '04:00',
        'reports', jsonb_build_array('DRO')
      )
    ),
    'operations_pulse', jsonb_build_object(
      'enabled', v_schedule.operations_pulse_enabled,
      'start_time', to_char(v_schedule.operations_pulse_start_time, 'HH24:MI'),
      'end_time', to_char(v_schedule.operations_pulse_end_time, 'HH24:MI'),
      'trigger', 'PREVIOUS_SUCCESS',
      'operating_weekdays', coalesce(
        v_schedule.report_config_json -> 'operating_weekdays',
        '[1,2,3,4,5,6]'::jsonb
      ),
      'operating_date_overrides', coalesce(
        v_schedule.report_config_json -> 'operating_date_overrides',
        '{}'::jsonb
      ),
      'reports', coalesce(
        v_schedule.report_config_json -> 'operations_pulse',
        '[]'::jsonb
      )
    ),
    'route_closeout', coalesce(
      v_schedule.report_config_json -> 'route_closeout',
      jsonb_build_object(
        'enabled', false,
        'start_time', '19:30',
        'end_time', '23:50',
        'final_sweep_start_time', '23:30',
        'target_poll_interval_minutes', 15,
        'fcc_interval_minutes', 15,
        'dsw_interval_minutes', 30,
        'route_batch_size', 3,
        'previous_day_recovery_enabled', false,
        'previous_day_recovery_max_batches', 2,
        'retained_gpx_recovery_enabled', false,
        'retained_gpx_recovery_start_time', '03:10',
        'retained_gpx_recovery_max_batches', 2,
        'retained_gpx_recovery_interval_minutes', 120,
        'reports', jsonb_build_array(
          'FCC', 'DELIVERY_MANIFEST', 'PICKUP_MANIFEST', 'ROUTE_GPX'
        )
      )
    ),
    'targeted_recovery', v_schedule.recovery_config_json,
    'historical_sweep', v_schedule.historical_config_json,
    'credential', jsonb_build_object(
      'profile_id', v_profile_id,
      'provider_key', 'FEDEX',
      'version', coalesce(v_credential_version, 0)
    )
  );
end;
$$;

revoke all on function public.get_operations_runner_bootstrap(text)
from public, anon, authenticated;
grant execute on function public.get_operations_runner_bootstrap(text)
to service_role;

comment on table core.operations_runner is
  'Stable runner instances; company/worksite authority lives in operations_runner_assignment.';
comment on table core.operations_runner_alias is
  'Non-authenticating historical runner keys retained for lineage only.';
comment on table core.operations_runner_assignment is
  'Governed company/worksite job assigned to one runner.';
comment on table core.operations_runner_command is
  'Idempotent Team Optix runner commands with delivery and execution acknowledgement.';
comment on function public.get_operations_runner_bootstrap(text) is
  'Returns a schedule only when runner, assignment, company, terminal, and schedule identities agree.';

notify pgrst, 'reload schema';
