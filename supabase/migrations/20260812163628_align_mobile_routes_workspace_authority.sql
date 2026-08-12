begin;

-- Route baseline management is one governed workspace in web and native.
-- This does not affect universal driver inspection submission authority.
create or replace function core.can_manage_routes(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.can_use_company_workspace(p_company_id, 'routes');
$$;

revoke all on function core.can_manage_routes(uuid) from public, anon;
grant execute on function core.can_manage_routes(uuid) to authenticated, service_role;

drop policy if exists route_baseline_insert on public.route_baseline;
create policy route_baseline_insert on public.route_baseline
for insert to authenticated with check (core.can_manage_routes(company_id));

drop policy if exists route_baseline_update on public.route_baseline;
create policy route_baseline_update on public.route_baseline
for update to authenticated
using (core.can_manage_routes(company_id))
with check (core.can_manage_routes(company_id));

drop policy if exists route_baseline_delete on public.route_baseline;
create policy route_baseline_delete on public.route_baseline
for delete to authenticated using (core.can_manage_routes(company_id));

create or replace function public.save_company_route_baseline(
  p_company_slug text,
  p_route_id uuid,
  p_route_name text,
  p_current_wa_num text,
  p_route_location text,
  p_route_type text,
  p_threshold_stops integer,
  p_threshold_rate numeric,
  p_runs_s boolean,
  p_runs_u boolean,
  p_runs_m boolean,
  p_runs_t boolean,
  p_runs_w boolean,
  p_runs_h boolean,
  p_runs_f boolean,
  p_rotation_name text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_terminal_id uuid;
  v_current public.route_baseline%rowtype;
  v_today date := current_date;
  v_new_id uuid;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null then raise exception 'ACTIVE_COMPANY_REQUIRED'; end if;
  if not core.can_manage_routes(v_company_id) then raise exception 'ROUTES_GRANT_REQUIRED'; end if;
  if nullif(btrim(p_route_name), '') is null then raise exception 'ROUTE_NAME_REQUIRED'; end if;
  if upper(coalesce(p_route_type, 'CORE')) not in ('CORE', 'PEAK', 'OVERFLOW') then raise exception 'INVALID_ROUTE_TYPE'; end if;
  if coalesce(p_threshold_stops, 0) < 0 or coalesce(p_threshold_rate, 0) < 0 then raise exception 'INVALID_ROUTE_THRESHOLD'; end if;
  if not (coalesce(p_runs_s, false) or coalesce(p_runs_u, false) or coalesce(p_runs_m, false) or coalesce(p_runs_t, false) or coalesce(p_runs_w, false) or coalesce(p_runs_h, false) or coalesce(p_runs_f, false)) then
    raise exception 'ROUTE_RUN_DAY_REQUIRED';
  end if;

  if p_route_id is not null then
    select route.* into v_current
    from public.route_baseline route
    where route.id = p_route_id and route.company_id = v_company_id and route.effective_end is null
    for update;
    if v_current.id is null then raise exception 'CURRENT_ROUTE_BASELINE_REQUIRED'; end if;
    v_terminal_id := v_current.terminal_id;
    update public.route_baseline
    set effective_end = v_today - 1, updated_at = pg_catalog.now()
    where id = v_current.id;
  else
    select terminal.terminal_id into v_terminal_id
    from public.company_terminal terminal
    where terminal.company_id = v_company_id and terminal.is_active = true
    order by terminal.created_at, terminal.terminal_id limit 1;
    if v_terminal_id is null then raise exception 'ACTIVE_TERMINAL_REQUIRED'; end if;
  end if;

  insert into public.route_baseline (
    company_id, terminal_id, route_name, current_wa_num, route_location, route_type,
    threshold_stops, threshold_rate, runs_s, runs_u, runs_m, runs_t, runs_w, runs_h, runs_f,
    rotation_name, is_active, effective_start, effective_end
  ) values (
    v_company_id, v_terminal_id, btrim(p_route_name), nullif(btrim(p_current_wa_num), ''),
    nullif(btrim(p_route_location), ''), upper(coalesce(p_route_type, 'CORE')),
    p_threshold_stops, p_threshold_rate, coalesce(p_runs_s, false), coalesce(p_runs_u, false),
    coalesce(p_runs_m, false), coalesce(p_runs_t, false), coalesce(p_runs_w, false),
    coalesce(p_runs_h, false), coalesce(p_runs_f, false), nullif(btrim(p_rotation_name), ''),
    coalesce(p_is_active, true), v_today, null
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.save_company_route_baseline(text, uuid, text, text, text, text, integer, numeric, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean) is
  'Creates or versions a company route baseline under the shared Routes workspace grant.';

revoke all on function public.save_company_route_baseline(text, uuid, text, text, text, text, integer, numeric, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean)
  from public, anon;
grant execute on function public.save_company_route_baseline(text, uuid, text, text, text, text, integer, numeric, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean)
  to authenticated, service_role;

commit;
