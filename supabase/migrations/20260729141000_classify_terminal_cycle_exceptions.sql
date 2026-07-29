-- A cycle that preserves usable files can still contain source-lane failures.
-- Elevate those retained terminal events into the request outcome so the
-- collection trail cannot present the cycle as a clean completion.

create or replace function core.classify_operations_terminal_exceptions()
returns trigger
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_download_failed_count integer := 0;
  v_source_unavailable_count integer := 0;
  v_needs_attention_count integer := 0;
  v_parts text[] := '{}'::text[];
begin
  if jsonb_typeof(new.output_receipt_json #> '{runtime,events}') <> 'array' then
    return new;
  end if;

  select
    count(*) filter (
      where upper(coalesce(event ->> 'event_type', '')) = 'DOWNLOAD_FAILED'
    )::integer,
    count(*) filter (
      where upper(coalesce(event ->> 'event_type', '')) = 'SOURCE_UNAVAILABLE'
    )::integer,
    count(*) filter (
      where upper(coalesce(event ->> 'event_type', '')) = 'NEEDS_ATTENTION'
    )::integer
  into
    v_download_failed_count,
    v_source_unavailable_count,
    v_needs_attention_count
  from jsonb_array_elements(
    new.output_receipt_json #> '{runtime,events}'
  ) event;

  if v_download_failed_count > 0 then
    v_parts := array_append(
      v_parts,
      format(
        '%s requested report download%s failed',
        v_download_failed_count,
        case when v_download_failed_count = 1 then '' else 's' end
      )
    );
  end if;

  if v_source_unavailable_count > 0 then
    v_parts := array_append(
      v_parts,
      format(
        '%s requested source export%s %s unavailable',
        v_source_unavailable_count,
        case when v_source_unavailable_count = 1 then '' else 's' end,
        case when v_source_unavailable_count = 1 then 'was' else 'were' end
      )
    );
  end if;

  if v_needs_attention_count > 0 then
    v_parts := array_append(
      v_parts,
      format(
        '%s collection lane%s require%s attention',
        v_needs_attention_count,
        case when v_needs_attention_count = 1 then '' else 's' end,
        case when v_needs_attention_count = 1 then 's' else '' end
      )
    );
  end if;

  if cardinality(v_parts) > 0
    and nullif(trim(coalesce(new.error_message, '')), '') is null then
    new.error_message :=
      'Collection completed with exceptions: '
      || array_to_string(v_parts, '; ')
      || '.';
  end if;

  return new;
end;
$$;

drop trigger if exists operations_terminal_exception_classification_trg
  on core.operations_collection_request;
create trigger operations_terminal_exception_classification_trg
before insert or update of output_receipt_json
on core.operations_collection_request
for each row
execute function core.classify_operations_terminal_exceptions();

-- Re-run retained receipts through the classifier so existing misclassified
-- cycles become visible without another collection.
update core.operations_collection_request
set output_receipt_json = output_receipt_json
where error_message is null
  and jsonb_typeof(output_receipt_json #> '{runtime,events}') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(
      output_receipt_json #> '{runtime,events}'
    ) event
    where upper(coalesce(event ->> 'event_type', '')) in (
      'DOWNLOAD_FAILED',
      'SOURCE_UNAVAILABLE',
      'NEEDS_ATTENTION'
    )
  );

revoke all on function core.classify_operations_terminal_exceptions()
  from public, anon, authenticated;
grant execute on function core.classify_operations_terminal_exceptions()
  to service_role;
