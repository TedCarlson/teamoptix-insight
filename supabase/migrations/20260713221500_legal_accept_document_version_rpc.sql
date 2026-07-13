begin;

create or replace function public.legal_accept_document_version(
  p_document_version_id uuid,
  p_accepted_by_name text,
  p_accepted_by_email text,
  p_accepted_by_title text default null,
  p_accepted_by_company text default null,
  p_company_id uuid default null,
  p_accepted_by_profile_id uuid default null,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, legal, core
as $$
declare
  v_version legal.document_version%rowtype;
  v_document legal.document%rowtype;
  v_acceptance legal.document_version_acceptance%rowtype;
  v_existing legal.document_version_acceptance%rowtype;
  v_vault legal.document_vault_item%rowtype;
  v_email text;
begin
  v_email := lower(btrim(coalesce(p_accepted_by_email, '')));

  if p_document_version_id is null then
    return jsonb_build_object('ok', false, 'error', 'Missing documentVersionId');
  end if;

  if length(btrim(coalesce(p_accepted_by_name, ''))) = 0
    or length(v_email) = 0
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'Signer name, signer email, and electronic acknowledgment are required.'
    );
  end if;

  select *
  into v_version
  from legal.document_version
  where id = p_document_version_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Locked version not found');
  end if;

  if v_version.status <> 'LOCKED' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Only locked document versions can be accepted.'
    );
  end if;

  select *
  into v_document
  from legal.document
  where id = v_version.document_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Document not found');
  end if;

  select *
  into v_existing
  from legal.document_version_acceptance
  where document_version_id = p_document_version_id
    and lower(accepted_by_email) = v_email
  limit 1;

  if found then
    v_acceptance := v_existing;
  else
    insert into legal.document_version_acceptance (
      document_version_id,
      document_id,
      company_id,
      accepted_by_profile_id,
      accepted_by_name,
      accepted_by_email,
      accepted_by_title,
      accepted_by_company,
      acceptance_method,
      acknowledgment_checked,
      content_snapshot,
      ip_address,
      user_agent
    )
    values (
      p_document_version_id,
      v_version.document_id,
      p_company_id,
      p_accepted_by_profile_id,
      btrim(p_accepted_by_name),
      v_email,
      nullif(btrim(coalesce(p_accepted_by_title, '')), ''),
      nullif(btrim(coalesce(p_accepted_by_company, '')), ''),
      'READ_AND_ACCEPT',
      true,
      coalesce(v_version.content_snapshot, '{}'::jsonb),
      p_ip_address,
      p_user_agent
    )
    returning *
    into v_acceptance;
  end if;

  insert into legal.document_vault_item (
    document_id,
    document_version_id,
    acceptance_id,
    company_id,
    document_type,
    document_title,
    version_label,
    artifact_type,
    artifact_status,
    storage_status,
    content_snapshot,
    accepted_by_name,
    accepted_by_email,
    accepted_by_title,
    accepted_by_company,
    accepted_at,
    updated_at
  )
  values (
    v_version.document_id,
    v_version.id,
    v_acceptance.id,
    coalesce(v_acceptance.company_id, p_company_id),
    coalesce(v_document.document_key, 'UNKNOWN_DOCUMENT'),
    coalesce(v_version.title, v_document.title, 'Document'),
    v_version.version_label,
    'ACCEPTANCE_RECORD',
    'STORED',
    'METADATA_ONLY',
    coalesce(v_acceptance.content_snapshot, v_version.content_snapshot, '{}'::jsonb),
    v_acceptance.accepted_by_name,
    v_acceptance.accepted_by_email,
    v_acceptance.accepted_by_title,
    v_acceptance.accepted_by_company,
    v_acceptance.accepted_at,
    now()
  )
  on conflict (acceptance_id)
  where acceptance_id is not null
  do update set
    company_id = excluded.company_id,
    document_type = excluded.document_type,
    document_title = excluded.document_title,
    version_label = excluded.version_label,
    artifact_type = excluded.artifact_type,
    artifact_status = excluded.artifact_status,
    storage_status = excluded.storage_status,
    content_snapshot = excluded.content_snapshot,
    accepted_by_name = excluded.accepted_by_name,
    accepted_by_email = excluded.accepted_by_email,
    accepted_by_title = excluded.accepted_by_title,
    accepted_by_company = excluded.accepted_by_company,
    accepted_at = excluded.accepted_at,
    updated_at = now()
  returning *
  into v_vault;

  return jsonb_build_object(
    'ok', true,
    'alreadyAccepted', v_existing.id is not null,
    'acceptance', to_jsonb(v_acceptance),
    'vaultItem', to_jsonb(v_vault)
  );
end;
$$;

grant execute on function public.legal_accept_document_version(uuid, text, text, text, text, uuid, uuid, inet, text) to authenticated;
grant execute on function public.legal_accept_document_version(uuid, text, text, text, text, uuid, uuid, inet, text) to service_role;

notify pgrst, 'reload schema';

commit;
