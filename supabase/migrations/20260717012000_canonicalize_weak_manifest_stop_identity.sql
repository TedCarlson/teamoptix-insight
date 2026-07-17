create or replace function core.operations_delivery_stop_identity(
  p_st_number text,
  p_sid text,
  p_recipient text,
  p_contact_name text,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_delivery_time_begin text,
  p_delivery_time_end text
)
returns text
language sql
immutable
set search_path to 'core', 'public'
as $$
  select case
    when nullif(btrim(p_sid), '') is not null
    then concat('SID|', upper(btrim(p_sid)))
    when nullif(concat_ws(
      '',
      btrim(coalesce(p_address_line_1, '')),
      btrim(coalesce(p_address_line_2, '')),
      btrim(coalesce(p_city, '')),
      btrim(coalesce(p_postal_code, '')),
      btrim(coalesce(p_recipient, '')),
      btrim(coalesce(p_contact_name, '')),
      btrim(coalesce(p_delivery_time_begin, '')),
      btrim(coalesce(p_delivery_time_end, ''))
    ), '') is not null
    then concat_ws(
      '|',
      'DETAIL',
      upper(regexp_replace(btrim(coalesce(p_address_line_1, '')), '\s+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(p_address_line_2, '')), '\s+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(p_city, '')), '\s+', ' ', 'g')),
      upper(btrim(coalesce(p_state, ''))),
      upper(btrim(coalesce(p_postal_code, ''))),
      upper(regexp_replace(btrim(coalesce(p_recipient, '')), '\s+', ' ', 'g')),
      upper(regexp_replace(btrim(coalesce(p_contact_name, '')), '\s+', ' ', 'g')),
      btrim(coalesce(p_delivery_time_begin, '')),
      btrim(coalesce(p_delivery_time_end, ''))
    )
    else concat('STOP|', upper(coalesce(nullif(btrim(p_st_number), ''), 'UNKNOWN')))
  end;
$$;

with identified as (
  select
    stop.id,
    core.operations_delivery_stop_identity(
      stop.st_number,
      stop.sid,
      stop.recipient,
      stop.contact_name,
      stop.address_line_1,
      stop.address_line_2,
      stop.city,
      stop.state,
      stop.postal_code,
      stop.delivery_time_begin,
      stop.delivery_time_end
    ) as canonical_identity,
    row_number() over (
      partition by
        stop.company_id,
        stop.service_date,
        stop.route_key,
        core.operations_delivery_stop_identity(
          stop.st_number,
          stop.sid,
          stop.recipient,
          stop.contact_name,
          stop.address_line_1,
          stop.address_line_2,
          stop.city,
          stop.state,
          stop.postal_code,
          stop.delivery_time_begin,
          stop.delivery_time_end
        )
      order by stop.created_at desc, stop.id desc
    ) as identity_rank
  from core.operations_delivery_manifest_stop stop
)
delete from core.operations_delivery_manifest_stop stop
using identified
where stop.id = identified.id
  and identified.identity_rank > 1;

update core.operations_delivery_manifest_stop stop
set stop_identity_key = core.operations_delivery_stop_identity(
  stop.st_number,
  stop.sid,
  stop.recipient,
  stop.contact_name,
  stop.address_line_1,
  stop.address_line_2,
  stop.city,
  stop.state,
  stop.postal_code,
  stop.delivery_time_begin,
  stop.delivery_time_end
);

create or replace function core.set_operations_delivery_stop_identity()
returns trigger
language plpgsql
set search_path to 'core', 'public'
as $$
begin
  new.stop_identity_key := core.operations_delivery_stop_identity(
    new.st_number,
    new.sid,
    new.recipient,
    new.contact_name,
    new.address_line_1,
    new.address_line_2,
    new.city,
    new.state,
    new.postal_code,
    new.delivery_time_begin,
    new.delivery_time_end
  );
  return new;
end;
$$;

drop trigger if exists operations_delivery_stop_identity_trg
  on core.operations_delivery_manifest_stop;

create trigger operations_delivery_stop_identity_trg
before insert or update of
  st_number,
  sid,
  recipient,
  contact_name,
  address_line_1,
  address_line_2,
  city,
  state,
  postal_code,
  delivery_time_begin,
  delivery_time_end
on core.operations_delivery_manifest_stop
for each row
execute function core.set_operations_delivery_stop_identity();

grant execute on function core.operations_delivery_stop_identity(
  text, text, text, text, text, text, text, text, text, text, text
) to service_role;
