-- Continuous collection submits one information-dense terminal receipt. Persist
-- its bounded runner events into the shared ledger in the same transaction so
-- diagnostics do not require recurring telemetry writes.

create or replace function core.persist_operations_terminal_receipt_events()
returns trigger
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_event jsonb;
  v_ordinality bigint;
  v_event_type text;
  v_stage text;
  v_attempt_number integer;
  v_duration_ms integer;
  v_metadata jsonb;
begin
  if jsonb_typeof(new.output_receipt_json #> '{runtime,events}') <> 'array' then
    return new;
  end if;

  for v_event, v_ordinality in
    select value, ordinality
    from jsonb_array_elements(
      new.output_receipt_json #> '{runtime,events}'
    ) with ordinality
  loop
    begin
      if jsonb_typeof(v_event) <> 'object' then
        continue;
      end if;

      v_event_type := upper(
        coalesce(nullif(trim(v_event ->> 'event_type'), ''), 'PROGRESS')
      );
      v_stage := upper(
        coalesce(nullif(trim(v_event ->> 'stage'), ''), 'COLLECTION')
      );
      v_attempt_number := case
        when coalesce(v_event ->> 'attempt_number', '') ~ '^\d+$'
          then greatest((v_event ->> 'attempt_number')::integer, 1)
        else 1
      end;
      v_duration_ms := case
        when coalesce(v_event ->> 'duration_ms', '') ~ '^\d+$'
          then (v_event ->> 'duration_ms')::integer
        else null
      end;
      v_metadata := case
        when jsonb_typeof(v_event -> 'metadata') = 'object'
          then v_event -> 'metadata'
        else '{}'::jsonb
      end;

      insert into core.operations_collection_runtime_event (
        collection_request_id,
        idempotency_key,
        source_system,
        event_type,
        stage,
        lane_key,
        artifact_execution_key,
        artifact_key,
        route_identity,
        attempt_number,
        outcome,
        occurred_at,
        duration_ms,
        metadata_json
      ) values (
        new.id,
        'runner:terminal:' || new.id::text || ':' || v_ordinality::text
          || ':' || v_event_type,
        'RUNNER',
        v_event_type,
        v_stage,
        nullif(trim(v_event ->> 'lane_key'), ''),
        nullif(trim(v_event ->> 'artifact_execution_key'), ''),
        nullif(trim(v_event ->> 'artifact_key'), ''),
        nullif(trim(v_event ->> 'route_identity'), ''),
        v_attempt_number,
        nullif(upper(trim(v_event ->> 'outcome')), ''),
        coalesce(
          nullif(v_event ->> 'occurred_at', '')::timestamptz,
          new.completed_at,
          new.updated_at
        ),
        v_duration_ms,
        v_metadata
      )
      on conflict (idempotency_key) do update set
        outcome = excluded.outcome,
        duration_ms = excluded.duration_ms,
        metadata_json =
          core.operations_collection_runtime_event.metadata_json
          || excluded.metadata_json;
    exception
      when others then
        -- A malformed optional diagnostic event must never prevent the
        -- authoritative terminal receipt from being stored.
        continue;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists operations_terminal_receipt_events_trg
  on core.operations_collection_request;
create trigger operations_terminal_receipt_events_trg
after insert or update of output_receipt_json
on core.operations_collection_request
for each row
execute function core.persist_operations_terminal_receipt_events();

-- Repair the known 2026-07-29 Previous Day Close receipt from the retained VPS
-- journal. This is operational evidence, not an inferred business outcome.
update core.operations_collection_request
set
  error_message =
    'Chrome did not complete its local browser-session handshake before the 120-second timeout.',
  output_receipt_json =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(output_receipt_json, '{}'::jsonb),
          '{error,message}',
          to_jsonb(
            'Chrome did not complete its local browser-session handshake before the 120-second timeout.'
            ::text
          ),
          true
        ),
        '{error,evidence}',
        jsonb_build_object(
          'stage', 'BROWSER_STARTUP',
          'summary',
            'Chrome did not complete its local browser-session handshake before the 120-second timeout.',
          'exception_type', 'urllib3.exceptions.ReadTimeoutError',
          'technical_message',
            'HTTPConnectionPool on localhost timed out while Selenium started a Chrome session (read timeout 120 seconds).',
          'source_logs',
            jsonb_build_array('specific_date_2026-07-29_07_00_09.log'),
          'log_excerpt',
            jsonb_build_array(
              'Traceback: scrape_particular_date.py failed in getDriver().',
              'Selenium timed out in start_session while opening Chrome.',
              'urllib3.exceptions.ReadTimeoutError: local ChromeDriver connection timed out after 120 seconds.',
              '[runner] governed date exit status=1 service_date=2026-07-28 produced_count=0 elapsed_seconds=136'
            ),
          'excerpt_truncated', true,
          'captured_at', '2026-07-29T07:02:23Z'
        ),
        true
      ),
      '{diagnostics}',
      jsonb_build_object(
        'capture', 'RECOVERED_FROM_VPS_JOURNAL',
        'source_logs',
          jsonb_build_array('specific_date_2026-07-29_07_00_09.log'),
        'log_excerpt',
          jsonb_build_array(
            'Traceback: scrape_particular_date.py failed in getDriver().',
            'Selenium timed out in start_session while opening Chrome.',
            'urllib3.exceptions.ReadTimeoutError: local ChromeDriver connection timed out after 120 seconds.'
          ),
        'excerpt_truncated', true
      ),
      true
    )
    || jsonb_build_object(
      'runtime',
      coalesce(output_receipt_json -> 'runtime', '{}'::jsonb)
        || jsonb_build_object(
          'events',
          coalesce(output_receipt_json #> '{runtime,events}', '[]'::jsonb)
            || jsonb_build_array(
              jsonb_build_object(
                'event_type', 'COLLECTION_FAILED',
                'stage', 'BROWSER_STARTUP',
                'occurred_at', '2026-07-29T07:02:23Z',
                'outcome', 'FAILED',
                'duration_ms', 138000,
                'metadata', jsonb_build_object(
                  'summary',
                    'Chrome did not complete its local browser-session handshake before the 120-second timeout.',
                  'exception_type', 'urllib3.exceptions.ReadTimeoutError'
                )
              )
            )
        )
    ),
  updated_at = greatest(updated_at, '2026-07-29T07:02:23Z'::timestamptz)
where id = '99df8fd0-bf94-453b-8390-7251671edf4d'
  and error_message = 'Collector exited with status 1.';

-- Backfill any runner events already present in existing terminal receipts.
update core.operations_collection_request
set output_receipt_json = output_receipt_json
where jsonb_typeof(output_receipt_json #> '{runtime,events}') = 'array'
  and jsonb_array_length(output_receipt_json #> '{runtime,events}') > 0;

revoke all on function core.persist_operations_terminal_receipt_events()
  from public, anon, authenticated;
grant execute on function core.persist_operations_terminal_receipt_events()
  to service_role;
