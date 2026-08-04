begin;

create or replace function core.prepare_candidate_application_profile()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_profile_id uuid;
begin
  if new.profile_id is not null then return new; end if;

  select id into v_profile_id
  from core.profiles
  where lower(email) = lower(new.email)
    and auth_user_id is null
  limit 1;

  if v_profile_id is null and not exists (
    select 1 from core.profiles where lower(email) = lower(new.email)
  ) then
    insert into core.profiles (
      auth_user_id, email, first_name, last_name, display_name,
      mobile_phone, profile_status, is_platform_owner
    ) values (
      null, lower(btrim(new.email)), btrim(new.first_name), btrim(new.last_name),
      concat_ws(' ', btrim(new.first_name), btrim(new.last_name)), new.phone,
      'active', false
    ) returning id into v_profile_id;
  end if;

  new.profile_id := v_profile_id;
  return new;
end;
$$;

drop trigger if exists prepare_profile_before_candidate_application on core.candidate_application;
create trigger prepare_profile_before_candidate_application
before insert on core.candidate_application
for each row execute function core.prepare_candidate_application_profile();

comment on function core.prepare_candidate_application_profile() is
  'Creates or reuses an unclaimed profile shell for a candidate application without creating auth or company access.';

create or replace function core.ensure_access_context() returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text;
  v_profile core.profiles;
  v_roster core.company_roster;
  v_first_name text;
  v_last_name text;
  v_display_name text;
begin
  if v_auth_user_id is null then return; end if;

  select lower(email) into v_email from auth.users where id = v_auth_user_id;
  if v_email is null then return; end if;

  select * into v_roster
  from core.company_roster
  where lower(email) = v_email
    and (employment_status <> 'Candidate' or invite_status in ('Invited', 'Accepted', 'Linked'))
  order by
    case employment_status when 'Active' then 0 when 'Trainee' then 1 when 'Candidate' then 2 else 3 end,
    created_at desc
  limit 1;

  v_display_name := coalesce(nullif(v_roster.full_name, ''), split_part(v_email, '@', 1));
  v_first_name := coalesce(nullif(split_part(v_display_name, ' ', 1), ''), split_part(v_email, '@', 1));
  v_last_name := coalesce(nullif(regexp_replace(v_display_name, '^\S+\s*', ''), ''), 'User');

  select * into v_profile from core.profiles where auth_user_id = v_auth_user_id limit 1;

  if v_profile.id is null then
    select * into v_profile
    from core.profiles
    where lower(email) = v_email and auth_user_id is null
    for update
    limit 1;

    if v_profile.id is not null then
      update core.profiles
      set auth_user_id = v_auth_user_id,
          first_name = coalesce(nullif(core.profiles.first_name, ''), v_first_name),
          last_name = coalesce(nullif(core.profiles.last_name, ''), v_last_name),
          display_name = coalesce(nullif(core.profiles.display_name, ''), v_display_name),
          mobile_phone = coalesce(core.profiles.mobile_phone, v_roster.phone),
          profile_status = 'active',
          updated_at = now()
      where id = v_profile.id
      returning * into v_profile;
    else
      insert into core.profiles (
        auth_user_id, email, first_name, last_name, display_name,
        mobile_phone, profile_status, is_platform_owner
      ) values (
        v_auth_user_id, v_email, v_first_name, v_last_name, v_display_name,
        v_roster.phone, 'active', false
      ) returning * into v_profile;
    end if;
  else
    update core.profiles
    set email = coalesce(core.profiles.email, v_email),
        first_name = coalesce(core.profiles.first_name, v_first_name),
        last_name = coalesce(core.profiles.last_name, v_last_name),
        display_name = coalesce(core.profiles.display_name, v_display_name),
        mobile_phone = coalesce(core.profiles.mobile_phone, v_roster.phone),
        profile_status = coalesce(core.profiles.profile_status, 'active'),
        updated_at = now()
    where id = v_profile.id
    returning * into v_profile;
  end if;

  update core.company_roster
  set profile_id = v_profile.id,
      invite_status = 'Linked'
  where lower(email) = v_email
    and profile_id is null
    and (employment_status <> 'Candidate' or invite_status in ('Invited', 'Accepted', 'Linked'));

  insert into core.company_memberships (
    company_id, profile_id, relationship_type, membership_status, title,
    invited_at, accepted_at, started_at
  )
  select
    roster.company_id,
    v_profile.id,
    case
      when roster.employment_status = 'Candidate' then 'candidate'
      when lower(coalesce(roster.job_title, '')) like any (array['%owner%', '%manager%', '%business contact%']) then 'admin'
      else 'member'
    end,
    'active', roster.job_title, now(), now(), now()
  from core.company_roster roster
  where roster.profile_id = v_profile.id
    and (roster.employment_status <> 'Candidate' or roster.invite_status in ('Invited', 'Accepted', 'Linked'))
    and not exists (
      select 1 from core.company_memberships membership
      where membership.company_id = roster.company_id and membership.profile_id = v_profile.id
    );
end;
$$;

commit;
