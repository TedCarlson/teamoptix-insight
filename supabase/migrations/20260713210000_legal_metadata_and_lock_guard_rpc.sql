begin;

create or replace function public.legal_save_document_metadata(
  p_document_id uuid,
  p_customer_legal_name text default null,
  p_effective_at timestamptz default null,
  p_customer_project_lead text default null,
  p_teamoptix_project_lead text default null,
  p_provider_name text default 'Team Optix, LLC'
)
returns jsonb
language plpgsql
security definer
set search_path = public, legal, core
as $$
declare
  v_document legal.document%rowtype;
begin
  update legal.document
  set
    customer_legal_name = nullif(btrim(coalesce(p_customer_legal_name, '')), ''),
    effective_at = p_effective_at,
    customer_project_lead = nullif(btrim(coalesce(p_customer_project_lead, '')), ''),
    teamoptix_project_lead = nullif(btrim(coalesce(p_teamoptix_project_lead, '')), ''),
    provider_name = coalesce(nullif(btrim(coalesce(p_provider_name, '')), ''), 'Team Optix, LLC'),
    updated_at = now()
  where id = p_document_id
  returning *
  into v_document;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Document not found.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'document', to_jsonb(v_document)
  );
end;
$$;

grant execute on function public.legal_save_document_metadata(uuid, text, timestamptz, text, text, text) to authenticated;
grant execute on function public.legal_save_document_metadata(uuid, text, timestamptz, text, text, text) to service_role;

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

  if found then
    return jsonb_build_object(
      'ok', true,
      'alreadyLocked', true,
      'version', to_jsonb(v_existing)
    );
  end if;

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

commit;
