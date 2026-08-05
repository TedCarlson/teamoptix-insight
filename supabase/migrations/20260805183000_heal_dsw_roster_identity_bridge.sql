create or replace function core.resolve_roster_identity(
  p_company_id uuid,
  p_driver_name text,
  p_dswid text,
  p_fx_id text
)
returns uuid
language sql
stable
set search_path = core, public
as $$
  with input as (
    select
      nullif(regexp_replace(upper(coalesce(p_dswid, '')), '[^A-Z0-9]+', '', 'g'), '') as dswid_exact,
      nullif(regexp_replace(upper(coalesce(p_fx_id, '')), '[^A-Z0-9]+', '', 'g'), '') as fx_exact,
      nullif(regexp_replace(upper(coalesce(p_driver_name, '')), '[^A-Z0-9]+', '', 'g'), '') as name_exact,
      coalesce(
        nullif(public.payroll_dsw_bridge_key(p_dswid), ''),
        nullif(public.payroll_dsw_bridge_key(p_driver_name), '')
      ) as driver_bridge_key
  ),
  candidates as (
    select
      roster.id,
      case
        when input.dswid_exact is not null
          and regexp_replace(upper(coalesce(ops.dswid, '')), '[^A-Z0-9]+', '', 'g') = input.dswid_exact
          then 1
        when input.fx_exact is not null
          and regexp_replace(upper(coalesce(ops.fx_id, '')), '[^A-Z0-9]+', '', 'g') = input.fx_exact
          then 2
        when input.driver_bridge_key is not null
          and public.payroll_dsw_bridge_key(ops.dswid) = input.driver_bridge_key
          then 3
        when input.name_exact is not null
          and regexp_replace(upper(coalesce(roster.full_name, '')), '[^A-Z0-9]+', '', 'g') = input.name_exact
          then 4
        when input.driver_bridge_key is not null
          and public.payroll_dsw_bridge_key(roster.full_name) = input.driver_bridge_key
          then 5
        else null
      end as match_rank
    from core.company_roster roster
    left join core.company_roster_operations_fact ops
      on ops.roster_id = roster.id
    cross join input
    where roster.company_id = p_company_id
  ),
  unambiguous as (
    select
      id,
      match_rank,
      count(*) over (partition by match_rank) as candidate_count
    from candidates
    where match_rank is not null
  )
  select id
  from unambiguous
  where candidate_count = 1
  order by match_rank
  limit 1;
$$;

do $$
declare
  v_updated integer := 0;
begin
  with resolved as materialized (
    select
      raw.id,
      core.resolve_roster_identity(
        raw.company_id,
        coalesce(
          nullif(raw.normalized_row_json ->> 'driver_name', ''),
          raw.source_driver_name
        ),
        coalesce(raw.source_dswid, raw.source_driver_name),
        null
      ) as roster_id
    from core.operations_report_raw_row raw
    join core.operations_report_batch batch
      on batch.id = raw.batch_id
    where batch.report_family_key = 'DSW'
      and raw.row_kind = 'ROUTE'
      and raw.matched_roster_member_id is null
      and coalesce(
        nullif(raw.source_dswid, ''),
        nullif(raw.source_driver_name, ''),
        nullif(raw.normalized_row_json ->> 'driver_name', '')
      ) is not null
  )
  update core.operations_report_raw_row raw
  set
    matched_roster_member_id = resolved.roster_id,
    match_method = 'DSW_BRIDGE_KEY',
    match_confidence = 0.95
  from resolved
  where raw.id = resolved.id
    and resolved.roster_id is not null;

  get diagnostics v_updated = row_count;
  raise notice 'Healed % DSW route ownership rows.', v_updated;
end;
$$;

notify pgrst, 'reload schema';
