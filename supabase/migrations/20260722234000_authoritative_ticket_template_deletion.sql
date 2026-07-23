-- Make Automation Workbench deletion authoritative while preserving active work.
-- Future scheduling stops immediately. Queued work is cancelled. Claimed or
-- running work retains its payload snapshot and is allowed to reach a terminal
-- state before the template and all of its assignments are removed.

alter table core.operations_ticket_template
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_requested_by uuid;

create or replace view public.operations_ticket_template_v
with (security_invoker = true) as
select
  t.id,
  t.template_key,
  t.template_name,
  t.ticket_family,
  t.execution_lane,
  t.description,
  t.default_priority,
  t.default_collection_mode,
  t.default_manifest_types,
  t.default_skip_combined,
  t.default_payload_json,
  t.is_active,
  t.created_at,
  t.updated_at,
  t.deletion_requested_at,
  t.deletion_requested_by,
  (
    select count(*)::integer
    from core.company_operations_ticket_assignment assignment
    where assignment.template_id = t.id
  ) as assignment_count,
  (
    select count(*)::integer
    from core.operations_collection_request request
    where request.request_status in ('CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING')
      and (
        request.request_payload ->> 'ticket_template_id' = t.id::text
        or request.request_payload ->> 'ticket_library_assignment_id' in (
          select assignment.id::text
          from core.company_operations_ticket_assignment assignment
          where assignment.template_id = t.id
        )
      )
  ) as active_dependency_count
from core.operations_ticket_template t;

