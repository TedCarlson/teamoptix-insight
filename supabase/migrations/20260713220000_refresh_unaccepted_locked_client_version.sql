begin;

create or replace function public.legal_lock_document_version(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, legal, core
as $$
declare
  v_document legal.document%rowtype;
  v_label text;
  v_existing legal.document_version%rowtype;
  v_existing_acceptance_count integer := 0;
  v_sections jsonb;
  v_section_count integer;
  v_snapshot jsonb;
  v_version legal.document_version%rowtype;
  v_unresolved text[];
begin
  select *
  into v_document
  from legal.document
  where id = p_document_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Document not found'
    );
  end if;

  v_label := coalesce(
    v_document.current_version,
    v_document.version_major::text || '.' || v_document.version_minor::text || '.' || v_document.version_patch::text
  );

  select *
  into v_existing
  from legal.document_version
  where document_id = p_document_id
    and version_label = v_label
  limit 1;

  with active_sections as (
    select
      ds.id,
      ds.section_number,
      ds.section_key,
      case
        when v_document.document_scope = 'TEMPLATE' then ds.title
        else replace(
          replace(
            replace(
              replace(ds.title, '[Customer Legal Name]', coalesce(v_document.customer_legal_name, '')),
              '[Date]',
              case
                when v_document.effective_at is null then ''
                else to_char(v_document.effective_at::date, 'YYYY-MM-DD')
              end
            ),
            '[Customer Lead]', coalesce(v_document.customer_project_lead, '')
          ),
          '[Team Optix Lead]', coalesce(v_document.teamoptix_project_lead, '')
        )
      end as title,
      case
        when v_document.document_scope = 'TEMPLATE' then coalesce(ds.summary, '')
        else replace(
          replace(
            replace(
              replace(coalesce(ds.summary, ''), '[Customer Legal Name]', coalesce(v_document.customer_legal_name, '')),
              '[Date]',
              case
                when v_document.effective_at is null then ''
                else to_char(v_document.effective_at::date, 'YYYY-MM-DD')
              end
            ),
            '[Customer Lead]', coalesce(v_document.customer_project_lead, '')
          ),
          '[Team Optix Lead]', coalesce(v_document.teamoptix_project_lead, '')
        )
      end as summary,
      case
        when v_document.document_scope = 'TEMPLATE' then ds.body_markdown
        else replace(
          replace(
            replace(
              replace(ds.body_markdown, '[Customer Legal Name]', coalesce(v_document.customer_legal_name, '')),
              '[Date]',
              case
                when v_document.effective_at is null then ''
                else to_char(v_document.effective_at::date, 'YYYY-MM-DD')
              end
            ),
            '[Customer Lead]', coalesce(v_document.customer_project_lead, '')
          ),
          '[Team Optix Lead]', coalesce(v_document.teamoptix_project_lead, '')
        )
      end as body_markdown
    from legal.document_section ds
    where ds.document_id = p_document_id
      and upper(coalesce(ds.status, '')) <> 'ARCHIVED'
      and upper(coalesce(ds.workflow_status, '')) <> 'ARCHIVED'
    order by ds.section_number asc
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'section_number', section_number,
          'section_key', section_key,
          'title', title,
          'summary', summary,
          'body_markdown', body_markdown
        )
        order by section_number asc
      ),
      '[]'::jsonb
    ),
    count(*)
  into v_sections, v_section_count
  from active_sections;

  if v_document.document_scope = 'CLIENT_DOCUMENT' then
    v_unresolved := array_remove(array[
      case when v_sections::text like '%[Customer Legal Name]%' then '[Customer Legal Name]' end,
      case when v_sections::text like '%[Date]%' then '[Date]' end,
      case when v_sections::text like '%[Customer Lead]%' then '[Customer Lead]' end,
      case when v_sections::text like '%[Team Optix Lead]%' then '[Team Optix Lead]' end
    ], null);

    if array_length(v_unresolved, 1) is not null then
      return jsonb_build_object(
        'ok', false,
        'code', 'UNRESOLVED_DOCUMENT_FIELDS',
        'error', 'Resolve document fields before locking this client document.',
        'unresolvedFields', to_jsonb(v_unresolved)
      );
    end if;
  end if;

  v_snapshot := jsonb_build_object(
    'document',
    jsonb_build_object(
      'id', v_document.id,
      'document_key', v_document.document_key,
      'title', v_document.title,
      'version_label', v_label,
      'version_major', v_document.version_major,
      'version_minor', v_document.version_minor,
      'version_patch', v_document.version_patch,
      'effective_at', v_document.effective_at,
      'customer_legal_name', v_document.customer_legal_name,
      'customer_project_lead', v_document.customer_project_lead,
      'teamoptix_project_lead', v_document.teamoptix_project_lead,
      'provider_name', coalesce(v_document.provider_name, 'Team Optix, LLC'),
      'document_scope', coalesce(v_document.document_scope, 'TEMPLATE')
    ),
    'sections',
    v_sections
  );

  if v_existing.id is not null then
    select count(*)
    into v_existing_acceptance_count
    from legal.document_version_acceptance a
    where a.document_version_id = v_existing.id;

    if v_existing_acceptance_count > 0 then
      return jsonb_build_object(
        'ok', true,
        'alreadyLocked', true,
        'accepted', true,
        'version', to_jsonb(v_existing)
      );
    end if;

    update legal.document_version
    set
      title = v_document.title,
      section_count = v_section_count,
      content_snapshot = v_snapshot,
      created_at = now()
    where id = v_existing.id
    returning *
    into v_version;

    return jsonb_build_object(
      'ok', true,
      'alreadyLocked', true,
      'refreshedUnlockedSnapshot', true,
      'version', to_jsonb(v_version)
    );
  end if;

  insert into legal.document_version (
    document_id,
    version_label,
    version_major,
    version_minor,
    version_patch,
    title,
    status,
    section_count,
    content_snapshot
  )
  values (
    p_document_id,
    v_label,
    v_document.version_major,
    v_document.version_minor,
    v_document.version_patch,
    v_document.title,
    'LOCKED',
    v_section_count,
    v_snapshot
  )
  returning *
  into v_version;

  return jsonb_build_object(
    'ok', true,
    'alreadyLocked', false,
    'version', to_jsonb(v_version)
  );
end;
$$;

grant execute on function public.legal_lock_document_version(uuid) to authenticated;
grant execute on function public.legal_lock_document_version(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
