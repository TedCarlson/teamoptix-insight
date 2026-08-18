begin;

-- Company source names often differ only by a legal suffix. Keep that
-- difference as an explicit alias decision rather than creating duplicates.
create or replace function core.itf_company_match_key(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_next text;
begin
  v_key := btrim(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', ' ', 'g'));
  loop
    v_next := btrim(regexp_replace(
      v_key,
      '[[:space:]]+(llc|l l c|inc|incorporated|ltd|limited|corp|corporation|co|company)$',
      '',
      'i'
    ));
    exit when v_next = v_key;
    v_key := v_next;
  end loop;
  return regexp_replace(v_key, '[^a-z0-9]+', '', 'g');
end;
$$;

create or replace function core.itf_reconcile_onboarding_company_rows(
  p_batch_id uuid,
  p_company_key text,
  p_resolved_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_company_id uuid;
  v_source core.itf_onboarding_import_row%rowtype;
  v_candidate core.itf_onboarding_candidate_version%rowtype;
  v_roster_ids uuid[];
  v_roster_id uuid;
  v_name_roster_id uuid;
  v_identity_key text;
  v_proposed_action text;
  v_reason text;
begin
  select batch.workspace_company_id
  into v_workspace_company_id
  from core.itf_onboarding_import_batch batch
  where batch.id = p_batch_id;

  if v_workspace_company_id is null then
    raise exception 'Import batch not found.';
  end if;

  for v_source in
    select source.*
    from core.itf_onboarding_import_row source
    where source.batch_id = p_batch_id
      and core.itf_company_match_key(source.source_company_name) = p_company_key
      and source.decision <> 'applied'
    order by source.source_row_number
    for update
  loop
    select coalesce(array_agg(distinct match.roster_id), '{}'::uuid[])
    into v_roster_ids
    from (
      select identifier.roster_id
      from core.company_roster_identifier identifier
      join core.company_roster roster on roster.id = identifier.roster_id
      where roster.company_id = p_resolved_company_id
        and (
          (v_source.fuse_personnel_id is not null
            and identifier.identifier_type = 'fuse_emp_id'
            and upper(btrim(identifier.identifier_value)) = upper(v_source.fuse_personnel_id))
          or (v_source.tech_id is not null
            and identifier.identifier_type = 'tech_id'
            and upper(btrim(identifier.identifier_value)) = upper(v_source.tech_id))
        )
    ) match;

    select roster.id
    into v_name_roster_id
    from core.company_roster roster
    where roster.company_id = p_resolved_company_id
      and regexp_replace(lower(btrim(roster.full_name)), '[^a-z0-9]+', '', 'g') =
        regexp_replace(lower(v_source.full_name), '[^a-z0-9]+', '', 'g')
    order by (roster.employment_status = 'Active') desc, roster.created_at desc
    limit 1;

    v_roster_id := case when cardinality(v_roster_ids) = 1 then v_roster_ids[1] else null end;
    v_identity_key := case
      when v_source.fuse_personnel_id is not null then 'personnel:' || lower(v_source.fuse_personnel_id)
      when v_source.tech_id is not null then 'tech:' || lower(v_source.tech_id)
      else 'name:' || regexp_replace(lower(v_source.full_name), '[^a-z0-9]+', '', 'g')
    end;

    v_candidate := null;
    select current.*
    into v_candidate
    from core.itf_onboarding_candidate_version current
    where current.workspace_company_id = v_workspace_company_id
      and current.roster_company_id = p_resolved_company_id
      and current.valid_to is null
      and (
        (v_roster_id is not null and current.roster_id = v_roster_id)
        or (v_source.fuse_personnel_id is not null and upper(current.fuse_personnel_id) = upper(v_source.fuse_personnel_id))
        or (v_source.tech_id is not null and upper(current.tech_id) = upper(v_source.tech_id))
        or current.source_identity_key = v_identity_key
      )
    order by (current.roster_id = v_roster_id) desc nulls last, current.created_at desc
    limit 1;

    if jsonb_path_exists(v_source.review_detail, '$[*] ? (@.severity == "error")') then
      v_proposed_action := 'review';
      v_reason := 'The source row failed structural validation.';
    elsif not exists (
      select 1
      from core.company_location location
      where location.company_id = v_workspace_company_id
        and location.location_code = v_source.location_code
        and location.location_status = 'active'
    ) then
      v_proposed_action := 'review';
      v_reason := 'Location is not active in this ITF workspace.';
    elsif cardinality(v_roster_ids) > 1 then
      v_proposed_action := 'review';
      v_reason := 'Personnel and Tech IDs point to different roster records.';
    elsif v_roster_id is null and v_name_roster_id is not null then
      v_proposed_action := 'review';
      v_reason := 'Name matches a roster row, but a governed identifier is required to connect it.';
    elsif v_source.source_action = 'ignore' then
      v_proposed_action := 'ignore';
      v_reason := 'FUSE status is outside the governed action contract.';
    elsif v_candidate.id is null and v_source.source_action = 'update_existing_only' then
      v_proposed_action := 'ignore';
      v_reason := 'Inactive FUSE state has no current onboarding record to close.';
    elsif v_candidate.id is null then
      v_proposed_action := 'insert';
      v_reason := case
        when v_roster_id is null then 'New onboarding candidate.'
        else 'Connect onboarding history to the matched roster row.'
      end;
    elsif v_candidate.fuse_status = 'Started' and v_source.fuse_status <> 'Terminated' then
      v_proposed_action := 'unchanged';
      v_reason := 'Started is stable; only a later termination may replace it.';
    elsif v_candidate.source_payload_hash = v_source.source_payload_hash then
      v_proposed_action := 'unchanged';
      v_reason := 'No source fields changed.';
    elsif v_candidate.source_status_effective_at is not null
      and v_source.source_status_effective_at is not null
      and v_source.source_status_effective_at < v_candidate.source_status_effective_at then
      v_proposed_action := 'stale';
      v_reason := 'A newer FUSE status is already authoritative.';
    else
      v_proposed_action := 'version';
      v_reason := 'FUSE source fields changed; the current version will be closed.';
    end if;

    update core.itf_onboarding_import_row source
    set resolved_company_id = p_resolved_company_id,
        matched_roster_id = v_roster_id,
        matched_candidate_id = case when v_candidate.id is null then null else v_candidate.candidate_id end,
        proposed_action = v_proposed_action,
        reconciliation_reason = v_reason,
        decision = 'pending'
    where source.id = v_source.id;
  end loop;

  update core.itf_onboarding_import_batch batch
  set source_row_count = counts.total,
      proposed_change_count = counts.changes,
      review_count = counts.review,
      unchanged_count = counts.unchanged,
      ignored_count = counts.ignored,
      import_status = case
        when counts.pending_changes > 0 and batch.applied_count > 0 then 'partially_applied'
        when counts.pending_changes > 0 then 'reconciled'
        else batch.import_status
      end,
      applied_at = case when counts.pending_changes > 0 then null else batch.applied_at end
  from (
    select count(*)::integer total,
      count(*) filter (where proposed_action in ('insert', 'version'))::integer changes,
      count(*) filter (where proposed_action = 'review')::integer review,
      count(*) filter (where proposed_action in ('unchanged', 'stale'))::integer unchanged,
      count(*) filter (where proposed_action = 'ignore')::integer ignored,
      count(*) filter (
        where proposed_action in ('insert', 'version') and decision = 'pending'
      )::integer pending_changes
    from core.itf_onboarding_import_row
    where batch_id = p_batch_id
  ) counts
  where batch.id = p_batch_id;
end;
$$;

create or replace function core.itf_onboarding_batch_result(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'batchId', batch.id,
    'status', batch.import_status,
    'filename', batch.source_filename,
    'createdAt', batch.created_at,
    'appliedAt', batch.applied_at,
    'counts', jsonb_build_object(
      'total', batch.source_row_count,
      'changes', batch.proposed_change_count,
      'review', batch.review_count,
      'unchanged', batch.unchanged_count,
      'ignored', batch.ignored_count,
      'applied', batch.applied_count
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', source.id,
        'rowNumber', source.source_row_number,
        'candidate', source.full_name,
        'company', source.source_company_name,
        'resolvedCompanyId', source.resolved_company_id,
        'suggestedCompanyId', suggestion.company_id,
        'suggestedCompanyName', suggestion.company_name,
        'locationCode', source.location_code,
        'fuseStatus', source.fuse_status,
        'techId', source.tech_id,
        'fusePersonnelId', source.fuse_personnel_id,
        'matchedRosterId', source.matched_roster_id,
        'matchedCandidateId', coalesce(source.matched_candidate_id, applied.candidate_id),
        'action', source.proposed_action,
        'reason', source.reconciliation_reason,
        'decision', source.decision,
        'appliedVersionId', source.applied_version_id,
        'localDisposition', coalesce(current.local_disposition, applied.local_disposition)
      ) order by source.source_row_number)
      from core.itf_onboarding_import_row source
      left join core.itf_onboarding_candidate_version applied on applied.id = source.applied_version_id
      left join core.itf_onboarding_candidate_version current
        on current.workspace_company_id = batch.workspace_company_id
       and current.candidate_id = coalesce(source.matched_candidate_id, applied.candidate_id)
       and current.valid_to is null
      left join lateral (
        select
          (array_agg(candidate.company_id order by candidate.company_name))[1] as company_id,
          (array_agg(candidate.company_name order by candidate.company_name))[1] as company_name
        from (
          select distinct company.id as company_id, company.company_name
          from core.companies company
          join core.company_product company_product on company_product.company_id = company.id
          join ref.insight_products product
            on product.id = company_product.product_id
           and product.product_key = 'insight-telecom-fulfillment'
          where company.company_status = 'active'
            and company_product.participation_status in ('active', 'review', 'planned')
            and (
              core.itf_company_match_key(company.company_name) = core.itf_company_match_key(source.source_company_name)
              or (company.legal_name is not null and core.itf_company_match_key(company.legal_name) = core.itf_company_match_key(source.source_company_name))
              or exists (
                select 1
                from core.company_external_alias alias
                where alias.company_id = company.id
                  and core.itf_company_match_key(alias.source_value) = core.itf_company_match_key(source.source_company_name)
              )
            )
        ) candidate
        having count(*) = 1
      ) suggestion on source.resolved_company_id is null
      where source.batch_id = batch.id
    ), '[]'::jsonb)
  )
  from core.itf_onboarding_import_batch batch
  where batch.id = p_batch_id;
