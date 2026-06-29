create or replace function public.save_profile_setup(
  p_auth_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_display_name text default null,
  p_mobile_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id
  from core.profiles
  where auth_user_id = p_auth_user_id
  limit 1;

  if v_profile_id is null then
    insert into core.profiles (
      auth_user_id, email, first_name, last_name, display_name, mobile_phone, profile_status, last_active_at
    )
    values (
      p_auth_user_id,
      lower(trim(p_email)),
      trim(p_first_name),
      trim(p_last_name),
      nullif(trim(coalesce(p_display_name, '')), ''),
      nullif(trim(coalesce(p_mobile_phone, '')), ''),
      'active',
      now()
    )
    returning id into v_profile_id;
  else
    update core.profiles
    set
      email = lower(trim(p_email)),
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      display_name = nullif(trim(coalesce(p_display_name, '')), ''),
      mobile_phone = nullif(trim(coalesce(p_mobile_phone, '')), ''),
      profile_status = 'active',
      last_active_at = now(),
      updated_at = now()
    where id = v_profile_id;
  end if;

  return v_profile_id;
end;
$$;

grant execute on function public.save_profile_setup(uuid, text, text, text, text, text) to authenticated;
