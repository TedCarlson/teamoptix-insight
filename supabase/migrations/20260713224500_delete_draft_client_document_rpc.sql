begin;

create or replace function public.legal_delete_draft_client_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, legal, core
as $$
declare
  v_document legal.document%rowtype;
  v_locked_count integer := 0;
  v_active_task_count integer := 0;
  v_section_count integer := 0;
begin
  select *
  into v_document
  from legal.document
  where id = p_document_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Document not found.');
  end if;

  if coalesce(v_document.document_scope, 'TEMPLATE') <> 'CLIENT_DOCUMENT' then
    return jsonb_build_object('ok', false, 'error', 'Only client documents can be deleted here.');
  end if;

  if upper(coalesce(v_document.status, 'DRAFT')) <> 'DRAFT' then
    return jsonb_build_object('ok', false, 'error', 'Only draft client documents can be deleted.');
  end if;

  select count(*)
  into v_locked_count
  from legal.document_version
  where document_id = p_document_id;

  if v_locked_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'This client document has locked versions and cannot be deleted.');
  end if;

  select count(*)
  into v_active_task_count
  from legal.customer_legal_task
  where document_id = p_document_id
    and status <> 'CANCELLED';

  if v_active_task_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'This client document has active legal tasks and cannot be deleted.');
  end if;

  select count(*)
  into v_section_count
  from legal.document_section
  where document_id = p_document_id;

  delete from legal.document_section
  where document_id = p_document_id;

  delete from legal.document
  where id = p_document_id;

  return jsonb_build_object(
    'ok', true,
    'deletedDocumentId', p_document_id,
    'deletedSectionCount', v_section_count
  );
end;
$$;

grant execute on function public.legal_delete_draft_client_document(uuid) to authenticated;
grant execute on function public.legal_delete_draft_client_document(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