$$;

create or replace function public.itf_resolve_onboarding_company(
  p_company_slug text,
  p_batch_id uuid,
  p_source_company_name text,
  p_target_company_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_company_id uuid;
  v_target_company_id uuid;
  v_company_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select company.id
  into v_workspace_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug)
    and company.company_status = 'active';

  if v_workspace_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_workspace_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;

  v_company_key := core.itf_company_match_key(p_source_company_name);

  if p_target_company_id is not null then
    select company.id
    into v_target_company_id
    from core.companies company
    join core.company_product company_product on company_product.company_id = company.id
    join ref.insight_products product
      on product.id = company_product.product_id
     and product.product_key = 'insight-telecom-fulfillment'
    where company.id = p_target_company_id
      and company.company_status = 'active'
      and company_product.participation_status in ('active', 'review', 'planned')
      and (
        core.itf_company_match_key(company.company_name) = v_company_key
        or (company.legal_name is not null and core.itf_company_match_key(company.legal_name) = v_company_key)
        or exists (
          select 1 from core.company_external_alias alias
          where alias.company_id = company.id
            and core.itf_company_match_key(alias.source_value) = v_company_key
        )
      );

    if v_target_company_id is null then
      raise exception 'The selected company is not a unique source-name match.';
    end if;

    insert into core.company_external_alias (
      company_id, source_system, source_entity_type, source_value, alias_kind
    ) values (
      v_target_company_id, 'fuse-onboarding', 'company', btrim(p_source_company_name), 'fuse_onboarding'
    )
    on conflict (source_system, source_entity_type, source_value_normalized) do nothing;
  else
    select suggestion.company_id
    into v_target_company_id
    from (
      select distinct company.id as company_id
      from core.companies company
      join core.company_product company_product on company_product.company_id = company.id
      join ref.insight_products product
        on product.id = company_product.product_id
       and product.product_key = 'insight-telecom-fulfillment'
      where company.company_status = 'active'
        and company_product.participation_status in ('active', 'review', 'planned')
        and core.itf_company_match_key(company.company_name) = v_company_key
    ) suggestion
    limit 1;

    if v_target_company_id is not null then
      raise exception 'A matching catalogue company is available. Link it instead of creating a duplicate.';
    end if;
  end if;

  perform public.itf_add_onboarding_company(
    p_company_slug,
    p_batch_id,
    p_source_company_name
  );

  select alias.company_id
  into v_target_company_id
  from core.company_external_alias alias
  where alias.source_system = 'fuse-onboarding'
    and alias.source_entity_type = 'company'
    and alias.source_value_normalized = regexp_replace(lower(btrim(p_source_company_name)), '[^a-z0-9]+', '', 'g');

  perform core.itf_reconcile_onboarding_company_rows(
    p_batch_id,
    v_company_key,
    v_target_company_id
  );

  return core.itf_onboarding_batch_result(p_batch_id);
end;
$$;

revoke all on function core.itf_company_match_key(text) from public, anon, authenticated;
revoke all on function core.itf_reconcile_onboarding_company_rows(uuid, text, uuid) from public, anon, authenticated;
revoke all on function core.itf_onboarding_batch_result(uuid) from public, anon, authenticated;
revoke all on function public.itf_resolve_onboarding_company(text, uuid, text, uuid) from public, anon;
grant execute on function public.itf_resolve_onboarding_company(text, uuid, text, uuid) to authenticated;

commit;
