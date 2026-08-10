-- Make roster invitations first-class app invitations:
--   * pre-provision a profile and pending membership for access assignment
--   * bind onboarding sessions to the accepting Auth user
--   * allow recipients to manage only their own onboarding progress

alter table public.onboarding_session
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists onboarding_session_auth_user_id_idx
  on public.onboarding_session (auth_user_id);

update public.onboarding_session s
set auth_user_id = p.auth_user_id
from public.hiring_invite_token i
join core.profiles p
  on lower(p.email) = lower(i.email)
where i.token = s.invite_token
  and s.auth_user_id is null
  and p.auth_user_id is not null;

create or replace function core.can_access_onboarding_session(
  p_session_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'core', 'public'
as $$
  select exists (
    select 1
    from public.onboarding_session s
    left join public.hiring_invite_token i
      on i.token = s.invite_token
    where s.id = p_session_id
      and (
        s.auth_user_id = auth.uid()
        or (
          s.auth_user_id is null
          and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or core.can_admin_company(s.company_id)
      )
  );
$$;

revoke all on function core.can_access_onboarding_session(uuid) from public;
grant execute on function core.can_access_onboarding_session(uuid)
  to authenticated, service_role;

drop policy if exists onboarding_session_select on public.onboarding_session;

create policy onboarding_session_select
on public.onboarding_session
for select
to authenticated
using (
  core.can_access_company(company_id)
  or core.can_access_onboarding_session(id)
);

create policy onboarding_step_progress_select_own
on public.onboarding_step_progress
for select
to authenticated
using (
  core.can_access_onboarding_session(session_id)
);

create policy onboarding_step_progress_insert_own
on public.onboarding_step_progress
for insert
to authenticated
with check (
  core.can_access_onboarding_session(session_id)
);

create policy onboarding_step_progress_update_own
on public.onboarding_step_progress
for update
to authenticated
using (
  core.can_access_onboarding_session(session_id)
)
with check (
  core.can_access_onboarding_session(session_id)
);

create or replace function public.prepare_company_roster_app_invite(
  p_company_slug text,
  p_roster_id uuid,
  p_auth_user_id uuid,
  p_token text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_company_id uuid;
  v_roster core.company_roster%rowtype;
  v_profile core.profiles%rowtype;
  v_membership core.company_memberships%rowtype;
  v_token_id uuid;
  v_email text;
  v_display_name text;
  v_first_name text;
  v_last_name text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized.' using errcode = '42501';
  end if;

  select c.id
  into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.' using errcode = 'P0002';
  end if;

  if not core.can_admin_company(v_company_id) then
    raise exception 'You do not have permission to invite company users.' using errcode = '42501';
  end if;

  select r.*
  into v_roster
  from core.company_roster r
  where r.id = p_roster_id
    and r.company_id = v_company_id;

  if not found then
    raise exception 'Roster record not found.' using errcode = 'P0002';
  end if;

  v_email := lower(trim(coalesce(v_roster.email, '')));

  if v_email = '' then
    raise exception 'Roster email is missing.' using errcode = '22023';
  end if;

  if p_auth_user_id is null or nullif(trim(coalesce(p_token, '')), '') is null then
    raise exception 'Auth user and invite token are required.' using errcode = '22023';
  end if;

  v_display_name := coalesce(
    nullif(trim(v_roster.full_name), ''),
    split_part(v_email, '@', 1)
  );
  v_first_name := coalesce(
    nullif(split_part(v_display_name, ' ', 1), ''),
    split_part(v_email, '@', 1)
  );
  v_last_name := coalesce(
    nullif(regexp_replace(v_display_name, '^\S+\s*', ''), ''),
    'User'
  );

  select p.*
  into v_profile
  from core.profiles p
  where p.auth_user_id = p_auth_user_id
     or lower(p.email) = v_email
  order by case when p.auth_user_id = p_auth_user_id then 0 else 1 end
  limit 1;

  if v_profile.id is null then
    insert into core.profiles (
      auth_user_id,
      email,
      first_name,
      last_name,
      display_name,
      mobile_phone,
      profile_status
    )
    values (
      p_auth_user_id,
      v_email,
      v_first_name,
      v_last_name,
      v_display_name,
      nullif(trim(coalesce(v_roster.phone, '')), ''),
      'active'
    )
    returning * into v_profile;
  else
    if v_profile.auth_user_id is not null
       and v_profile.auth_user_id <> p_auth_user_id then
      raise exception 'A different Auth user is already linked to this roster email.'
        using errcode = '23505';
    end if;

    update core.profiles
    set
      auth_user_id = p_auth_user_id,
      email = v_email,
      first_name = coalesce(nullif(first_name, ''), v_first_name),
      last_name = coalesce(nullif(last_name, ''), v_last_name),
      display_name = coalesce(nullif(display_name, ''), v_display_name),
      mobile_phone = coalesce(mobile_phone, nullif(trim(coalesce(v_roster.phone, '')), '')),
      profile_status = 'active',
      updated_at = now()
    where id = v_profile.id
    returning * into v_profile;
  end if;

  update core.company_roster
  set profile_id = v_profile.id
  where id = p_roster_id;

  select cm.*
  into v_membership
  from core.company_memberships cm
  where cm.company_id = v_company_id
    and cm.profile_id = v_profile.id
    and cm.membership_status in ('pending', 'active', 'inactive')
  order by case when cm.membership_status = 'active' then 0 else 1 end
  limit 1;

  if v_membership.id is null then
    insert into core.company_memberships (
      company_id,
      profile_id,
      membership_status,
      relationship_type,
      title,
      invited_at,
      notes
    )
    values (
      v_company_id,
      v_profile.id,
      'pending',
      'member',
      v_roster.job_title,
      now(),
      'Pre-provisioned from a roster app invitation.'
    )
    returning * into v_membership;
  elsif v_membership.membership_status <> 'active' then
    update core.company_memberships
    set
      membership_status = 'pending',
      relationship_type = 'member',
      title = coalesce(v_roster.job_title, title),
      invited_at = now(),
      accepted_at = null,
      started_at = null,
      ended_at = null,
      notes = 'Pre-provisioned from a roster app invitation.',
      updated_at = now()
    where id = v_membership.id
    returning * into v_membership;
  end if;

  update public.hiring_invite_token
  set status = 'expired'
  where status = 'active'
    and (
      roster_id = p_roster_id
      or candidate_id = p_roster_id
    );

  insert into public.hiring_invite_token (
    pc_org_id,
    candidate_id,
    company_id,
    roster_id,
    email,
    token,
    status,
    expires_at,
    created_by
  )
  values (
    v_company_id,
    p_roster_id,
    v_company_id,
    p_roster_id,
    v_email,
    p_token,
    'active',
    p_expires_at,
    core.current_profile_id()
  )
  returning id into v_token_id;

  return jsonb_build_object(
    'ok', true,
    'token_id', v_token_id,
    'profile_id', v_profile.id,
    'membership_id', v_membership.id,
    'membership_status', v_membership.membership_status,
    'roster_id', p_roster_id,
    'company_id', v_company_id,
    'email', v_email
  );
end;
$$;

revoke all on function public.prepare_company_roster_app_invite(
  text, uuid, uuid, text, timestamptz
) from public;

grant execute on function public.prepare_company_roster_app_invite(
  text, uuid, uuid, text, timestamptz
) to authenticated, service_role;

create or replace function public.complete_onboarding_session(
  p_session_id uuid,
  p_auth_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_session public.onboarding_session%rowtype;
  v_profile core.profiles%rowtype;
  v_person_id uuid;
  v_membership_id uuid;
  v_onboarding_id uuid;
  v_company_slug text;
begin
  if auth.uid() is null
     or p_auth_user_id is distinct from auth.uid() then
    raise exception 'Unauthorized onboarding completion.' using errcode = '42501';
  end if;

  select s.*
  into v_session
  from public.onboarding_session s
  where s.id = p_session_id;

  if not found then
    raise exception 'Onboarding session not found.' using errcode = 'P0002';
  end if;

  if v_session.auth_user_id is null then
    if not exists (
      select 1
      from public.hiring_invite_token i
      join auth.users u
        on u.id = p_auth_user_id
       and lower(u.email) = lower(i.email)
      where i.token = v_session.invite_token
    ) then
      raise exception 'This onboarding invitation belongs to another user.'
        using errcode = '42501';
    end if;

    update public.onboarding_session
    set auth_user_id = p_auth_user_id
    where id = p_session_id
      and auth_user_id is null;

    v_session.auth_user_id := p_auth_user_id;
  elsif v_session.auth_user_id <> p_auth_user_id then
    raise exception 'This onboarding session belongs to another user.'
      using errcode = '42501';
  end if;

  select p.*
  into v_profile
  from core.profiles p
  where p.auth_user_id = p_auth_user_id;

  if not found then
    raise exception 'Profile not found for Auth user.' using errcode = 'P0002';
  end if;

  select p.id
  into v_person_id
  from public.person p
  where lower(p.email) = lower(v_profile.email)
  limit 1;

  if v_person_id is null then
    insert into public.person (full_name, email, phone)
    values (
      coalesce(
        nullif(v_profile.display_name, ''),
        concat_ws(' ', nullif(v_profile.first_name, ''), nullif(v_profile.last_name, ''))
      ),
      v_profile.email,
      v_profile.mobile_phone
    )
    returning id into v_person_id;
  else
    update public.person
    set
      full_name = coalesce(
        nullif(v_profile.display_name, ''),
        concat_ws(' ', nullif(v_profile.first_name, ''), nullif(v_profile.last_name, ''))
      ),
      phone = coalesce(v_profile.mobile_phone, phone)
    where id = v_person_id;
  end if;

  update core.company_roster
  set
    person_id = v_person_id,
    profile_id = v_profile.id,
    invite_status = 'Linked',
    onboarding_completed_at = now()
  where id = v_session.roster_id
    and company_id = v_session.company_id;

  select cm.id
  into v_membership_id
  from core.company_memberships cm
  where cm.company_id = v_session.company_id
    and cm.profile_id = v_profile.id
    and cm.membership_status in ('pending', 'active', 'inactive')
  order by case when cm.membership_status = 'active' then 0 else 1 end
  limit 1;

  if v_membership_id is null then
    insert into core.company_memberships (
      company_id,
      profile_id,
      membership_status,
      relationship_type,
      invited_at,
      accepted_at,
      started_at,
      notes
    )
    values (
      v_session.company_id,
      v_profile.id,
      'active',
      'member',
      now(),
      now(),
      now(),
      'Activated from roster app invitation onboarding.'
    )
    returning id into v_membership_id;
  else
    update core.company_memberships
    set
      membership_status = 'active',
      accepted_at = coalesce(accepted_at, now()),
      started_at = coalesce(started_at, now()),
      updated_at = now()
    where id = v_membership_id;
  end if;

  select co.id
  into v_onboarding_id
  from core.company_onboardings co
  where co.company_id = v_session.company_id
    and co.profile_id = v_profile.id
    and co.onboarding_status in ('pending', 'in_progress')
  limit 1;

  if v_onboarding_id is null then
    insert into core.company_onboardings (
      company_id,
      profile_id,
      onboarding_status,
      source_type,
      target_membership_id,
      started_at,
      completed_at,
      notes
    )
    values (
      v_session.company_id,
      v_profile.id,
      'completed',
      'company_invite',
      v_membership_id,
      v_session.created_at,
      now(),
      'Completed from roster app invitation.'
    )
    returning id into v_onboarding_id;
  else
    update core.company_onboardings
    set
      onboarding_status = 'completed',
      source_type = 'company_invite',
      target_membership_id = coalesce(target_membership_id, v_membership_id),
      completed_at = now(),
      updated_at = now()
    where id = v_onboarding_id;
  end if;

  update public.hiring_invite_token
  set
    status = 'used',
    used_at = coalesce(used_at, now())
  where token = v_session.invite_token;

  update public.onboarding_session
  set
    status = 'completed',
    completed_at = now()
  where id = p_session_id
    and auth_user_id = p_auth_user_id;

  select c.company_slug
  into v_company_slug
  from core.companies c
  where c.id = v_session.company_id;

  return jsonb_build_object(
    'ok', true,
    'person_id', v_person_id,
    'profile_id', v_profile.id,
    'membership_id', v_membership_id,
    'company_onboarding_id', v_onboarding_id,
    'roster_id', v_session.roster_id,
    'company_id', v_session.company_id,
    'company_slug', v_company_slug
  );
end;
$$;

revoke all on function public.complete_onboarding_session(uuid, uuid) from public;
grant execute on function public.complete_onboarding_session(uuid, uuid)
  to authenticated, service_role;
