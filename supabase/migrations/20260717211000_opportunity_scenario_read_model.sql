drop function if exists public.list_opportunity_analyses(text);

create function public.list_opportunity_analyses(p_company_slug text)
returns table (
  id uuid, opportunity_number text, station_name text, opportunity_type text, listing_location text,
  status text, zip_count integer, weekly_mileage integer,
  weekly_delivery_stops integer, weekly_delivery_packages integer,
  weekly_pickup_stops integer, weekly_pickup_packages integer,
  weekly_dispatch_min integer, weekly_dispatch_max integer,
  contract_start_date date, updated_at timestamptz
)
language sql stable security definer set search_path = public, core, opportunity
as $$
  select a.id, a.opportunity_number, a.station_name, a.opportunity_type, a.listing_location,
    a.status, cardinality(a.zip_codes), a.weekly_mileage,
    a.weekly_delivery_stops, a.weekly_delivery_packages,
    a.weekly_pickup_stops, a.weekly_pickup_packages,
    a.weekly_dispatch_min, a.weekly_dispatch_max, a.contract_start_date, a.updated_at
  from opportunity.analysis a join core.companies c on c.id=a.company_id
  where c.company_slug=p_company_slug and (
    core.is_platform_owner() or core.can_admin_company(a.company_id) or exists (
      select 1 from core.company_memberships cm join core.company_user_grant g
        on g.company_id=cm.company_id and g.profile_id=cm.profile_id
      where cm.company_id=a.company_id and cm.profile_id=core.current_profile_id()
        and cm.membership_status='active' and g.grant_key='opportunity_analysis' and g.is_active
    )
  ) order by a.updated_at desc;
$$;

revoke all on function public.list_opportunity_analyses(text) from public;
grant execute on function public.list_opportunity_analyses(text) to authenticated, service_role;
