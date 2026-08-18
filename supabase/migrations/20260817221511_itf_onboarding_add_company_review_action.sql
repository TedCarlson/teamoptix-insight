begin;

-- Resolve an unknown FUSE company without leaving the import review. The
-- company is provisioned for ITF in review state, its exact FUSE spelling is
-- retained as an alias, and only locations present in this source batch are
-- attached to the proposed ITG engagement.
create or replace function public.itf_add_onboarding_company(
  p_company_slug text,
  p_batch_id uuid,
  p_source_company_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_company_id uuid;
  v_provider_company_id uuid;
  v_product_id uuid;
  v_relationship_id uuid;
  v_engagement_id uuid;
  v_industry_id uuid;
  v_lob_id uuid;
  v_profile_id uuid;
  v_company_key text;
  v_slug_base text;
  v_company_slug text;
  v_slug_suffix integer := 1;
  v_starts_on date;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select company.id
  into v_workspace_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug)
    and company.company_status = 'active';

  if v_workspace_company_id is null then
    raise exception 'Company not found.';
  end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_workspace_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;

  perform 1
  from core.itf_onboarding_import_batch batch
  where batch.id = p_batch_id
    and batch.workspace_company_id = v_workspace_company_id
  for update;

  if not found then
    raise exception 'Import batch not found.';
  end if;

  v_company_key := regexp_replace(lower(btrim(p_source_company_name)), '[^a-z0-9]+', '', 'g');
  if length(v_company_key) = 0 then
    raise exception 'A source company name is required.';
  end if;

  if not exists (
    select 1
    from core.itf_onboarding_import_row source
    where source.batch_id = p_batch_id
      and source.resolved_company_id is null
      and regexp_replace(lower(btrim(source.source_company_name)), '[^a-z0-9]+', '', 'g') = v_company_key
  ) then
    raise exception 'This company no longer has unresolved rows in the import batch.';
  end if;

  if exists (
    select 1
    from core.itf_onboarding_import_row source
    left join core.company_location location
      on location.company_id = v_workspace_company_id
     and location.location_code = source.location_code
     and location.location_status = 'active'
    where source.batch_id = p_batch_id
      and regexp_replace(lower(btrim(source.source_company_name)), '[^a-z0-9]+', '', 'g') = v_company_key
      and (source.location_code is null or location.id is null)
  ) then
    raise exception 'The source company includes a location that is not active in this ITF workspace.';
  end if;

  v_profile_id := core.current_profile_id();

  select resolved.company_id
  into v_provider_company_id
  from (
    select alias.company_id, 1 as precedence
    from core.company_external_alias alias
    where alias.source_system = 'fuse-onboarding'
      and alias.source_entity_type = 'company'
      and alias.source_value_normalized = v_company_key
    union all
    select company.id, 2
    from core.companies company
    where company.company_status = 'active'
      and regexp_replace(lower(company.company_name), '[^a-z0-9]+', '', 'g') = v_company_key
    union all
    select company.id, 3
    from core.companies company
    where company.company_status = 'active'
      and company.legal_name is not null
      and regexp_replace(lower(company.legal_name), '[^a-z0-9]+', '', 'g') = v_company_key
  ) resolved
  order by resolved.precedence
  limit 1;

  if v_provider_company_id is null then
    v_slug_base := trim(both '-' from regexp_replace(lower(btrim(p_source_company_name)), '[^a-z0-9]+', '-', 'g'));
    if length(v_slug_base) = 0 then
      v_slug_base := 'itf-provider';
    end if;
    v_company_slug := v_slug_base;
    while exists (select 1 from core.companies company where company.company_slug = v_company_slug)
    loop
      v_slug_suffix := v_slug_suffix + 1;
      v_company_slug := v_slug_base || '-' || v_slug_suffix::text;
    end loop;

    insert into core.companies (
      company_name,
      legal_name,
      company_slug,
      company_status,
      provisioning_status,
      contact_email
    ) values (
      btrim(p_source_company_name),
      null,
      v_company_slug,
      'active',
      'provisioned',
      null
    )
    returning id into v_provider_company_id;
  end if;

  insert into core.company_external_alias (
    company_id,
    source_system,
    source_entity_type,
    source_value,
    alias_kind
  ) values (
    v_provider_company_id,
    'fuse-onboarding',
    'company',
    btrim(p_source_company_name),
    'fuse_onboarding'
  )
  on conflict (source_system, source_entity_type, source_value_normalized) do update
  set company_id = excluded.company_id,
      source_value = excluded.source_value,
      alias_kind = excluded.alias_kind;

  select product.id
  into v_product_id
  from ref.insight_products product
  where product.product_key = 'insight-telecom-fulfillment'
    and product.is_active;

  select min(source.fuse_processing_start_date)
  into v_starts_on
  from core.itf_onboarding_import_row source
  where source.batch_id = p_batch_id
    and regexp_replace(lower(btrim(source.source_company_name)), '[^a-z0-9]+', '', 'g') = v_company_key;

  v_starts_on := coalesce(v_starts_on, current_date);

  insert into core.company_product (
    company_id,
    product_id,
    participation_status,
    starts_on
  ) values (
    v_provider_company_id,
    v_product_id,
    'review',
    v_starts_on
  )
  on conflict (company_id, product_id) do update
  set participation_status = case
        when core.company_product.participation_status = 'active' then 'active'
        else 'review'
      end,
      starts_on = least(coalesce(core.company_product.starts_on, excluded.starts_on), excluded.starts_on),
      ends_on = null,
      updated_at = now();

  insert into core.company_relationship (
    principal_company_id,
    provider_company_id,
    relationship_kind,
    relationship_status,
    is_exclusive,
    starts_on,
    invited_by_profile_id
  ) values (
    v_workspace_company_id,
    v_provider_company_id,
    'subcontractor',
    'proposed',
    false,
    v_starts_on,
    v_profile_id
  )
  on conflict (principal_company_id, provider_company_id, relationship_kind)
    where relationship_status in ('proposed', 'active', 'suspended')
  do update
  set starts_on = least(coalesce(core.company_relationship.starts_on, excluded.starts_on), excluded.starts_on),
      updated_at = now()
  returning id into v_relationship_id;

  select industry.id, lob.id
  into v_industry_id, v_lob_id
  from ref.industries industry
  join ref.lines_of_business lob
    on lob.industry_id = industry.id
   and lob.lob_key = 'fulfillment'
  where industry.industry_key = 'telecom-fulfillment';

  insert into core.company_engagement (
    relationship_id,
    engagement_key,
    engagement_name,
    industry_id,
    line_of_business_id,
    engagement_status,
    starts_on,
    created_by_profile_id
  ) values (
    v_relationship_id,
    'itg-telecom-fulfillment',
    'ITG Telecom Fulfillment',
    v_industry_id,
    v_lob_id,
    'draft',
    v_starts_on,
    v_profile_id
  )
  on conflict (relationship_id, engagement_key) do update
  set starts_on = least(coalesce(core.company_engagement.starts_on, excluded.starts_on), excluded.starts_on),
      updated_at = now()
  returning id into v_engagement_id;

  insert into core.company_engagement_participant (
    engagement_id,
    company_id,
    source_relationship_id,
    reporting_company_id,
    participant_kind,
    participant_status,
    starts_on
  ) values (
    v_engagement_id,
    v_provider_company_id,
    v_relationship_id,
    v_provider_company_id,
    'direct_provider',
    'review',
    v_starts_on
  )
  on conflict (engagement_id, company_id) do update
  set starts_on = least(coalesce(core.company_engagement_participant.starts_on, excluded.starts_on), excluded.starts_on),
      updated_at = now();

  insert into core.company_engagement_location (
    engagement_id,
    principal_company_location_id,
    location_status,
    starts_on
  )
  select distinct
    v_engagement_id,
    location.id,
    'review',
    v_starts_on
  from core.itf_onboarding_import_row source
  join core.company_location location
    on location.company_id = v_workspace_company_id
   and location.location_code = source.location_code
   and location.location_status = 'active'
  where source.batch_id = p_batch_id
    and regexp_replace(lower(btrim(source.source_company_name)), '[^a-z0-9]+', '', 'g') = v_company_key
  on conflict (engagement_id, principal_company_location_id) do update
  set starts_on = least(coalesce(core.company_engagement_location.starts_on, excluded.starts_on), excluded.starts_on),
      updated_at = now();

  update core.itf_onboarding_import_row source
  set resolved_company_id = v_provider_company_id,
      proposed_action = case
        when jsonb_path_exists(source.review_detail, '$[*] ? (@.severity == "error")') then 'review'
        when source.source_action = 'ignore' then 'ignore'
        when source.source_action = 'update_existing_only' then 'ignore'
        else 'insert'
      end,
      reconciliation_reason = case
        when jsonb_path_exists(source.review_detail, '$[*] ? (@.severity == "error")') then 'The source row failed structural validation.'
        when source.source_action = 'ignore' then 'FUSE status is outside the governed action contract.'
        when source.source_action = 'update_existing_only' then 'Inactive FUSE state has no current onboarding record to close.'
        else 'New onboarding candidate.'
      end
  where source.batch_id = p_batch_id
    and source.resolved_company_id is null
    and regexp_replace(lower(btrim(source.source_company_name)), '[^a-z0-9]+', '', 'g') = v_company_key;

  update core.itf_onboarding_import_batch batch
  set source_row_count = counts.total,
      proposed_change_count = counts.changes,
      review_count = counts.review,
      unchanged_count = counts.unchanged,
      ignored_count = counts.ignored
  from (
    select count(*)::integer total,
      count(*) filter (where proposed_action in ('insert', 'version'))::integer changes,
      count(*) filter (where proposed_action = 'review')::integer review,
      count(*) filter (where proposed_action in ('unchanged', 'stale'))::integer unchanged,
      count(*) filter (where proposed_action = 'ignore')::integer ignored
    from core.itf_onboarding_import_row
    where batch_id = p_batch_id
  ) counts
  where batch.id = p_batch_id;

  return core.itf_onboarding_batch_result(p_batch_id);
end;
$$;

revoke all on function public.itf_add_onboarding_company(text, uuid, text) from public, anon;
grant execute on function public.itf_add_onboarding_company(text, uuid, text) to authenticated;

comment on function public.itf_add_onboarding_company(text, uuid, text) is
  'Adds an unresolved FUSE provider to the ITF catalogue and proposed workspace relationship, attaches only batch locations, and reconciles every affected source row.';

commit;
