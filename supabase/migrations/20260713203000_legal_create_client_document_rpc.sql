begin;

create or replace function public.legal_create_client_document(
  p_template_document_id uuid,
  p_template_version_id uuid,
  p_customer_legal_name text,
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
  v_template legal.document%rowtype;
  v_version legal.document_version%rowtype;
  v_client legal.document%rowtype;
  v_sections jsonb;
  v_slug text;
  v_suffix text;
  v_document_key text;
  v_effective_label text;
begin
  if p_template_document_id is null
    or p_template_version_id is null
    or nullif(btrim(coalesce(p_customer_legal_name, '')), '') is null
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'Template version and customer legal name are required.'
    );
  end if;

  select *
  into v_template
  from legal.document
  where id = p_template_document_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Template document not found.');
  end if;

  if coalesce(v_template.document_scope, 'TEMPLATE') <> 'TEMPLATE' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Client documents can only be created from locked templates.'
    );
  end if;

  select *
  into v_version
  from legal.document_version
  where id = p_template_version_id
    and document_id = p_template_document_id
    and status = 'LOCKED';

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Locked template version not found.'
    );
  end if;

  v_sections := coalesce(v_version.content_snapshot -> 'sections', '[]'::jsonb);

  if jsonb_array_length(v_sections) = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'The selected template version has no sections.'
    );
  end if;

  v_slug := regexp_replace(lower(btrim(p_customer_legal_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  v_slug := coalesce(nullif(v_slug, ''), 'customer');
  v_suffix := upper(substr(md5(clock_timestamp()::text || random()::text), 1, 8));
  v_document_key := upper(v_template.document_key || '__' || v_slug || '__' || v_suffix);
  v_effective_label := case
    when p_effective_at is null then ''
    else to_char(p_effective_at::date, 'YYYY-MM-DD')
  end;

  insert into legal.document (
    document_key,
    title,
    version_major,
    version_minor,
    version_patch,
    current_version,
    status,
    owner_name,
    document_scope,
    source_template_document_id,
    source_template_version_id,
    customer_legal_name,
    customer_project_lead,
    teamoptix_project_lead,
    provider_name,
    effective_at,
    customer_document_label,
    updated_at
  )
  values (
    v_document_key,
    btrim(p_customer_legal_name) || ' · ' || v_template.title,
    1,
    0,
    0,
    '1.0.0',
    'DRAFT',
    'Team Optix Business',
    'CLIENT_DOCUMENT',
    p_template_document_id,
    p_template_version_id,
    btrim(p_customer_legal_name),
    nullif(btrim(coalesce(p_customer_project_lead, '')), ''),
    nullif(btrim(coalesce(p_teamoptix_project_lead, '')), ''),
    coalesce(nullif(btrim(coalesce(p_provider_name, '')), ''), 'Team Optix, LLC'),
    p_effective_at,
    btrim(p_customer_legal_name) || ' · ' || v_template.title,
    now()
  )
  returning *
  into v_client;

  insert into legal.document_section (
    document_id,
    section_number,
    section_key,
    title,
    summary,
    body_markdown,
    status,
    workflow_status
  )
  select
    v_client.id,
    coalesce((section_item ->> 'section_number')::integer, row_number() over ()),
    coalesce(nullif(section_item ->> 'section_key', ''), 'section-' || row_number() over ()),
    replace(
      replace(
        replace(
          replace(coalesce(section_item ->> 'title', 'Untitled Section'), '[Customer Legal Name]', btrim(p_customer_legal_name)),
          '[Date]', v_effective_label
        ),
        '[Customer Lead]', coalesce(nullif(btrim(coalesce(p_customer_project_lead, '')), ''), '')
      ),
      '[Team Optix Lead]', coalesce(nullif(btrim(coalesce(p_teamoptix_project_lead, '')), ''), '')
    ),
    nullif(
      replace(
        replace(
          replace(
            replace(coalesce(section_item ->> 'summary', ''), '[Customer Legal Name]', btrim(p_customer_legal_name)),
            '[Date]', v_effective_label
          ),
          '[Customer Lead]', coalesce(nullif(btrim(coalesce(p_customer_project_lead, '')), ''), '')
        ),
        '[Team Optix Lead]', coalesce(nullif(btrim(coalesce(p_teamoptix_project_lead, '')), ''), '')
      ),
      ''
    ),
    replace(
      replace(
        replace(
          replace(coalesce(section_item ->> 'body_markdown', ''), '[Customer Legal Name]', btrim(p_customer_legal_name)),
          '[Date]', v_effective_label
        ),
        '[Customer Lead]', coalesce(nullif(btrim(coalesce(p_customer_project_lead, '')), ''), '')
      ),
      '[Team Optix Lead]', coalesce(nullif(btrim(coalesce(p_teamoptix_project_lead, '')), ''), '')
    ),
    'DRAFT',
    'DRAFT'
  from jsonb_array_elements(v_sections) with ordinality as section_rows(section_item, ordinal_position);

  return jsonb_build_object(
    'ok', true,
    'document', to_jsonb(v_client),
    'href', '/teamoptix/business/contracts/client-documents/' || v_client.document_key
  );
end;
$$;

grant execute on function public.legal_create_client_document(uuid, uuid, text, timestamptz, text, text, text) to authenticated;
grant execute on function public.legal_create_client_document(uuid, uuid, text, timestamptz, text, text, text) to service_role;

commit;
