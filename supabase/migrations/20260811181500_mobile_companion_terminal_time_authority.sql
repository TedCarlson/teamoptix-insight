begin;

-- Mobile operating surfaces never derive the service date from a handset.
-- The database clock, interpreted through the company's active terminal
-- timezone, is the authority shared by Dispatch, Service, and driver events.
create or replace function public.mobile_companion_terminal_time_authority(
  p_company_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_company_id uuid;
  v_terminal_id uuid;
  v_terminal_code text;
  v_timezone text;
  v_server_now timestamptz;
  v_service_date date;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select profile.id
  into v_profile_id
  from core.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.profile_status = 'active'
  limit 1;

  if v_profile_id is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug))
    and company.company_status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'ACTIVE_COMPANY_REQUIRED';
  end if;

  if not core.is_platform_owner()
     and not exists (
       select 1
       from core.company_memberships membership
       where membership.company_id = v_company_id
         and membership.profile_id = v_profile_id
         and membership.membership_status = 'active'
     ) then
    raise exception 'ACTIVE_COMPANY_MEMBERSHIP_REQUIRED';
  end if;

  select terminal.terminal_id, terminal.terminal_code, terminal.timezone
  into v_terminal_id, v_terminal_code, v_timezone
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
    and nullif(btrim(terminal.timezone), '') is not null
  order by terminal.created_at, terminal.terminal_id
  limit 1;

  if v_terminal_id is null or nullif(btrim(v_timezone), '') is null then
    raise exception 'ACTIVE_TERMINAL_TIMEZONE_REQUIRED';
  end if;

  v_server_now := pg_catalog.now();
  v_service_date := (v_server_now at time zone v_timezone)::date;

  return jsonb_build_object(
    'company_id', v_company_id,
    'terminal_id', v_terminal_id,
    'terminal_code', v_terminal_code,
    'timezone', v_timezone,
    'server_now', v_server_now,
    'service_date', v_service_date
  );
end;
$$;

comment on function public.mobile_companion_terminal_time_authority(text) is
  'Returns the authenticated company mobile service date using the database clock and active terminal timezone.';

revoke all on function public.mobile_companion_terminal_time_authority(text)
  from public, anon;
grant execute on function public.mobile_companion_terminal_time_authority(text)
  to authenticated, service_role;

commit;
