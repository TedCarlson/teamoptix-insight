-- Transactional verification for public.legal_finalize_customer_task(uuid, uuid).
-- This script creates only synthetic legal records and rolls them all back.

begin;

do $$
declare
  v_document_id uuid;
  v_document_version_id uuid;
  v_task_id uuid;
  v_executor_id uuid := gen_random_uuid();
  v_document_key text := '__verify_finalize_rpc_' || gen_random_uuid()::text;
  v_result jsonb;
  v_task legal.customer_legal_task%rowtype;
  v_document_status text;
  v_version_status text;
begin
  if has_function_privilege('anon', 'public.legal_finalize_customer_task(uuid,uuid)', 'EXECUTE') then
    raise exception 'anon must not be able to execute legal_finalize_customer_task';
  end if;

  if has_function_privilege('authenticated', 'public.legal_finalize_customer_task(uuid,uuid)', 'EXECUTE') then
    raise exception 'authenticated must not be able to execute legal_finalize_customer_task';
  end if;

  if not has_function_privilege('service_role', 'public.legal_finalize_customer_task(uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role must be able to execute legal_finalize_customer_task';
  end if;

  insert into legal.document (
    document_key,
    title,
    status,
    document_scope,
    customer_legal_name
  )
  values (
    v_document_key,
    'Finalization RPC verification agreement',
    'ACTIVE',
    'CLIENT_DOCUMENT',
    'Finalization RPC Verification Customer'
  )
  returning id into v_document_id;

  insert into legal.document_version (
    document_id,
    version_label,
    title,
    status,
    content_snapshot
  )
  values (
    v_document_id,
    'verify-1.0.0',
    'Finalization RPC verification agreement',
    'LOCKED',
    jsonb_build_object('verification', true)
  )
  returning id into v_document_version_id;

  select task.id
  into v_task_id
  from legal.customer_legal_task task
  where task.document_version_id = v_document_version_id
    and task.task_type = 'CLIENT_DOCUMENT_ACCEPTANCE';

  if v_task_id is null then
    raise exception 'Synthetic customer legal task was not created';
  end if;

  update legal.customer_legal_task
  set
    status = 'CUSTOMER_ACCEPTED',
    customer_accepted_at = now(),
    customer_accepted_by_email = 'verification@example.invalid',
    blocking_reason = 'Team Optix final execution is pending.'
  where id = v_task_id;

  v_result := public.legal_finalize_customer_task(v_task_id, v_executor_id);

  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'Expected successful finalization, received %', v_result;
  end if;

  select *
  into v_task
  from legal.customer_legal_task
  where id = v_task_id;

  if v_task.status <> 'EXECUTED_AND_VAULTED'
    or v_task.teamoptix_executed_by is distinct from v_executor_id
    or v_task.teamoptix_executed_at is null
    or v_task.completed_at is null
    or v_task.blocking_reason <> 'Legal execution complete and vault evidence recorded.'
  then
    raise exception 'Finalized task fields are incorrect: %', to_jsonb(v_task);
  end if;

  select document.status
  into v_document_status
  from legal.document document
  where document.id = v_document_id;

  select version.status
  into v_version_status
  from legal.document_version version
  where version.id = v_document_version_id;

  if v_document_status <> 'ACTIVE' or v_version_status <> 'LOCKED' then
    raise exception 'Finalization modified the signed document or version';
  end if;

  v_result := public.legal_finalize_customer_task(v_task_id, v_executor_id);

  if coalesce((v_result ->> 'ok')::boolean, false) is not false
    or v_result ->> 'status' <> 'EXECUTED_AND_VAULTED'
  then
    raise exception 'Repeat finalization must be rejected, received %', v_result;
  end if;
end;
$$;

rollback;
