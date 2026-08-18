begin;

-- Applied inserts do not have a candidate match at reconciliation time. Resolve
-- the stable candidate ID through the applied version for the final receipt.
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
      left join core.itf_onboarding_candidate_version applied
        on applied.id = source.applied_version_id
      left join core.itf_onboarding_candidate_version current
        on current.workspace_company_id = batch.workspace_company_id
       and current.candidate_id = coalesce(source.matched_candidate_id, applied.candidate_id)
       and current.valid_to is null
      where source.batch_id = batch.id
    ), '[]'::jsonb)
  )
  from core.itf_onboarding_import_batch batch
  where batch.id = p_batch_id;
$$;

revoke all on function core.itf_onboarding_batch_result(uuid) from public, anon, authenticated;

commit;
