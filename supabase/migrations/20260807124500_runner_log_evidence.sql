begin;

-- Durable, sanitized failure evidence is intentionally independent of the
-- terminal collection receipt. Successful cycles use the receipt alone.
create table if not exists core.operations_runner_log_event (
  id uuid primary key default gen_random_uuid(),
  runner_key text not null
    references core.operations_runner_schedule(runner_key) on delete cascade,
  company_id uuid not null
    references core.companies(id) on delete cascade,
  cycle_id uuid not null,
  request_type text,
  service_date date,
  sequence integer not null,
  occurred_at timestamptz not null,
  level text not null default 'INFO',
  stream text not null default 'RUNNER',
  message text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint operations_runner_log_event_sequence_chk
    check (sequence >= 0),
  constraint operations_runner_log_event_level_chk
    check (level = any (array['INFO', 'WARN', 'ERROR'])),
  constraint operations_runner_log_event_stream_chk
    check (length(trim(stream)) between 1 and 64),
  constraint operations_runner_log_event_message_chk
    check (length(trim(message)) between 1 and 2000),
  constraint operations_runner_log_event_metadata_chk
    check (jsonb_typeof(metadata_json) = 'object'),
  constraint operations_runner_log_event_cycle_sequence_uniq
    unique (runner_key, cycle_id, sequence)
);

create index if not exists operations_runner_log_event_cycle_idx
  on core.operations_runner_log_event(cycle_id, sequence);

create index if not exists operations_runner_log_event_runner_recent_idx
  on core.operations_runner_log_event(runner_key, occurred_at desc);

create index if not exists operations_runner_log_event_created_idx
  on core.operations_runner_log_event(created_at desc);

alter table core.operations_runner_log_event enable row level security;

drop policy if exists operations_runner_log_event_platform_read
  on core.operations_runner_log_event;
create policy operations_runner_log_event_platform_read
  on core.operations_runner_log_event
  for select
  to authenticated
  using (core.is_platform_owner());

create or replace view public.operations_runner_log_event_v
with (security_invoker = true) as
select
  event.id,
  event.runner_key,
  event.company_id,
  company.company_slug,
  event.cycle_id,
  request.id as collection_request_id,
  coalesce(request.request_type, event.request_type) as request_type,
  coalesce(request.service_date, event.service_date) as service_date,
  request.request_status,
  event.sequence,
  event.occurred_at,
  event.level,
  event.stream,
  event.message,
  event.metadata_json,
  event.created_at
from core.operations_runner_log_event event
join core.companies company on company.id = event.company_id
left join core.operations_collection_request request
  on request.id = event.cycle_id
 and request.company_id = event.company_id;

grant select on core.operations_runner_log_event to authenticated;
grant all on core.operations_runner_log_event to service_role;
grant select on public.operations_runner_log_event_v to authenticated;
grant all on public.operations_runner_log_event_v to service_role;

create or replace function public.append_operations_runner_log_batch(
  p_runner_key text,
  p_cycle_id uuid,
  p_request_type text,
  p_service_date date,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_event_count integer;
  v_inserted_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if p_cycle_id is null then
    raise exception 'Cycle id is required.';
  end if;

  if jsonb_typeof(coalesce(p_events, 'null'::jsonb)) <> 'array' then
    raise exception 'Events must be a JSON array.';
  end if;

  v_event_count := jsonb_array_length(p_events);
  if v_event_count < 1 or v_event_count > 250 then
    raise exception 'Each log batch must contain between 1 and 250 events.';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(p_events) as event(value)
    where upper(trim(coalesce(event.value ->> 'level', ''))) = 'ERROR'
  ) then
    raise exception 'Runner log storage is reserved for failure evidence.';
  end if;

  select schedule.company_id
  into v_company_id
  from core.operations_runner_schedule schedule
  where schedule.runner_key = trim(p_runner_key);

  if v_company_id is null then
    raise exception 'Runner schedule not found.';
  end if;

  insert into core.operations_runner_log_event (
    runner_key,
    company_id,
    cycle_id,
    request_type,
    service_date,
    sequence,
    occurred_at,
    level,
    stream,
    message,
    metadata_json
  )
  select
    trim(p_runner_key),
    v_company_id,
    p_cycle_id,
    nullif(upper(trim(coalesce(p_request_type, ''))), ''),
    p_service_date,
    payload.sequence,
    payload.occurred_at,
    case upper(trim(coalesce(payload.level, 'INFO')))
      when 'ERROR' then 'ERROR'
      when 'WARN' then 'WARN'
      else 'INFO'
    end,
    left(coalesce(nullif(trim(payload.stream), ''), 'RUNNER'), 64),
    left(trim(payload.message), 2000),
    case
      when jsonb_typeof(coalesce(payload.metadata_json, '{}'::jsonb)) = 'object'
        then coalesce(payload.metadata_json, '{}'::jsonb)
      else '{}'::jsonb
    end
  from jsonb_to_recordset(p_events) as payload(
    sequence integer,
    occurred_at timestamptz,
    level text,
    stream text,
    message text,
    metadata_json jsonb
  )
  where payload.sequence is not null
    and payload.sequence >= 0
    and payload.occurred_at is not null
    and nullif(trim(coalesce(payload.message, '')), '') is not null
  on conflict (runner_key, cycle_id, sequence) do nothing;

  get diagnostics v_inserted_count = row_count;

  update core.operations_runner_schedule
  set
    runner_last_seen_at = greatest(
      coalesce(runner_last_seen_at, '-infinity'::timestamptz),
      now()
    ),
    updated_at = now()
  where runner_key = trim(p_runner_key);

  return jsonb_build_object(
    'accepted_count', v_event_count,
    'inserted_count', v_inserted_count,
    'cycle_id', p_cycle_id
  );
end;
$$;

revoke all on function public.append_operations_runner_log_batch(
  text, uuid, text, date, jsonb
) from public, anon, authenticated;
grant execute on function public.append_operations_runner_log_batch(
  text, uuid, text, date, jsonb
) to service_role;

comment on table core.operations_runner_log_event is
  'Bounded sanitized failure evidence retained independently of terminal receipts.';
comment on function public.append_operations_runner_log_batch(
  text, uuid, text, date, jsonb
) is
  'Idempotently appends a bounded failure audit and refreshes runner presence.';

commit;