create or replace function core.finalize_operations_ticket_template_deletion(
  p_template_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_pending boolean;
begin
  select deletion_requested_at is not null
  into v_pending
  from core.operations_ticket_template
  where id = p_template_id
  for update;

  if not coalesce(v_pending, false) then
    return false;
  end if;

  if exists (
    select 1
    from core.operations_collection_request request
    where request.request_status in ('CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING')
      and (
        request.request_payload ->> 'ticket_template_id' = p_template_id::text
        or request.request_payload ->> 'ticket_library_assignment_id' in (
          select assignment.id::text
          from core.company_operations_ticket_assignment assignment
          where assignment.template_id = p_template_id
        )
      )
  ) then
    return false;
  end if;

  -- Assignments cascade here. Collection requests have no FK to either record;
  -- their immutable request_payload remains the historical execution contract.
  delete from core.operations_ticket_template
  where id = p_template_id;

  return found;
end;
$$;

create or replace function core.guard_pending_ticket_template_update()
returns trigger
language plpgsql
set search_path = public, core
as $$
begin
  if old.deletion_requested_at is not null
     and (to_jsonb(new) - array['updated_at', 'deletion_requested_at', 'deletion_requested_by'])
       is distinct from
       (to_jsonb(old) - array['updated_at', 'deletion_requested_at', 'deletion_requested_by']) then
    raise exception 'Ticket deletion is already pending and cannot be reversed by an update.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_pending_ticket_template_update_trg
  on core.operations_ticket_template;

create trigger guard_pending_ticket_template_update_trg
before update on core.operations_ticket_template
for each row
execute function core.guard_pending_ticket_template_update();

create or replace function public.request_operations_ticket_template_deletion(
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_template_name text;
  v_assignment_ids text[];
  v_assignment_count integer := 0;
  v_cancelled_count integer := 0;
  v_active_count integer := 0;
  v_deleted boolean := false;
begin
  if not core.is_platform_owner() then
    raise exception 'Only Team Optix platform owners can delete ticket templates.';
  end if;

  select template_name
  into v_template_name
  from core.operations_ticket_template
  where id = p_template_id
  for update;

  if v_template_name is null then
    raise exception 'Ticket template not found.';
  end if;

  select
    coalesce(array_agg(id::text), '{}'::text[]),
    count(*)::integer
  into v_assignment_ids, v_assignment_count
  from core.company_operations_ticket_assignment
  where template_id = p_template_id;

  update core.operations_ticket_template
  set is_active = false,
      deletion_requested_at = coalesce(deletion_requested_at, now()),
      deletion_requested_by = coalesce(deletion_requested_by, auth.uid()),
      updated_at = now()
  where id = p_template_id;

  update core.company_operations_ticket_assignment
  set assignment_status = 'paused',
      is_enabled = false,
      updated_at = now()
  where template_id = p_template_id;

  update core.operations_collection_request request
  set request_status = 'CANCELLED',
      error_message = coalesce(
        nullif(request.error_message, ''),
        'Governing Workbench ticket was deleted before runner claim.'
      ),
      completed_at = coalesce(request.completed_at, now()),
      updated_at = now()
  where request.request_status = 'QUEUED'
    and (
      request.request_payload ->> 'ticket_template_id' = p_template_id::text
      or request.request_payload ->> 'ticket_library_assignment_id' = any(v_assignment_ids)
    );
  get diagnostics v_cancelled_count = row_count;

  select count(*)::integer
  into v_active_count
  from core.operations_collection_request request
  where request.request_status in ('CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING')
    and (
      request.request_payload ->> 'ticket_template_id' = p_template_id::text
      or request.request_payload ->> 'ticket_library_assignment_id' = any(v_assignment_ids)
    );

  if v_active_count = 0 then
    v_deleted := core.finalize_operations_ticket_template_deletion(p_template_id);
    if not v_deleted then
      select not exists (
        select 1 from core.operations_ticket_template where id = p_template_id
      ) into v_deleted;
    end if;
  end if;

  return jsonb_build_object(
    'template_id', p_template_id,
    'template_name', v_template_name,
    'disposition', case when v_deleted then 'DELETED' else 'DELETION_PENDING' end,
    'assignments_overridden', v_assignment_count,
    'queued_requests_cancelled', v_cancelled_count,
    'active_dependencies', v_active_count
  );
end;
$$;

create or replace function public.delete_operations_ticket_template(
  p_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, core
as $$
begin
  perform public.request_operations_ticket_template_deletion(p_template_id);
end;
$$;

create or replace function core.finalize_pending_ticket_template_deletion_from_request()
returns trigger
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_template_id uuid;
begin
  if new.request_status not in ('COMPLETE', 'FAILED', 'CANCELLED')
     or old.request_status = new.request_status then
    return new;
  end if;

  begin
    v_template_id := nullif(new.request_payload ->> 'ticket_template_id', '')::uuid;
  exception when invalid_text_representation then
    v_template_id := null;
  end;

  if v_template_id is null then
    select assignment.template_id
    into v_template_id
    from core.company_operations_ticket_assignment assignment
    where assignment.id::text = new.request_payload ->> 'ticket_library_assignment_id';
  end if;

  if v_template_id is not null then
    perform core.finalize_operations_ticket_template_deletion(v_template_id);
  end if;

  return new;
end;
$$;

drop trigger if exists zz_finalize_pending_ticket_template_deletion_trg
  on core.operations_collection_request;

-- Runs after the transition guard and completion-truth logic have settled the
-- authoritative terminal status.
create trigger zz_finalize_pending_ticket_template_deletion_trg
after update of request_status on core.operations_collection_request
for each row
execute function core.finalize_pending_ticket_template_deletion_from_request();

revoke all on function core.finalize_operations_ticket_template_deletion(uuid) from public;
revoke all on function core.finalize_operations_ticket_template_deletion(uuid) from authenticated;
grant execute on function core.finalize_operations_ticket_template_deletion(uuid) to service_role;

revoke all on function public.request_operations_ticket_template_deletion(uuid) from public;
grant execute on function public.request_operations_ticket_template_deletion(uuid) to authenticated, service_role;

revoke all on function public.delete_operations_ticket_template(uuid) from public;
grant execute on function public.delete_operations_ticket_template(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
