-- Manual release gate for the Driver Scorecard materialized read model.
--
-- Apply the foundation migration first, run the targeted rebuild for each
-- contract with retained FINAL DSW evidence, verify the readiness query below,
-- and only then run this file. It intentionally lives outside migrations so a
-- routine `supabase db push` cannot cut live reads over before facts exist.

begin;

do $$
begin
  if exists (
    select 1
    from core.company_contract_config config
    where exists (
      select 1
      from core.operations_report_batch batch
      where batch.company_id = config.company_id
        and batch.report_family_key = 'DSW'
        and batch.snapshot_kind = 'FINAL'
        and batch.status = 'LOADED'
        and batch.service_date >= config.effective_start_date
        and (
          config.effective_end_date is null
          or batch.service_date <= config.effective_end_date
        )
    )
    and not exists (
      select 1
      from core.driver_scorecard_snapshot snapshot
      where snapshot.company_id = config.company_id
        and snapshot.contract_id = config.id
    )
  ) then
    raise exception using
      message = 'Driver Scorecard read cutover blocked: one or more DSW contracts have no persisted snapshots.',
      hint = 'Run core.rebuild_company_driver_scorecard_facts for each missing contract, verify it, then retry this cutover.';
  end if;
end;
$$;

create or replace function public.get_company_driver_scorecard_index(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_as_of_date date
)
returns jsonb
language sql
stable
security definer
set search_path = core, public
as $$
  select core.get_company_driver_scorecard_index_materialized(
    p_company_id, p_start_date, p_end_date, p_as_of_date
  );
$$;

create or replace function public.get_company_driver_scorecard_detail(
  p_company_id uuid,
  p_roster_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
  service_date date,
  route_name text,
  wa_number text,
  delivery_stops numeric,
  delivery_packages numeric,
  pickup_stops numeric,
  pickup_packages numeric,
  early_pickups numeric,
  late_pickups numeric,
  potential_missed_pickups numeric,
  exceptions numeric,
  code_85 numeric,
  dna numeric,
  send_again numeric,
  required_signature numeric,
  miles numeric,
  road_hours numeric,
  duty_hours numeric,
  observed_ils numeric
)
language sql
stable
security definer
set search_path = core, public
as $$
  select *
  from core.get_company_driver_scorecard_detail_materialized(
    p_company_id, p_roster_id, p_start_date, p_end_date
  );
$$;

revoke all on function public.get_company_driver_scorecard_index(uuid, date, date, date) from public;
revoke all on function public.get_company_driver_scorecard_detail(uuid, uuid, date, date) from public;
grant execute on function public.get_company_driver_scorecard_index(uuid, date, date, date) to authenticated, service_role;
grant execute on function public.get_company_driver_scorecard_detail(uuid, uuid, date, date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
