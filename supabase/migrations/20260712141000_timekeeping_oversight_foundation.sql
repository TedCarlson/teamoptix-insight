-- Timekeeping oversight lifecycle foundation.
-- Default remains off so stepped customer onboarding can rely on DSW-generated evidence
-- before driver-facing discrepancy correction is activated.

alter table core.company_operations_config
  add column if not exists timekeeping_oversight_mode text not null default 'off';

alter table core.company_operations_config
  drop constraint if exists company_operations_config_timekeeping_oversight_mode_chk;

alter table core.company_operations_config
  add constraint company_operations_config_timekeeping_oversight_mode_chk
  check (timekeeping_oversight_mode in ('off', 'signal_only', 'driver_correction', 'blocking'));

create or replace function core.get_company_operations_config(p_company_slug text)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_config core.company_operations_config;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  insert into core.company_operations_config (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  select * into v_config
  from core.company_operations_config
  where company_id = v_company_id;

  return jsonb_build_object(
    'company_id', v_company_id,
    'route_sort_key', v_config.route_sort_key,
    'route_sort_direction', v_config.route_sort_direction,
    'timekeeping_oversight_mode', v_config.timekeeping_oversight_mode
  );
end;
$$;

create or replace function core.update_company_timekeeping_config(
  p_company_slug text,
  p_timekeeping_oversight_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_mode text;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not core.can_admin_company(v_company_id) then
    raise exception 'Forbidden.';
  end if;

  v_mode := coalesce(nullif(p_timekeeping_oversight_mode, ''), 'off');

  if v_mode not in ('off', 'signal_only', 'driver_correction', 'blocking') then
    raise exception 'Unsupported timekeeping oversight mode.';
  end if;

  insert into core.company_operations_config (
    company_id,
    timekeeping_oversight_mode,
    updated_at
  )
  values (
    v_company_id,
    v_mode,
    now()
  )
  on conflict (company_id) do update set
    timekeeping_oversight_mode = excluded.timekeeping_oversight_mode,
    updated_at = now();

  return core.get_company_operations_config(p_company_slug);
end;
$$;

create or replace function public.update_company_timekeeping_config(
  p_company_slug text,
  p_timekeeping_oversight_mode text
)
returns jsonb
language sql
security definer
set search_path = core, public
as $$
  select core.update_company_timekeeping_config(
    p_company_slug,
    p_timekeeping_oversight_mode
  );
$$;

revoke all on function public.update_company_timekeeping_config(text, text) from public;
grant all on function public.update_company_timekeeping_config(text, text) to authenticated;
grant all on function public.update_company_timekeeping_config(text, text) to service_role;
grant all on function core.update_company_timekeeping_config(text, text) to authenticated;
