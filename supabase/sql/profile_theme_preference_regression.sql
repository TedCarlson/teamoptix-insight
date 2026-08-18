-- Run after 20260815183611_profile_theme_preference.sql.
-- All fixtures and assertions are transaction-local and rolled back.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_first_user_id uuid := '00000000-0000-4000-8000-000000001101';
  v_second_user_id uuid := '00000000-0000-4000-8000-000000001102';
  v_first_profile_id uuid := '00000000-0000-4000-8000-000000001201';
  v_second_profile_id uuid := '00000000-0000-4000-8000-000000001202';
  v_context jsonb;
  v_value text;
begin
  if not has_function_privilege(
    'authenticated',
    'public.set_profile_theme_preference(text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role cannot execute the theme setter';
  end if;

  if has_function_privilege(
    'anon',
    'public.set_profile_theme_preference(text)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role can execute the theme setter';
  end if;

  insert into auth.users (id) values (v_first_user_id), (v_second_user_id);

  insert into core.profiles (id, auth_user_id, email, first_name, last_name)
  values
    (v_first_profile_id, v_first_user_id, 'theme-first@example.invalid', 'Theme', 'First'),
    (v_second_profile_id, v_second_user_id, 'theme-second@example.invalid', 'Theme', 'Second');

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_first_user_id, 'role', 'authenticated')::text,
    true
  );

  select public.set_profile_theme_preference('dark') into v_value;
  if v_value <> 'dark' then
    raise exception 'Theme setter did not return the saved preference';
  end if;

  select core.access_context() into v_context;
  if v_context->>'theme_preference' <> 'dark' then
    raise exception 'Access context did not expose the saved theme preference';
  end if;

  if (select theme_preference from core.profiles where id = v_second_profile_id) <> 'system' then
    raise exception 'Theme update changed another user profile';
  end if;

  begin
    perform public.set_profile_theme_preference('unsupported');
    raise exception 'Unsupported theme preference was accepted';
  exception
    when others then
      if sqlerrm = 'Unsupported theme preference was accepted' then
        raise;
      end if;
  end;
end;
$$;

rollback;
