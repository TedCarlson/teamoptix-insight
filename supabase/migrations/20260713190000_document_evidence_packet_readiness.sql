begin;

update legal.document_vault_item
set
  storage_status = case
    when pdf_storage_path is not null and btrim(pdf_storage_path) <> '' then 'PDF_STORED'
    else 'PDF_PENDING'
  end,
  storage_path = coalesce(
    storage_path,
    '/teamoptix/business/contracts/vault/' || id::text || '/evidence'
  ),
  checksum = coalesce(
    checksum,
    md5(
      coalesce(content_snapshot::text, '') ||
      coalesce(accepted_at::text, '') ||
      id::text
    )
  ),
  updated_at = now()
where artifact_type = 'ACCEPTANCE_RECORD';

commit;
