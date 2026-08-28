begin;

create or replace function public.complete_internal_map_road_pack(
  p_pack_id uuid,
  p_expected_feature_count integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pack ref.internal_map_road_pack%rowtype;
  v_count integer;
begin
  select pack.* into v_pack
  from ref.internal_map_road_pack pack
  where pack.id = p_pack_id
  for update;

  if v_pack.id is null then
    raise exception 'A known road pack is required.' using errcode = '22023';
  end if;

  if v_pack.status = 'READY' then
    if v_pack.feature_count <> p_expected_feature_count then
      raise exception 'Completed road pack count mismatch: expected %, retained %.', p_expected_feature_count, v_pack.feature_count
        using errcode = '22023';
    end if;
    return v_pack.feature_count;
  end if;

  if v_pack.status <> 'IMPORTING' then
    raise exception 'An importing road pack is required.' using errcode = '22023';
  end if;

  select count(*)::integer into v_count
  from ref.internal_map_road_segment segment
  where segment.pack_id = p_pack_id;

  if v_count <> p_expected_feature_count then
    raise exception 'Road pack count mismatch: expected %, retained %.', p_expected_feature_count, v_count
      using errcode = '22023';
  end if;

  delete from ref.internal_map_road_pack pack
  where pack.state_fips = v_pack.state_fips
    and pack.county_fips = v_pack.county_fips
    and pack.id <> p_pack_id;

  update ref.internal_map_road_pack
  set status = 'READY', feature_count = v_count, completed_at = now()
  where id = p_pack_id;

  return v_count;
end;
$$;

commit;
