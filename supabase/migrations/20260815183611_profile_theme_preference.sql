alter table core.profiles
  add column if not exists theme_preference text not null default 'system';

alter table core.profiles
  drop constraint if exists profiles_theme_preference_check;

alter table core.profiles
  add constraint profiles_theme_preference_check
  check (theme_preference in ('system', 'light', 'dark'));

comment on column core.profiles.theme_preference is
  'Authenticated user appearance preference. System resolves from the current device; light and dark are explicit cross-device choices.';

create or replace function core.access_context()
returns jsonb
language sql
stable
security definer
set search_path = core, public
as $$
  with me as (
    select
      p.id as profile_id,
      p.auth_user_id,
      p.email,
      p.first_name,
      p.last_name,
      p.display_name,
      p.mobile_phone,
      p.profile_status,
      p.is_platform_owner,
      p.theme_preference
    from core.profiles p
    where p.auth_user_id = auth.uid()
    limit 1
  ),
  memberships as (
    select
      cm.company_id,
      cm.profile_id,
      cm.relationship_type,
      cm.membership_status,
      cm.title,
      c.company_name,
      c.company_slug,
      c.company_status,
      c.primary_industry_id
    from core.company_memberships cm
    join core.companies c on c.id = cm.company_id
    join me on me.profile_id = cm.profile_id
    where cm.membership_status in ('pending', 'active', 'inactive')
  )
  select jsonb_build_object(
    'auth_user_id', me.auth_user_id,
    'profile_id', me.profile_id,
    'email', me.email,
    'first_name', me.first_name,
    'last_name', me.last_name,
    'display_name', me.display_name,
    'mobile_phone', me.mobile_phone,
    'profile_status', me.profile_status,
    'is_platform_owner', me.is_platform_owner,
    'theme_preference', me.theme_preference,
    'memberships', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'company_id', m.company_id,
          'company_name', m.company_name,
          'company_slug', m.company_slug,
          'company_status', m.company_status,
          'primary_industry_id', m.primary_industry_id,
          'relationship_type', m.relationship_type,
          'membership_status', m.membership_status,
          'title', m.title,
          'grants', coalesce((
            select jsonb_agg(g.grant_key order by g.grant_key)
            from core.company_user_grant g
            where g.company_id = m.company_id
              and g.profile_id = m.profile_id
              and g.is_active = true
          ), '[]'::jsonb)
        )
        order by case when m.membership_status = 'active' then 0 else 1 end, m.company_name
      )
      from memberships m
    ), '[]'::jsonb)
  )
  from me;
$$;

create or replace function public.set_profile_theme_preference(p_preference text)
returns text
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_preference text := lower(btrim(coalesce(p_preference, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if v_preference not in ('system', 'light', 'dark') then
    raise exception 'Theme preference must be system, light, or dark.';
  end if;

  update core.profiles
  set theme_preference = v_preference
  where auth_user_id = auth.uid();

  if not found then
    raise exception 'Authenticated profile not found.';
  end if;

  return v_preference;
end;
$$;

revoke all on function public.set_profile_theme_preference(text) from public;
revoke all on function public.set_profile_theme_preference(text) from anon;
grant execute on function public.set_profile_theme_preference(text) to authenticated;
grant execute on function public.set_profile_theme_preference(text) to service_role;

comment on function public.set_profile_theme_preference(text) is
  'Updates only the authenticating user profile appearance preference after validating the supported values.';
