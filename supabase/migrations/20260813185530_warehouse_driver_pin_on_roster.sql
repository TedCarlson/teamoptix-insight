-- Driver PIN authority
--
-- PIN is a roster-member value. Assets can display it through their current
-- assignment, but asset inventory is not an authority for the value.

begin;

-- Preserve legacy PIN data before cutting reads over. A driver's existing
-- roster PIN always wins. Dedicated legacy PIN assets are preferred over a
-- fuel card's secondary identifier when both old representations exist.
with legacy_pin_candidates as (
  select
    asset.assigned_roster_member_id as roster_id,
    nullif(btrim(asset.asset_identifier), '') as pin_id_no,
    1 as source_priority,
    asset.updated_at
  from core.asset asset
  join core.asset_type asset_type
    on asset_type.id = asset.asset_type_id
  where asset_type.asset_type_key = 'PIN'
    and asset.assigned_roster_member_id is not null
    and nullif(btrim(asset.asset_identifier), '') is not null

  union all

  select
    asset.assigned_roster_member_id as roster_id,
    nullif(btrim(asset.secondary_identifier), '') as pin_id_no,
    2 as source_priority,
    asset.updated_at
  from core.asset asset
  join core.asset_type asset_type
    on asset_type.id = asset.asset_type_id
  where asset_type.asset_type_key = 'FUEL_CARD'
    and asset.assigned_roster_member_id is not null
    and nullif(btrim(asset.secondary_identifier), '') is not null
),
preferred_legacy_pin as (
  select distinct on (candidate.roster_id)
    candidate.roster_id,
    candidate.pin_id_no
  from legacy_pin_candidates candidate
  order by
    candidate.roster_id,
    candidate.source_priority,
    candidate.updated_at desc nulls last
)
insert into core.company_roster_operations_fact (
  roster_id,
  pin_id_no,
  updated_at
)
select
  candidate.roster_id,
  candidate.pin_id_no,
  now()
from preferred_legacy_pin candidate
on conflict (roster_id) do update set
  pin_id_no = excluded.pin_id_no,
  updated_at = now()
where nullif(
  btrim(core.company_roster_operations_fact.pin_id_no),
  ''
) is null;

-- Roster imports still call this compatibility bridge for all three old
-- resource columns. Route PIN directly to the roster operations fact and do
-- not manufacture or assign a PIN asset. Scanner and fuel-card behavior stays
-- unchanged.
create or replace function core.ensure_and_assign_company_asset(
  p_company_slug text,
  p_roster_id uuid,
  p_asset_type_key text,
  p_asset_identifier text
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_asset_type_id uuid;
  v_asset_id uuid;
  v_existing_asset_id uuid;
  v_employment_status text;
  v_asset_type_key text := upper(trim(coalesce(p_asset_type_key, '')));
  v_asset_identifier text := nullif(trim(coalesce(p_asset_identifier, '')), '');
begin
  if v_asset_identifier is null or v_asset_type_key is null then
    return jsonb_build_object('ok', true, 'asset_id', null, 'assigned', false);
  end if;

  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = p_roster_id
      and roster.company_id = v_company_id
  ) then
    raise exception 'Roster record not found';
  end if;

  if v_asset_type_key = 'PIN' then
    insert into core.company_roster_operations_fact (
      roster_id,
      pin_id_no,
      updated_at
    ) values (
      p_roster_id,
      v_asset_identifier,
      now()
    )
    on conflict (roster_id) do update set
      pin_id_no = excluded.pin_id_no,
      updated_at = now();

    return jsonb_build_object(
      'ok', true,
      'asset_id', null,
      'assigned', false,
      'stored_on', 'company_roster_operations_fact'
    );
  end if;

  insert into core.asset_type (
    asset_type_key,
    asset_type_label,
    description,
    is_active
  ) values (
    v_asset_type_key,
    case
      when v_asset_type_key = 'SCANNER' then 'Scanner'
      when v_asset_type_key = 'FUEL_CARD' then 'Fuel Card'
      else initcap(lower(v_asset_type_key))
    end,
    'Imported via roster reconciliation.',
    true
  )
  on conflict (asset_type_key) do nothing;

  insert into core.asset_status (
    status_key,
    status_label,
    status_group,
    is_assignable,
    is_active
  ) values
    ('AVAILABLE', 'Available', 'AVAILABLE', true, true),
    ('ASSIGNED', 'Assigned', 'ASSIGNED', true, true)
  on conflict (status_key) do nothing;

  select id into v_asset_type_id
  from core.asset_type
  where asset_type_key = v_asset_type_key;

  if v_asset_type_id is null then
    raise exception 'Asset type not found';
  end if;

  select id into v_existing_asset_id
  from core.asset
  where company_id = v_company_id
    and asset_type_id = v_asset_type_id
    and lower(asset_identifier) = lower(v_asset_identifier)
  order by created_at desc
  limit 1;

  if v_existing_asset_id is null then
    select (public.upsert_company_asset_admin(
      p_company_slug := p_company_slug,
      p_asset_id := null,
      p_asset_type_key := v_asset_type_key,
      p_asset_identifier := v_asset_identifier,
      p_asset_status_key := 'AVAILABLE',
      p_asset_provider_id := null,
      p_secondary_identifier := null,
      p_notes := 'Imported via roster reconciliation.',
      p_assignment_muted := false
    )->>'asset_id')::uuid into v_asset_id;
  else
    select (public.upsert_company_asset_admin(
      p_company_slug := p_company_slug,
      p_asset_id := v_existing_asset_id,
      p_asset_type_key := v_asset_type_key,
      p_asset_identifier := v_asset_identifier,
      p_asset_status_key := 'AVAILABLE',
      p_asset_provider_id := null,
      p_secondary_identifier := null,
      p_notes := 'Imported via roster reconciliation.',
      p_assignment_muted := false
    )->>'asset_id')::uuid into v_asset_id;
  end if;

  select employment_status into v_employment_status
  from core.company_roster
  where id = p_roster_id
    and company_id = v_company_id;

  if v_employment_status in ('Active', 'Trainee') then
    perform public.assign_company_asset(
      p_company_slug,
      v_asset_id,
      p_roster_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'asset_id', v_asset_id,
    'assigned', v_employment_status in ('Active', 'Trainee')
  );
end;
$$;

comment on function core.ensure_and_assign_company_asset(text, uuid, text, text)
is
  'Compatibility bridge for roster imports. Scanner and fuel-card values create assigned assets; PIN is stored only on the roster operations fact.';

commit;
