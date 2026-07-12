


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "billing";


ALTER SCHEMA "billing" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "commercial";


ALTER SCHEMA "commercial" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "core";


ALTER SCHEMA "core" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "legal";


ALTER SCHEMA "legal" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "ref";


ALTER SCHEMA "ref" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "billing"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "billing"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "commercial"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "commercial"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."access_context"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
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
      p.is_platform_owner
    from core.profiles p
    where p.auth_user_id = auth.uid()
    limit 1
  ),
  memberships as (
    select
      cm.company_id,
      cm.relationship_type,
      cm.membership_status,
      cm.title,
      c.company_name,
      c.company_slug,
      c.company_status,
      c.primary_industry_id
    from core.company_memberships cm
    join core.companies c
      on c.id = cm.company_id
    join me
      on me.profile_id = cm.profile_id
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
    'memberships', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'company_id', m.company_id,
            'company_name', m.company_name,
            'company_slug', m.company_slug,
            'company_status', m.company_status,
            'primary_industry_id', m.primary_industry_id,
            'relationship_type', m.relationship_type,
            'membership_status', m.membership_status,
            'title', m.title
          )
          order by
            case when m.membership_status = 'active' then 0 else 1 end,
            m.company_name
        )
        from memberships m
      ),
      '[]'::jsonb
    )
  )
  from me;
$$;


ALTER FUNCTION "core"."access_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."assign_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_roster_member_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_asset core.asset%rowtype;
  v_roster record;
  v_assigned_status_id uuid;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found'; end if;

  select * into v_asset
  from core.asset
  where id = p_asset_id and company_id = v_company_id;

  if v_asset.id is null then raise exception 'Asset not found'; end if;

  select *
  into v_roster
  from public.company_roster_view
  where company_id = v_company_id
    and roster_member_id = p_roster_member_id
    and employment_status in ('Active', 'Trainee')
  limit 1;

  if v_roster.roster_member_id is null then
    raise exception 'Active or trainee roster member not found';
  end if;

  select id into v_assigned_status_id
  from core.asset_status
  where status_key = 'ASSIGNED';

  update core.asset_assignment
  set released_at = now(), release_reason = 'REASSIGNED', updated_at = now()
  where asset_id = p_asset_id and released_at is null;

  insert into core.asset_assignment (asset_id, company_id, person_id, roster_member_id, assigned_at, notes)
  values (p_asset_id, v_company_id, null, p_roster_member_id, now(), 'Manual asset assignment.');

  update core.asset
  set assigned_person_id = null,
      assigned_roster_member_id = p_roster_member_id,
      assigned_at = now(),
      released_at = null,
      asset_status_id = v_assigned_status_id,
      updated_at = now()
  where id = p_asset_id;

  insert into core.asset_event (
    asset_id, company_id, event_key, event_label,
    from_status_id, to_status_id, person_id, roster_member_id, event_notes
  )
  values (
    p_asset_id, v_company_id, 'ASSIGNED', 'Asset assigned',
    v_asset.asset_status_id, v_assigned_status_id, null, p_roster_member_id,
    'Manual asset assignment.'
  );

  return jsonb_build_object('ok', true, 'asset_id', p_asset_id, 'roster_member_id', p_roster_member_id);
end;
$$;


ALTER FUNCTION "core"."assign_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_roster_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."can_access_company"("p_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_memberships m
      join core.profiles p on p.id = m.profile_id
      where m.company_id = p_company_id
        and p.auth_user_id = auth.uid()
        and m.membership_status = 'active'
    );
$$;


ALTER FUNCTION "core"."can_access_company"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."can_access_roster_member"("p_roster_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_roster r
      where r.id = p_roster_id
        and (
          r.profile_id = core.current_profile_id()
          or core.can_access_company(r.company_id)
        )
    );
$$;


ALTER FUNCTION "core"."can_access_roster_member"("p_roster_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."can_admin_company"("p_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_memberships m
      join core.profiles p on p.id = m.profile_id
      where m.company_id = p_company_id
        and p.auth_user_id = auth.uid()
        and m.membership_status = 'active'
        and m.relationship_type = 'admin'
    );
$$;


ALTER FUNCTION "core"."can_admin_company"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."can_manage_roster_member"("p_roster_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_roster r
      where r.id = p_roster_id
        and core.can_admin_company(r.company_id)
    );
$$;


ALTER FUNCTION "core"."can_manage_roster_member"("p_roster_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."can_read_company_data"("p_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  with access as (
    select core.access_context() as context
  )
  select
    coalesce(
      ((select context from access) ->> 'is_platform_owner')::boolean,
      false
    )
    or exists (
      select 1
      from jsonb_array_elements(
        coalesce(
          (select context from access) -> 'memberships',
          '[]'::jsonb
        )
      ) membership
      where (membership ->> 'company_id')::uuid = p_company_id
        and membership ->> 'membership_status' = 'active'
    );
$$;


ALTER FUNCTION "core"."can_read_company_data"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."current_profile"() RETURNS TABLE("profile_id" "uuid", "auth_user_id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "display_name" "text", "mobile_phone" "text", "profile_status" "text", "is_platform_owner" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select
    p.id as profile_id,
    p.auth_user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.display_name,
    p.mobile_phone,
    p.profile_status,
    p.is_platform_owner
  from core.profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "core"."current_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."current_profile_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select p.id
  from core.profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "core"."current_profile_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."dsw_payroll_number"("p_json" "jsonb", "p_primary" "text", "p_fallback" "text" DEFAULT NULL::"text") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'core', 'public'
    AS $$
  select coalesce(
    nullif(p_json->>p_primary, '')::numeric,
    case
      when p_fallback is null then null
      else nullif(p_json->>p_fallback, '')::numeric
    end,
    0
  );
$$;


ALTER FUNCTION "core"."dsw_payroll_number"("p_json" "jsonb", "p_primary" "text", "p_fallback" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."ensure_access_context"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text;
  v_profile core.profiles;
  v_roster core.company_roster;
  v_first_name text;
  v_last_name text;
  v_display_name text;
begin
  if v_auth_user_id is null then
    return;
  end if;

  select lower(email)
  into v_email
  from auth.users
  where id = v_auth_user_id;

  if v_email is null then
    return;
  end if;

  select *
  into v_roster
  from core.company_roster
  where lower(email) = v_email
  order by created_at desc
  limit 1;

  v_display_name := coalesce(nullif(v_roster.full_name, ''), split_part(v_email, '@', 1));
  v_first_name := coalesce(nullif(split_part(v_display_name, ' ', 1), ''), split_part(v_email, '@', 1));
  v_last_name := coalesce(nullif(regexp_replace(v_display_name, '^\S+\s*', ''), ''), 'User');

  select *
  into v_profile
  from core.profiles
  where auth_user_id = v_auth_user_id
  limit 1;

  if v_profile.id is null then
    insert into core.profiles (
      auth_user_id,
      email,
      first_name,
      last_name,
      display_name,
      mobile_phone,
      profile_status,
      is_platform_owner
    )
    values (
      v_auth_user_id,
      v_email,
      v_first_name,
      v_last_name,
      v_display_name,
      v_roster.phone,
      'active',
      false
    )
    returning *
    into v_profile;
  else
    update core.profiles
    set
      email = coalesce(core.profiles.email, v_email),
      first_name = coalesce(core.profiles.first_name, v_first_name),
      last_name = coalesce(core.profiles.last_name, v_last_name),
      display_name = coalesce(core.profiles.display_name, v_display_name),
      mobile_phone = coalesce(core.profiles.mobile_phone, v_roster.phone),
      profile_status = coalesce(core.profiles.profile_status, 'active'),
      updated_at = now()
    where id = v_profile.id
    returning *
    into v_profile;
  end if;

  update core.company_roster
  set
    profile_id = v_profile.id,
    invite_status = 'Linked'
  where lower(email) = v_email
    and profile_id is null;

  insert into core.company_memberships (
    company_id,
    profile_id,
    relationship_type,
    membership_status,
    title,
    invited_at,
    accepted_at,
    started_at
  )
  select
    cr.company_id,
    v_profile.id,
    case
      when lower(coalesce(cr.job_title, '')) like '%owner%' then 'admin'
      when lower(coalesce(cr.job_title, '')) like '%manager%' then 'admin'
      when lower(coalesce(cr.job_title, '')) like '%business contact%' then 'admin'
      else 'member'
    end,
    'active',
    cr.job_title,
    now(),
    now(),
    now()
  from core.company_roster cr
  where cr.profile_id = v_profile.id
    and not exists (
      select 1
      from core.company_memberships cm
      where cm.company_id = cr.company_id
        and cm.profile_id = v_profile.id
    );
end;
$$;


ALTER FUNCTION "core"."ensure_access_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."get_company_operations_config"("p_company_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
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
    'route_sort_direction', v_config.route_sort_direction
  );
end;
$$;


ALTER FUNCTION "core"."get_company_operations_config"("p_company_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."get_company_operations_history_internal"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("batch_id" "uuid", "company_id" "uuid", "service_date" "date", "weekday_number" integer, "weekday_key" "text", "is_weekday" boolean, "is_weekend" boolean, "source_filename" "text", "batch_created_at" timestamp with time zone, "generated_at_text" "text", "terminal_identity" "text", "contract_label" "text", "route_count" integer, "actual_delivery_stops" numeric, "actual_delivery_packages" numeric, "actual_pickup_stops" numeric, "actual_pickup_packages" numeric, "total_stops" numeric, "total_packages" numeric, "recorded_miles" numeric, "valid_miles" numeric, "mileage_anomaly_count" integer, "routes_with_miles" integer, "on_road_hours" numeric, "on_duty_hours" numeric, "routes_with_road_hours" integer, "routes_with_duty_hours" integer, "potential_dot_hours_violations" integer, "ils_percent" numeric, "ils_impact_packages" numeric, "exceptions" numeric, "dna" numeric, "code_85" numeric, "send_again" numeric, "all_status_code_packages" numeric, "required_signature" numeric, "planned_delivery_stops" numeric, "planned_pickup_stops" numeric, "normalized_row_json" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $_$
  with latest_final_batches as (
    select distinct on (b.service_date)
      b.id,
      b.company_id,
      b.service_date,
      b.source_filename,
      b.created_at
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.snapshot_kind = 'FINAL'
      and b.status = 'LOADED'
      and b.service_date between p_start_date and p_end_date
    order by
      b.service_date,
      b.created_at desc,
      b.id desc
  ),

  contract_summaries as (
    select distinct on (s.batch_id)
      s.batch_id,
      s.summary_label,
      s.normalized_row_json
    from core.operations_report_summary_row s
    join latest_final_batches b
      on b.id = s.batch_id
    where s.summary_scope = 'CONTRACT'
    order by
      s.batch_id,
      s.source_row_index
  ),

  route_rows as (
    select
      b.id as batch_id,
      b.company_id,
      b.service_date,
      b.source_filename,
      b.created_at as batch_created_at,
      r.normalized_row_json,

      case
        when nullif(r.normalized_row_json ->> 'actual_delivery_stops', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (r.normalized_row_json ->> 'actual_delivery_stops')::numeric
        else 0
      end as delivery_stops,

      case
        when nullif(r.normalized_row_json ->> 'actual_delivery_packages', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (r.normalized_row_json ->> 'actual_delivery_packages')::numeric
        else 0
      end as delivery_packages,

      case
        when nullif(r.normalized_row_json ->> 'actual_pickup_stops', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (r.normalized_row_json ->> 'actual_pickup_stops')::numeric
        else 0
      end as pickup_stops,

      case
        when nullif(r.normalized_row_json ->> 'actual_pickup_packages', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (r.normalized_row_json ->> 'actual_pickup_packages')::numeric
        else 0
      end as pickup_packages,

      case
        when nullif(r.normalized_row_json ->> 'miles', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (r.normalized_row_json ->> 'miles')::numeric
        else null
      end as miles,

      case
        when nullif(r.normalized_row_json ->> 'on_road_hours', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (r.normalized_row_json ->> 'on_road_hours')::numeric

        when nullif(r.normalized_row_json ->> 'on_road_hours', '')
          ~ '^[0-9]+:[0-5][0-9]$'
        then
          split_part(
            r.normalized_row_json ->> 'on_road_hours',
            ':',
            1
          )::numeric
          +
          split_part(
            r.normalized_row_json ->> 'on_road_hours',
            ':',
            2
          )::numeric / 60

        else null
      end as road_hours,

      case
        when nullif(r.normalized_row_json ->> 'on_duty_hours', '')
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (r.normalized_row_json ->> 'on_duty_hours')::numeric

        when nullif(r.normalized_row_json ->> 'on_duty_hours', '')
          ~ '^[0-9]+:[0-5][0-9]$'
        then
          split_part(
            r.normalized_row_json ->> 'on_duty_hours',
            ':',
            1
          )::numeric
          +
          split_part(
            r.normalized_row_json ->> 'on_duty_hours',
            ':',
            2
          )::numeric / 60

        else null
      end as duty_hours,

      case
        when nullif(
          r.normalized_row_json ->> 'potential_dot_hours_violations',
          ''
        ) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (
          r.normalized_row_json ->> 'potential_dot_hours_violations'
        )::numeric
        else 0
      end as dot_violations

    from latest_final_batches b
    join core.operations_report_raw_row r
      on r.batch_id = b.id
    where r.row_kind = 'ROUTE'
      and nullif(r.normalized_row_json ->> 'wa_name', '') is not null
      and coalesce(r.source_route_key, '') !~ '^[0-9]+$'
  ),

  daily_route_facts as (
    select
      r.batch_id,
      r.company_id,
      r.service_date,
      r.source_filename,
      r.batch_created_at,

      count(*)::integer as route_count,

      sum(r.delivery_stops) as actual_delivery_stops,
      sum(r.delivery_packages) as actual_delivery_packages,
      sum(r.pickup_stops) as actual_pickup_stops,
      sum(r.pickup_packages) as actual_pickup_packages,

      sum(coalesce(r.miles, 0)) as recorded_miles,

      sum(
        case
          when r.miles between 0 and 500 then r.miles
          else 0
        end
      ) as valid_miles,

      count(*) filter (
        where r.miles is not null
          and (r.miles < 0 or r.miles > 500)
      )::integer as mileage_anomaly_count,

      count(*) filter (
        where r.miles is not null
      )::integer as routes_with_miles,

      sum(coalesce(r.road_hours, 0)) as on_road_hours,
      sum(coalesce(r.duty_hours, 0)) as on_duty_hours,

      count(*) filter (
        where r.road_hours is not null
      )::integer as routes_with_road_hours,

      count(*) filter (
        where r.duty_hours is not null
      )::integer as routes_with_duty_hours,

      sum(coalesce(r.dot_violations, 0))::integer
        as potential_dot_hours_violations

    from route_rows r
    group by
      r.batch_id,
      r.company_id,
      r.service_date,
      r.source_filename,
      r.batch_created_at
  )

  select
    d.batch_id,
    d.company_id,
    d.service_date,

    extract(isodow from d.service_date)::integer
      as weekday_number,

    case extract(isodow from d.service_date)::integer
      when 1 then 'monday'
      when 2 then 'tuesday'
      when 3 then 'wednesday'
      when 4 then 'thursday'
      when 5 then 'friday'
      when 6 then 'saturday'
      when 7 then 'sunday'
    end as weekday_key,

    extract(isodow from d.service_date)::integer between 1 and 5
      as is_weekday,

    extract(isodow from d.service_date)::integer between 6 and 7
      as is_weekend,

    d.source_filename,
    d.batch_created_at,

    nullif(
      c.normalized_row_json ->> 'generated_at_text',
      ''
    ) as generated_at_text,

    nullif(
      c.normalized_row_json ->> 'terminal_identity',
      ''
    ) as terminal_identity,

    c.summary_label as contract_label,

    d.route_count,

    d.actual_delivery_stops,
    d.actual_delivery_packages,
    d.actual_pickup_stops,
    d.actual_pickup_packages,

    d.actual_delivery_stops + d.actual_pickup_stops
      as total_stops,

    d.actual_delivery_packages + d.actual_pickup_packages
      as total_packages,

    d.recorded_miles,
    d.valid_miles,
    d.mileage_anomaly_count,
    d.routes_with_miles,

    d.on_road_hours,
    d.on_duty_hours,
    d.routes_with_road_hours,
    d.routes_with_duty_hours,
    d.potential_dot_hours_violations,

    case
      when nullif(c.normalized_row_json ->> 'ils_percent', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (c.normalized_row_json ->> 'ils_percent')::numeric
      else null
    end as ils_percent,

    case
      when nullif(c.normalized_row_json ->> 'ils_impact_packages', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (c.normalized_row_json ->> 'ils_impact_packages')::numeric
      else null
    end as ils_impact_packages,

    case
      when nullif(c.normalized_row_json ->> 'exceptions', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (c.normalized_row_json ->> 'exceptions')::numeric
      else null
    end as exceptions,

    case
      when nullif(c.normalized_row_json ->> 'dna', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (c.normalized_row_json ->> 'dna')::numeric
      else null
    end as dna,

    case
      when nullif(c.normalized_row_json ->> 'code_85', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (c.normalized_row_json ->> 'code_85')::numeric
      else null
    end as code_85,

    case
      when nullif(c.normalized_row_json ->> 'send_again', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (c.normalized_row_json ->> 'send_again')::numeric
      else null
    end as send_again,

    case
      when nullif(
        c.normalized_row_json ->> 'all_status_code_packages',
        ''
      ) ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (
        c.normalized_row_json ->> 'all_status_code_packages'
      )::numeric
      else null
    end as all_status_code_packages,

    case
      when nullif(c.normalized_row_json ->> 'required_signature', '')
        ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (c.normalized_row_json ->> 'required_signature')::numeric
      else null
    end as required_signature,

    case
      when nullif(
        c.normalized_row_json ->> 'planned_delivery_stops',
        ''
      ) ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (
        c.normalized_row_json ->> 'planned_delivery_stops'
      )::numeric
      else null
    end as planned_delivery_stops,

    case
      when nullif(
        c.normalized_row_json ->> 'planned_pickup_stops',
        ''
      ) ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (
        c.normalized_row_json ->> 'planned_pickup_stops'
      )::numeric
      else null
    end as planned_pickup_stops,

    c.normalized_row_json

  from daily_route_facts d
  left join contract_summaries c
    on c.batch_id = d.batch_id

  order by d.service_date;
$_$;


ALTER FUNCTION "core"."get_company_operations_history_internal"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."get_company_operations_history_years_internal"("p_company_id" "uuid") RETURNS TABLE("operating_year" integer, "finalized_operating_day_count" bigint, "through_service_date" "date")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  with latest_final_batches as (
    select distinct on (b.service_date)
      b.service_date,
      b.created_at,
      b.id
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.snapshot_kind = 'FINAL'
      and b.status = 'LOADED'
      and b.service_date is not null
    order by
      b.service_date,
      b.created_at desc,
      b.id desc
  )
  select
    extract(year from b.service_date)::integer as operating_year,
    count(*)::bigint as finalized_operating_day_count,
    max(b.service_date) as through_service_date
  from latest_final_batches b
  group by extract(year from b.service_date)::integer
  order by operating_year desc;
$$;


ALTER FUNCTION "core"."get_company_operations_history_years_internal"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."import_company_roster_rows"("p_company_slug" "text", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_row jsonb;
  v_roster_id uuid;
  v_profile_id uuid;
  v_license_id uuid;

  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;

  v_email text;
  v_full_name text;
  v_first_name text;
  v_last_name text;
  v_fx_id text;
  v_dswid text;
begin
  select c.id into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden.'; end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    begin
      v_roster_id := null;
      v_profile_id := null;
      v_license_id := null;

      v_email := nullif(lower(trim(coalesce(v_row->>'email', ''))), '');
      v_full_name := nullif(trim(coalesce(v_row->>'full_name', '')), '');
      v_fx_id := nullif(trim(coalesce(v_row->>'fx_id', '')), '');
      v_dswid := nullif(trim(coalesce(v_row->>'dswid', '')), '');

      if v_full_name is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      select r.id, r.profile_id into v_roster_id, v_profile_id
      from core.company_roster r
      where r.company_id = v_company_id
        and v_email is not null
        and lower(trim(r.email)) = v_email
      limit 1;

      if v_roster_id is null and (v_fx_id is not null or v_dswid is not null) then
        select r.id, r.profile_id into v_roster_id, v_profile_id
        from core.company_roster r
        join core.company_roster_operations_fact ops on ops.roster_id = r.id
        where r.company_id = v_company_id
          and (
            (v_fx_id is not null and ops.fx_id = v_fx_id)
            or (v_dswid is not null and ops.dswid = v_dswid)
          )
        limit 1;
      end if;

      if v_roster_id is null then
        select r.id, r.profile_id into v_roster_id, v_profile_id
        from core.company_roster r
        where r.company_id = v_company_id
          and lower(regexp_replace(trim(r.full_name), '\s+', ' ', 'g')) =
              lower(regexp_replace(trim(v_full_name), '\s+', ' ', 'g'))
        limit 1;
      end if;

      v_first_name := coalesce(nullif(split_part(v_full_name, ' ', 1), ''), 'Unknown');
      v_last_name := coalesce(nullif(trim(regexp_replace(v_full_name, '^\S+\s*', '')), ''), 'Unknown');

      if v_profile_id is null and v_email is not null then
        select p.id into v_profile_id
        from core.profiles p
        where lower(trim(p.email)) = v_email
        limit 1;
      end if;

      if v_roster_id is null then
        begin
          insert into core.company_roster (
            company_id, profile_id, full_name, email, phone,
            worker_type, job_title, employment_status, market_code,
            hire_date, separation_date, invite_status, compliance_summary, notes
          )
          values (
            v_company_id,
            v_profile_id,
            v_full_name,
            v_email,
            nullif(trim(coalesce(v_row->>'phone', '')), ''),
            nullif(trim(coalesce(v_row->>'worker_type', v_row->>'role', '')), ''),
            nullif(trim(coalesce(v_row->>'job_title', '')), ''),
            coalesce(nullif(trim(coalesce(v_row->>'employment_status', v_row->>'status', '')), ''), 'Active'),
            nullif(trim(coalesce(v_row->>'market_code', v_row->>'market', '')), ''),
            nullif(trim(coalesce(v_row->>'hire_date', v_row->>'start_date', '')), '')::date,
            nullif(trim(coalesce(v_row->>'separation_date', '')), '')::date,
            'Not Invited',
            'Missing',
            nullif(trim(coalesce(v_row->>'notes', '')), '')
          )
          returning id, profile_id into v_roster_id, v_profile_id;

          v_inserted := v_inserted + 1;
        exception when unique_violation then
          select r.id, r.profile_id into v_roster_id, v_profile_id
          from core.company_roster r
          where r.company_id = v_company_id
            and v_email is not null
            and lower(trim(r.email)) = v_email
          limit 1;

          if v_roster_id is null then raise; end if;

          v_updated := v_updated + 1;
        end;
      else
        v_updated := v_updated + 1;
      end if;

      update core.company_roster
      set profile_id = coalesce(profile_id, v_profile_id),
          full_name = coalesce(v_full_name, full_name),
          email = coalesce(v_email, email),
          phone = coalesce(nullif(trim(coalesce(v_row->>'phone', '')), ''), phone),
          worker_type = coalesce(nullif(trim(coalesce(v_row->>'worker_type', v_row->>'role', '')), ''), worker_type),
          job_title = coalesce(nullif(trim(coalesce(v_row->>'job_title', '')), ''), job_title),
          employment_status = coalesce(nullif(trim(coalesce(v_row->>'employment_status', v_row->>'status', '')), ''), employment_status),
          market_code = coalesce(nullif(trim(coalesce(v_row->>'market_code', v_row->>'market', '')), ''), market_code),
          hire_date = coalesce(nullif(trim(coalesce(v_row->>'hire_date', v_row->>'start_date', '')), '')::date, hire_date),
          separation_date = coalesce(nullif(trim(coalesce(v_row->>'separation_date', '')), '')::date, separation_date),
          notes = coalesce(nullif(trim(coalesce(v_row->>'notes', '')), ''), notes)
      where id = v_roster_id
        and company_id = v_company_id
      returning profile_id into v_profile_id;

      if v_profile_id is null and v_email is not null then
        insert into core.profiles (
          auth_user_id, email, first_name, last_name,
          display_name, mobile_phone, profile_status
        )
        values (
          null, v_email, v_first_name, v_last_name,
          v_full_name, nullif(trim(coalesce(v_row->>'phone', '')), ''), 'inactive'
        )
        returning id into v_profile_id;

        update core.company_roster
        set profile_id = v_profile_id
        where id = v_roster_id;
      end if;

      if v_profile_id is not null then
        insert into core.profile_private_fact (
          profile_id, date_of_birth, address_line_1, address_line_2,
          city, state_region, postal_code, updated_at
        )
        values (
          v_profile_id,
          nullif(trim(coalesce(v_row->>'date_of_birth', '')), '')::date,
          nullif(trim(coalesce(v_row->>'address_line_1', '')), ''),
          nullif(trim(coalesce(v_row->>'address_line_2', '')), ''),
          nullif(trim(coalesce(v_row->>'city', '')), ''),
          nullif(trim(coalesce(v_row->>'state_region', '')), ''),
          nullif(trim(coalesce(v_row->>'postal_code', '')), ''),
          now()
        )
        on conflict (profile_id) do update set
          date_of_birth = coalesce(excluded.date_of_birth, core.profile_private_fact.date_of_birth),
          address_line_1 = coalesce(excluded.address_line_1, core.profile_private_fact.address_line_1),
          address_line_2 = coalesce(excluded.address_line_2, core.profile_private_fact.address_line_2),
          city = coalesce(excluded.city, core.profile_private_fact.city),
          state_region = coalesce(excluded.state_region, core.profile_private_fact.state_region),
          postal_code = coalesce(excluded.postal_code, core.profile_private_fact.postal_code),
          updated_at = now();

        if nullif(trim(coalesce(v_row->>'license_number', '')), '') is not null then
          select id into v_license_id
          from core.profile_driver_license
          where profile_id = v_profile_id
          order by created_at desc
          limit 1;

          if v_license_id is null then
            insert into core.profile_driver_license (
              profile_id, license_number, issuing_state, issue_date, expiration_date
            )
            values (
              v_profile_id,
              nullif(trim(coalesce(v_row->>'license_number', '')), ''),
              nullif(trim(coalesce(v_row->>'issuing_state', '')), ''),
              nullif(trim(coalesce(v_row->>'license_issue_date', '')), '')::date,
              nullif(trim(coalesce(v_row->>'license_expiration_date', '')), '')::date
            );
          else
            update core.profile_driver_license
            set license_number = nullif(trim(coalesce(v_row->>'license_number', '')), ''),
                issuing_state = coalesce(nullif(trim(coalesce(v_row->>'issuing_state', '')), ''), issuing_state),
                issue_date = coalesce(nullif(trim(coalesce(v_row->>'license_issue_date', '')), '')::date, issue_date),
                expiration_date = coalesce(nullif(trim(coalesce(v_row->>'license_expiration_date', '')), '')::date, expiration_date),
                updated_at = now()
            where id = v_license_id;
          end if;
        end if;
      end if;

      insert into core.company_roster_operations_fact (
        roster_id, scanner_serial, dot_exp, qual_cert_exp,
        fuel_card, pin_id_no, daily_pay_effective_date, daily_pay_rate,
        fx_id, dswid, dsw_driver_name
      )
      values (
        v_roster_id,
        nullif(trim(coalesce(v_row->>'scanner_serial', '')), ''),
        nullif(trim(coalesce(v_row->>'dot_expiration_date', '')), '')::date,
        nullif(trim(coalesce(v_row->>'qual_cert_expiration_date', '')), '')::date,
        nullif(trim(coalesce(v_row->>'fuel_card', '')), ''),
        nullif(trim(coalesce(v_row->>'pin_id_no', '')), ''),
        nullif(trim(coalesce(v_row->>'daily_pay_effective_date', '')), '')::date,
        nullif(trim(coalesce(v_row->>'daily_pay_rate', '')), '')::numeric,
        v_fx_id,
        v_dswid,
        nullif(trim(coalesce(v_row->>'dsw_driver_name', '')), '')
      )
      on conflict (roster_id) do update set
        scanner_serial = coalesce(excluded.scanner_serial, core.company_roster_operations_fact.scanner_serial),
        dot_exp = coalesce(excluded.dot_exp, core.company_roster_operations_fact.dot_exp),
        qual_cert_exp = coalesce(excluded.qual_cert_exp, core.company_roster_operations_fact.qual_cert_exp),
        fuel_card = coalesce(excluded.fuel_card, core.company_roster_operations_fact.fuel_card),
        pin_id_no = coalesce(excluded.pin_id_no, core.company_roster_operations_fact.pin_id_no),
        daily_pay_effective_date = coalesce(excluded.daily_pay_effective_date, core.company_roster_operations_fact.daily_pay_effective_date),
        daily_pay_rate = coalesce(excluded.daily_pay_rate, core.company_roster_operations_fact.daily_pay_rate),
        fx_id = coalesce(excluded.fx_id, core.company_roster_operations_fact.fx_id),
        dswid = coalesce(excluded.dswid, core.company_roster_operations_fact.dswid),
        dsw_driver_name = coalesce(excluded.dsw_driver_name, core.company_roster_operations_fact.dsw_driver_name),
        updated_at = now();

    exception when others then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row_number', v_row->>'row_number',
        'full_name', v_row->>'full_name',
        'email', v_row->>'email',
        'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'inserted_count', v_inserted,
    'updated_count', v_updated,
    'skipped_count', v_skipped,
    'errors', v_errors
  );
end;
$$;


ALTER FUNCTION "core"."import_company_roster_rows"("p_company_slug" "text", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."is_platform_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select exists (
      select 1
      from core.profiles
      where auth_user_id = auth.uid()
      and is_platform_owner = true
  );
$$;


ALTER FUNCTION "core"."is_platform_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("batch_id" "uuid", "company_id" "uuid", "report_family_key" "text", "report_shape_key" "text", "service_date" "date", "report_frame" "text", "snapshot_kind" "text", "source_filename" "text", "source_hash" "text", "detected_sheet_name" "text", "detected_header_row" integer, "detected_headers" "text"[], "row_count" integer, "route_row_count" integer, "participant_row_count" integer, "skipped_row_count" integer, "status" "text", "uploaded_by_profile_id" "uuid", "metadata_json" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "raw_row_count" bigint, "matched_row_count" bigint, "unmatched_row_count" bigint, "summary_row_count" bigint, "summary_rows" "jsonb", "total_history_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  with authorized_company as (
    select p_company_id as company_id
    where core.can_read_company_data(p_company_id)
  ),
  filtered_batches as (
    select b.*
    from core.operations_report_batch b
    join authorized_company ac
      on ac.company_id = b.company_id
    where (
      p_report_family_key is null
      or b.report_family_key = p_report_family_key
    )
  ),
  paged_batches as (
    select
      b.*,
      count(*) over () as total_history_count
    from filtered_batches b
    order by
      b.service_date desc nulls last,
      b.created_at desc,
      b.id desc
    limit greatest(least(coalesce(p_limit, 50), 200), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    b.id as batch_id,
    b.company_id,
    b.report_family_key,
    b.report_shape_key,
    b.service_date,
    b.report_frame,
    b.snapshot_kind,
    b.source_filename,
    b.source_hash,
    b.detected_sheet_name,
    b.detected_header_row,
    b.detected_headers,
    b.row_count,
    b.route_row_count,
    b.participant_row_count,
    b.skipped_row_count,
    b.status,
    b.uploaded_by_profile_id,
    b.metadata_json,
    b.created_at,
    b.updated_at,
    coalesce(raw_stats.raw_row_count, 0) as raw_row_count,
    coalesce(raw_stats.matched_row_count, 0) as matched_row_count,
    coalesce(raw_stats.unmatched_row_count, 0) as unmatched_row_count,
    coalesce(summary_stats.summary_row_count, 0) as summary_row_count,
    coalesce(summary_stats.summary_rows, '[]'::jsonb) as summary_rows,
    b.total_history_count
  from paged_batches b
  left join lateral (
    select
      count(*)::bigint as raw_row_count,
      count(*) filter (
        where r.matched_roster_member_id is not null
      )::bigint as matched_row_count,
      count(*) filter (
        where r.matched_roster_member_id is null
      )::bigint as unmatched_row_count
    from core.operations_report_raw_row r
    where r.batch_id = b.id
      and r.company_id = b.company_id
  ) raw_stats
    on true
  left join lateral (
    select
      count(*)::bigint as summary_row_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'summary_scope', s.summary_scope,
            'summary_label', s.summary_label,
            'contract_code', s.contract_code,
            'terminal_code', s.terminal_code,
            'source_row_index', s.source_row_index,
            'normalized_row_json', s.normalized_row_json,
            'raw_row_json', s.raw_row_json,
            'created_at', s.created_at
          )
          order by
            s.source_row_index,
            s.id
        ),
        '[]'::jsonb
      ) as summary_rows
    from core.operations_report_summary_row s
    where s.batch_id = b.id
      and s.company_id = b.company_id
  ) summary_stats
    on true
  order by
    b.service_date desc nulls last,
    b.created_at desc,
    b.id desc;
$$;


ALTER FUNCTION "core"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_dsw_count integer := 0;
begin
  delete from core.payroll_activity_fact
  where company_id = p_company_id
    and service_date between p_start_date and p_end_date;

  insert into core.payroll_activity_fact (
    company_id, service_date, week_end_date,
    roster_member_id, person_name,
    activity_role, attendance_status,
    route_baseline_id, route_name, wa_number, vehicle_text,
    actual_delivery_stops, actual_delivery_packages,
    actual_pickup_stops, actual_pickup_packages,
    threshold_stops, threshold_rate,
    threshold_overage, threshold_pay_amount,
    daily_pay_effective_date, daily_pay_rate, daily_pay_eligible,
    source_kind, source_ref_id, review_flags, metadata_json
  )
  with payable_rows as (
    select r.*
    from core.operations_report_raw_row r
    join core.operations_report_batch b on b.id = r.batch_id
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.report_shape_key = 'DSW_FINALIZED_DAY'
      and b.snapshot_kind = 'FINAL'
      and b.status = 'LOADED'
      and b.service_date between p_start_date and p_end_date
      and (
        r.row_kind = 'ROUTE_CANDIDATE'
        or (
          r.row_kind = 'ROUTE'
          and not exists (
            select 1
            from core.operations_report_raw_row child
            where child.batch_id = r.batch_id
              and child.parent_source_row_index = r.source_row_index
              and child.row_kind = 'ROUTE_CANDIDATE'
          )
        )
      )
  ),
  computed_rows as (
    select
      r.id,
      r.batch_id,
      r.source_row_index,
      r.row_kind,
      r.source_route_key,
      r.source_wa_number,
      r.source_driver_name,
      r.source_dswid,
      r.parent_source_row_index,
      r.parent_route_key,
      r.parent_wa_number,
      r.parent_driver_name,
      r.normalized_row_json,

      b.company_id as payroll_company_id,
      b.service_date as payroll_service_date,
      b.service_date + (((5 - extract(dow from b.service_date)::int + 7) % 7))::int as payroll_week_end_date,

      coalesce(cr.id, cri.roster_id) as resolved_roster_member_id,
      coalesce(cr.full_name, r.source_driver_name) as resolved_person_name,

      rb.id as resolved_route_baseline_id,
      coalesce(rb.route_name, r.source_route_key, r.parent_route_key) as resolved_route_name,
      coalesce(r.source_wa_number, r.parent_wa_number, r.normalized_row_json->>'wa_number') as resolved_wa_number,

      coalesce(rb.threshold_stops, 0) as resolved_threshold_stops,
      coalesce(rb.threshold_rate, 0) as resolved_threshold_rate,

      ops.daily_pay_effective_date as resolved_daily_pay_effective_date,
      ops.daily_pay_rate as resolved_daily_pay_rate,

      case when r.row_kind = 'ROUTE_CANDIDATE' then 'DSW_CANDIDATE' else 'DSW_OWNERSHIP' end as resolved_source_kind,

      case when r.row_kind = 'ROUTE_CANDIDATE'
        then core.dsw_payroll_number(r.normalized_row_json, 'actual_delivery_stops', 'ils_impact_packages')
        else core.dsw_payroll_number(r.normalized_row_json, 'actual_delivery_stops')
      end as pay_delivery_stops,

      case when r.row_kind = 'ROUTE_CANDIDATE'
        then core.dsw_payroll_number(r.normalized_row_json, 'actual_delivery_packages', 'non_delivered_stops')
        else core.dsw_payroll_number(r.normalized_row_json, 'actual_delivery_packages')
      end as pay_delivery_packages,

      case when r.row_kind = 'ROUTE_CANDIDATE'
        then core.dsw_payroll_number(r.normalized_row_json, 'actual_pickup_stops', 'code_85')
        else core.dsw_payroll_number(r.normalized_row_json, 'actual_pickup_stops')
      end as pay_pickup_stops,

      case when r.row_kind = 'ROUTE_CANDIDATE'
        then core.dsw_payroll_number(r.normalized_row_json, 'actual_pickup_packages', 'all_status_code_packages')
        else core.dsw_payroll_number(r.normalized_row_json, 'actual_pickup_packages')
      end as pay_pickup_packages

    from payable_rows r
    join core.operations_report_batch b on b.id = r.batch_id
    left join core.company_roster_identifier cri
      on cri.identifier_type = 'dswid'
     and upper(trim(cri.identifier_value)) = upper(trim(coalesce(r.source_dswid, r.source_driver_name)))
    left join core.company_roster cr
      on cr.id = cri.roster_id
     and cr.company_id = b.company_id
    left join public.company_roster_operations_fact_v ops
      on ops.roster_id = coalesce(cr.id, cri.roster_id)
    left join public.route_baseline rb
      on rb.id = nullif(r.normalized_row_json->>'route_baseline_id', '')::uuid
     and rb.company_id = b.company_id
  ),
  payroll_rows as (
    select
      payroll_company_id,
      payroll_service_date,
      payroll_week_end_date,
      resolved_roster_member_id,
      resolved_person_name,
      resolved_route_baseline_id,
      resolved_route_name,
      resolved_wa_number,
      string_agg(distinct nullif(normalized_row_json->>'vehicle_text', ''), ' / ') as vehicle_text,
      sum(pay_delivery_stops) as pay_delivery_stops,
      sum(pay_delivery_packages) as pay_delivery_packages,
      sum(pay_pickup_stops) as pay_pickup_stops,
      sum(pay_pickup_packages) as pay_pickup_packages,
      resolved_threshold_stops,
      resolved_threshold_rate,
      resolved_daily_pay_effective_date,
      resolved_daily_pay_rate,
      resolved_source_kind,
      (array_agg(id order by source_row_index))[1] as representative_source_ref_id,
      bool_or(resolved_roster_member_id is null) as has_unmatched,
      jsonb_agg(
        jsonb_build_object(
          'source_row_id', id,
          'batch_id', batch_id,
          'driver', source_driver_name,
          'row_kind', row_kind,
          'source_row_index', source_row_index,
          'parent_source_row_index', parent_source_row_index,
          'parent_wa_number', parent_wa_number,
          'parent_driver_name', parent_driver_name,
          'pay_delivery_stops', pay_delivery_stops,
          'pay_delivery_packages', pay_delivery_packages,
          'pay_pickup_stops', pay_pickup_stops,
          'pay_pickup_packages', pay_pickup_packages
        )
        order by source_row_index
      ) as source_evidence_json
    from computed_rows
    group by
      payroll_company_id,
      payroll_service_date,
      payroll_week_end_date,
      resolved_roster_member_id,
      resolved_person_name,
      resolved_route_baseline_id,
      resolved_route_name,
      resolved_wa_number,
      resolved_threshold_stops,
      resolved_threshold_rate,
      resolved_daily_pay_effective_date,
      resolved_daily_pay_rate,
      resolved_source_kind
  )
  select
    pr.payroll_company_id,
    pr.payroll_service_date,
    pr.payroll_week_end_date,
    pr.resolved_roster_member_id,
    pr.resolved_person_name,
    'driver',
    'present',
    pr.resolved_route_baseline_id,
    pr.resolved_route_name,
    pr.resolved_wa_number,
    pr.vehicle_text,
    pr.pay_delivery_stops,
    pr.pay_delivery_packages,
    pr.pay_pickup_stops,
    pr.pay_pickup_packages,
    pr.resolved_threshold_stops,
    pr.resolved_threshold_rate,
    greatest(pr.pay_delivery_stops + pr.pay_pickup_stops - pr.resolved_threshold_stops, 0),
    greatest(pr.pay_delivery_stops + pr.pay_pickup_stops - pr.resolved_threshold_stops, 0) * pr.resolved_threshold_rate,
    pr.resolved_daily_pay_effective_date,
    pr.resolved_daily_pay_rate,
    (
      pr.resolved_daily_pay_rate is not null
      and pr.resolved_daily_pay_effective_date <= pr.payroll_service_date
    ),
    pr.resolved_source_kind,
    pr.representative_source_ref_id,
    case when pr.has_unmatched then array['UNMATCHED'] else '{}'::text[] end,
    jsonb_build_object(
      'route_baseline_id', pr.resolved_route_baseline_id,
      'source_row_count', jsonb_array_length(pr.source_evidence_json),
      'source_evidence', pr.source_evidence_json
    )
  from payroll_rows pr;

  get diagnostics v_dsw_count = row_count;

  return jsonb_build_object('ok', true, 'dsw_rows', v_dsw_count);
end;
$$;


ALTER FUNCTION "core"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."release_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_release_reason" "text" DEFAULT 'RELEASED'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_asset core.asset%rowtype;
  v_available_status_id uuid;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  select * into v_asset
  from core.asset
  where id = p_asset_id
    and company_id = v_company_id;

  if v_asset.id is null then
    raise exception 'Asset not found';
  end if;

  select id into v_available_status_id
  from core.asset_status
  where status_key = 'AVAILABLE';

  update core.asset_assignment
  set released_at = now(),
      release_reason = coalesce(nullif(trim(p_release_reason), ''), 'RELEASED'),
      updated_at = now()
  where asset_id = p_asset_id
    and released_at is null;

  update core.asset
  set assigned_person_id = null,
      assigned_roster_member_id = null,
      released_at = now(),
      asset_status_id = v_available_status_id,
      updated_at = now()
  where id = p_asset_id;

  insert into core.asset_event (
    asset_id,
    company_id,
    event_key,
    event_label,
    from_status_id,
    to_status_id,
    person_id,
    roster_member_id,
    event_notes
  )
  values (
    p_asset_id,
    v_company_id,
    'RELEASED',
    'Asset released',
    v_asset.asset_status_id,
    v_available_status_id,
    null,
    v_asset.assigned_roster_member_id,
    coalesce(nullif(trim(p_release_reason), ''), 'RELEASED')
  );

  return jsonb_build_object('ok', true, 'asset_id', p_asset_id);
end;
$$;


ALTER FUNCTION "core"."release_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_release_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."resolve_roster_identity"("p_company_id" "uuid", "p_driver_name" "text", "p_dswid" "text", "p_fx_id" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'core', 'public'
    AS $$
  select cr.id
  from core.company_roster cr
  left join core.company_roster_operations_fact ops
    on ops.roster_id = cr.id
  where cr.company_id = p_company_id
    and (
      -- 1. DSW ID match (best signal)
      (p_dswid is not null and ops.dswid = p_dswid)

      -- 2. FX ID fallback
      or (p_fx_id is not null and ops.fx_id = p_fx_id)

      -- 3. normalized name match (fixes your “Other/unmatched” bucket)
      or (
        p_driver_name is not null
        and lower(regexp_replace(cr.full_name, '\s+', '', 'g'))
          = lower(regexp_replace(p_driver_name, '\s+', '', 'g'))
      )
    )
  limit 1;
$$;


ALTER FUNCTION "core"."resolve_roster_identity"("p_company_id" "uuid", "p_driver_name" "text", "p_dswid" "text", "p_fx_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."safe_numeric"("p_text" "text") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'core', 'public'
    AS $_$
  select case
    when nullif(regexp_replace(coalesce(p_text, ''), '[^0-9.\-]', '', 'g'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then nullif(regexp_replace(coalesce(p_text, ''), '[^0-9.\-]', '', 'g'), '')::numeric
    else null
  end;
$_$;


ALTER FUNCTION "core"."safe_numeric"("p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'core', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "core"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."update_company_operations_config"("p_company_slug" "text", "p_route_sort_key" "text", "p_route_sort_direction" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
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

  insert into core.company_operations_config (
    company_id,
    route_sort_key,
    route_sort_direction,
    updated_at
  )
  values (
    v_company_id,
    coalesce(nullif(p_route_sort_key, ''), 'route_name'),
    coalesce(nullif(p_route_sort_direction, ''), 'asc'),
    now()
  )
  on conflict (company_id) do update set
    route_sort_key = excluded.route_sort_key,
    route_sort_direction = excluded.route_sort_direction,
    updated_at = now();

  return core.get_company_operations_config(p_company_slug);
end;
$$;


ALTER FUNCTION "core"."update_company_operations_config"("p_company_slug" "text", "p_route_sort_key" "text", "p_route_sort_direction" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_profile_id uuid;
  v_existing_license_id uuid;
  v_first_name text;
  v_last_name text;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden.'; end if;

  select profile_id into v_profile_id
  from core.company_roster
  where id = p_roster_id and company_id = v_company_id;

  if not found then raise exception 'Roster record not found.'; end if;

  v_first_name := coalesce(nullif(split_part(coalesce(p_full_name, ''), ' ', 1), ''), 'Unknown');
  v_last_name := coalesce(nullif(trim(regexp_replace(coalesce(p_full_name, ''), '^\S+\s*', '')), ''), 'Unknown');

  update core.company_roster
  set full_name = nullif(trim(coalesce(p_full_name, '')), ''),
      email = nullif(lower(trim(coalesce(p_email, ''))), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      worker_type = nullif(trim(coalesce(p_worker_type, '')), ''),
      market_code = nullif(trim(coalesce(p_market_code, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_roster_id and company_id = v_company_id;

  if v_profile_id is not null then
    update core.profiles
    set email = coalesce(nullif(lower(trim(coalesce(p_email, ''))), ''), email),
        first_name = v_first_name,
        last_name = v_last_name,
        display_name = coalesce(nullif(trim(coalesce(p_full_name, '')), ''), display_name),
        mobile_phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), mobile_phone),
        updated_at = now()
    where id = v_profile_id;

    insert into core.profile_private_fact (
      profile_id, date_of_birth, address_line_1, address_line_2,
      city, state_region, postal_code, updated_at
    )
    values (
      v_profile_id,
      p_date_of_birth,
      nullif(trim(coalesce(p_address_line_1, '')), ''),
      nullif(trim(coalesce(p_address_line_2, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_state_region, '')), ''),
      nullif(trim(coalesce(p_postal_code, '')), ''),
      now()
    )
    on conflict (profile_id) do update set
      date_of_birth = excluded.date_of_birth,
      address_line_1 = excluded.address_line_1,
      address_line_2 = excluded.address_line_2,
      city = excluded.city,
      state_region = excluded.state_region,
      postal_code = excluded.postal_code,
      updated_at = now();

    if nullif(trim(coalesce(p_license_number, '')), '') is not null then
      select id into v_existing_license_id
      from core.profile_driver_license
      where profile_id = v_profile_id
      order by created_at desc
      limit 1;

      if v_existing_license_id is null then
        insert into core.profile_driver_license (
          profile_id, license_number, issuing_state, issue_date, expiration_date
        )
        values (
          v_profile_id, trim(p_license_number), trim(coalesce(p_issuing_state, '')),
          p_license_issue_date, p_license_expiration_date
        );
      else
        update core.profile_driver_license
        set license_number = trim(p_license_number),
            issuing_state = trim(coalesce(p_issuing_state, '')),
            issue_date = p_license_issue_date,
            expiration_date = p_license_expiration_date,
            updated_at = now()
        where id = v_existing_license_id;
      end if;
    end if;
  end if;

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail, event_metadata, occurred_at
  )
  values (
    v_company_id, p_roster_id, 'operations', 'details_updated',
    'Person details updated.', jsonb_build_object('source', 'person_workflow_drawer'), now()
  );

  return (
    select jsonb_build_object(
      'roster_member_id', r.id,
      'profile_id', r.profile_id,
      'full_name', r.full_name,
      'email', r.email,
      'phone', r.phone,
      'worker_type', r.worker_type,
      'market_code', r.market_code,
      'notes', r.notes,
      'date_of_birth', pf.date_of_birth,
      'address_line_1', pf.address_line_1,
      'address_line_2', pf.address_line_2,
      'city', pf.city,
      'state_region', pf.state_region,
      'postal_code', pf.postal_code,
      'license_number', dl.license_number,
      'issuing_state', dl.issuing_state,
      'license_issue_date', dl.issue_date,
      'license_expiration_date', dl.expiration_date
    )
    from core.company_roster r
    left join core.profile_private_fact pf on pf.profile_id = r.profile_id
    left join lateral (
      select *
      from core.profile_driver_license l
      where l.profile_id = r.profile_id
      order by l.created_at desc
      limit 1
    ) dl on true
    where r.id = p_roster_id and r.company_id = v_company_id
  );
end;
$$;


ALTER FUNCTION "core"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_hire_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_profile_id uuid;
  v_existing_license_id uuid;
  v_first_name text;
  v_last_name text;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden.'; end if;

  select profile_id into v_profile_id
  from core.company_roster
  where id = p_roster_id and company_id = v_company_id;

  if not found then raise exception 'Roster record not found.'; end if;

  v_first_name := coalesce(nullif(split_part(coalesce(p_full_name, ''), ' ', 1), ''), 'Unknown');
  v_last_name := coalesce(nullif(trim(regexp_replace(coalesce(p_full_name, ''), '^\S+\s*', '')), ''), 'Unknown');

  update core.company_roster
  set full_name = nullif(trim(coalesce(p_full_name, '')), ''),
      email = nullif(lower(trim(coalesce(p_email, ''))), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      worker_type = nullif(trim(coalesce(p_worker_type, '')), ''),
      market_code = nullif(trim(coalesce(p_market_code, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      hire_date = p_hire_date
  where id = p_roster_id and company_id = v_company_id;

  if v_profile_id is not null then
    update core.profiles
    set email = coalesce(nullif(lower(trim(coalesce(p_email, ''))), ''), email),
        first_name = v_first_name,
        last_name = v_last_name,
        display_name = coalesce(nullif(trim(coalesce(p_full_name, '')), ''), display_name),
        mobile_phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), mobile_phone),
        updated_at = now()
    where id = v_profile_id;

    insert into core.profile_private_fact (
      profile_id, date_of_birth, address_line_1, address_line_2,
      city, state_region, postal_code, updated_at
    )
    values (
      v_profile_id,
      p_date_of_birth,
      nullif(trim(coalesce(p_address_line_1, '')), ''),
      nullif(trim(coalesce(p_address_line_2, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_state_region, '')), ''),
      nullif(trim(coalesce(p_postal_code, '')), ''),
      now()
    )
    on conflict (profile_id) do update set
      date_of_birth = excluded.date_of_birth,
      address_line_1 = excluded.address_line_1,
      address_line_2 = excluded.address_line_2,
      city = excluded.city,
      state_region = excluded.state_region,
      postal_code = excluded.postal_code,
      updated_at = now();

    if nullif(trim(coalesce(p_license_number, '')), '') is not null then
      select id into v_existing_license_id
      from core.profile_driver_license
      where profile_id = v_profile_id
      order by created_at desc
      limit 1;

      if v_existing_license_id is null then
        insert into core.profile_driver_license (
          profile_id, license_number, issuing_state, issue_date, expiration_date
        )
        values (
          v_profile_id,
          trim(p_license_number),
          trim(coalesce(p_issuing_state, '')),
          p_license_issue_date,
          p_license_expiration_date
        );
      else
        update core.profile_driver_license
        set license_number = trim(p_license_number),
            issuing_state = trim(coalesce(p_issuing_state, '')),
            issue_date = p_license_issue_date,
            expiration_date = p_license_expiration_date,
            updated_at = now()
        where id = v_existing_license_id;
      end if;
    end if;
  end if;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    p_roster_id,
    'operations',
    'details_updated',
    'Person details updated.',
    jsonb_build_object('source', 'person_workflow_drawer'),
    now()
  );

  return (
    select jsonb_build_object(
      'roster_member_id', r.id,
      'profile_id', r.profile_id,
      'full_name', r.full_name,
      'email', r.email,
      'phone', r.phone,
      'worker_type', r.worker_type,
      'market_code', r.market_code,
      'notes', r.notes,
      'hire_date', r.hire_date,
      'date_of_birth', pf.date_of_birth,
      'address_line_1', pf.address_line_1,
      'address_line_2', pf.address_line_2,
      'city', pf.city,
      'state_region', pf.state_region,
      'postal_code', pf.postal_code,
      'license_number', dl.license_number,
      'issuing_state', dl.issuing_state,
      'license_issue_date', dl.issue_date,
      'license_expiration_date', dl.expiration_date
    )
    from core.company_roster r
    left join core.profile_private_fact pf
      on pf.profile_id = r.profile_id
    left join lateral (
      select *
      from core.profile_driver_license l
      where l.profile_id = r.profile_id
      order by l.created_at desc
      limit 1
    ) dl on true
    where r.id = p_roster_id
      and r.company_id = v_company_id
  );
end;
$$;


ALTER FUNCTION "core"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_hire_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "core"."update_company_roster_note"("p_company_slug" "text", "p_roster_id" "uuid", "p_note" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
begin
  select id
    into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not core.can_admin_company(v_company_id) then
    raise exception 'Forbidden.';
  end if;

  update core.company_roster
     set notes = nullif(trim(coalesce(p_note, '')), '')
   where id = p_roster_id
     and company_id = v_company_id;

  if not found then
    raise exception 'Roster record not found.';
  end if;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    p_roster_id,
    'operations',
    'note_updated',
    'Roster note updated.',
    jsonb_build_object('source', 'person_workflow_drawer'),
    now()
  );

  return jsonb_build_object(
    'roster_member_id', p_roster_id,
    'notes', nullif(trim(coalesce(p_note, '')), '')
  );
end;
$$;


ALTER FUNCTION "core"."update_company_roster_note"("p_company_slug" "text", "p_roster_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "legal"."bump_document_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'legal', 'public', 'core'
    AS $$
begin

    insert into legal.document_section_revision
    (
        section_id,
        section_version,
        body_markdown,
        change_summary
    )
    values
    (
        new.id,
        new.section_version,
        new.body_markdown,
        'Automatic revision'
    );

    new.section_version := old.section_version + 1;
    new.updated_at := now();

    update legal.document
       set version_patch = version_patch + 1,
           updated_at = now()
     where id = new.document_id;

    return new;

end;
$$;


ALTER FUNCTION "legal"."bump_document_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."access_context"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select core.access_context();
$$;


ALTER FUNCTION "public"."access_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_operations_mileage_heal"("p_company_id" "uuid", "p_max_reasonable_miles" numeric DEFAULT 500, "p_before_date" "date" DEFAULT CURRENT_DATE, "p_corrected_by_profile_id" "uuid" DEFAULT NULL::"uuid", "p_min_sample_size" bigint DEFAULT 1) RETURNS TABLE("corrected_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_count integer := 0;
begin
  with audit as (
    select *
    from public.get_operations_mileage_audit(p_company_id, p_max_reasonable_miles, p_before_date)
    where suggested_miles is not null
      and sample_size >= p_min_sample_size
  ),
  targets as (
    select
      a.*,
      r.normalized_row_json as original_json,
      jsonb_set(r.normalized_row_json, '{miles}', to_jsonb(a.suggested_miles), true) as healed_json
    from audit a
    join core.operations_report_raw_row r
      on r.id = a.raw_row_id
     and r.company_id = p_company_id
  ),
  logged as (
    insert into core.operations_mileage_correction_log (
      company_id, raw_row_id, batch_id, service_date, route_baseline_id,
      route_name, wa_number, driver_name, original_miles_text, original_miles,
      corrected_miles, correction_reason, correction_method,
      original_normalized_row_json, corrected_normalized_row_json, corrected_by_profile_id
    )
    select
      p_company_id, raw_row_id, batch_id, service_date, route_baseline_id,
      route_name, wa_number, driver_name, recorded_miles_text, recorded_miles,
      suggested_miles, reason, 'ROUTE_MEDIAN_MANUAL_REVIEW',
      original_json, healed_json, p_corrected_by_profile_id
    from targets
    on conflict (raw_row_id) do nothing
    returning raw_row_id
  )
  update core.operations_report_raw_row r
  set normalized_row_json = t.healed_json
  from targets t
  join logged l on l.raw_row_id = t.raw_row_id
  where r.id = t.raw_row_id
    and r.company_id = p_company_id;

  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;


ALTER FUNCTION "public"."apply_operations_mileage_heal"("p_company_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date", "p_corrected_by_profile_id" "uuid", "p_min_sample_size" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_roster_member_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select core.assign_company_asset(
    p_company_slug := p_company_slug,
    p_asset_id := p_asset_id,
    p_roster_member_id := p_roster_member_id
  );
$$;


ALTER FUNCTION "public"."assign_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_roster_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."candidate_checklist_set_item"("p_company_slug" "text", "p_roster_id" "uuid", "p_item_key" "text", "p_is_complete" boolean, "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_item_type_id uuid;
  v_item_label text;
  v_completed_at timestamptz;
begin
  select c.id
  into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  select
    cfg.item_type_id,
    cfg.display_label
  into
    v_item_type_id,
    v_item_label
  from core.company_candidate_checklist_config cfg
  join core.candidate_checklist_item_type item
    on item.id = cfg.item_type_id
  where cfg.company_id = v_company_id
    and cfg.is_enabled = true
    and item.item_key = p_item_key
    and item.is_active = true
  limit 1;

  if v_item_type_id is null then
    raise exception 'Checklist item not found';
  end if;

  v_completed_at := case when p_is_complete then now() else null end;

  insert into core.roster_candidate_checklist_fact (
    company_id,
    roster_id,
    item_type_id,
    is_complete,
    completed_at,
    note,
    updated_at
  )
  values (
    v_company_id,
    p_roster_id,
    v_item_type_id,
    p_is_complete,
    v_completed_at,
    p_note,
    now()
  )
  on conflict (company_id, roster_id, item_type_id)
  do update set
    is_complete = excluded.is_complete,
    completed_at = excluded.completed_at,
    note = excluded.note,
    updated_at = now();

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    p_roster_id,
    'hiring',
    case
      when p_is_complete then 'candidate_checklist_item_completed'
      else 'candidate_checklist_item_reopened'
    end,
    v_item_label || case when p_is_complete then ' completed.' else ' reopened.' end,
    jsonb_build_object(
      'item_key', p_item_key,
      'item_label', v_item_label,
      'note', p_note
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'item_key', p_item_key,
    'item_label', v_item_label,
    'is_complete', p_is_complete
  );
end;
$$;


ALTER FUNCTION "public"."candidate_checklist_set_item"("p_company_slug" "text", "p_roster_id" "uuid", "p_item_key" "text", "p_is_complete" boolean, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."candidate_stage_set"("p_company_slug" "text", "p_roster_id" "uuid", "p_stage_key" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_stage_type_id uuid;
  v_result jsonb;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found for slug %', p_company_slug;
  end if;

  select cst.id into v_stage_type_id
  from core.candidate_stage_type cst
  join core.company_candidate_stage_config ccsc
    on ccsc.stage_type_id = cst.id
   and ccsc.company_id = v_company_id
   and ccsc.is_enabled = true
  where cst.stage_key = p_stage_key
    and cst.is_active = true;

  if v_stage_type_id is null then
    raise exception 'Candidate stage not enabled: %', p_stage_key;
  end if;

  insert into core.roster_candidate_stage (
    company_id,
    roster_id,
    stage_type_id,
    note,
    updated_at
  )
  values (
    v_company_id,
    p_roster_id,
    v_stage_type_id,
    nullif(trim(coalesce(p_note, '')), ''),
    now()
  )
  on conflict (company_id, roster_id) do update set
    stage_type_id = excluded.stage_type_id,
    note = excluded.note,
    updated_at = now();

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    p_roster_id,
    'hiring',
    'candidate_stage_updated',
    'Candidate stage updated',
    jsonb_build_object('stage_key', p_stage_key, 'note', p_note),
    now()
  );

  select jsonb_build_object(
    'roster_id', rcs.roster_id,
    'stage_key', rsv.stage_key,
    'stage_label', coalesce(rsv.default_label, rsv.stage_key),
    'is_terminal', rsv.is_terminal,
    'note', rcs.note,
    'updated_at', rcs.updated_at
  )
  into v_result
  from core.roster_candidate_stage rcs
  join public.roster_candidate_stage_v rsv
    on rsv.id = rcs.id
  where rcs.company_id = v_company_id
    and rcs.roster_id = p_roster_id;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."candidate_stage_set"("p_company_slug" "text", "p_roster_id" "uuid", "p_stage_key" "text", "p_note" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "core"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "company_slug" "text" NOT NULL,
    "company_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "primary_industry_id" "uuid",
    "contact_email" "text" NOT NULL,
    "contact_phone" "text",
    "website_url" "text",
    "logo_url" "text",
    "company_size_band" "text",
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "companies_archived_requires_status_ck" CHECK ((("archived_at" IS NULL) OR ("company_status" = 'archived'::"text"))),
    CONSTRAINT "companies_company_name_ck" CHECK (("length"("btrim"("company_name")) > 0)),
    CONSTRAINT "companies_company_slug_ck" CHECK ((("company_slug" = "lower"("company_slug")) AND ("company_slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))),
    CONSTRAINT "companies_company_status_ck" CHECK (("company_status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'archived'::"text"]))),
    CONSTRAINT "companies_contact_email_ck" CHECK (("length"("btrim"("contact_email")) > 0))
);


ALTER TABLE "core"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_collection_request" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "request_status" "text" DEFAULT 'QUEUED'::"text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "service_date" "date",
    "service_date_start" "date",
    "service_date_end" "date",
    "requested_reports" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "request_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "claimed_by" "text",
    "claimed_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "automation_run_id" "uuid",
    "report_batch_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "error_message" "text",
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operations_collection_request_status_chk" CHECK (("request_status" = ANY (ARRAY['QUEUED'::"text", 'CLAIMED'::"text", 'RUNNING'::"text", 'ARTIFACTS_READY'::"text", 'INGESTING'::"text", 'COMPLETE'::"text", 'FAILED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "operations_collection_request_type_chk" CHECK (("request_type" = ANY (ARRAY['PREVIOUS_DAY_CLOSE'::"text", 'LAST_LOOK'::"text", 'HISTORICAL_BACKFILL'::"text", 'TARGETED_RECOVERY'::"text", 'OPERATIONS_FEED'::"text", 'OPERATIONS_PULSE'::"text"])))
);


ALTER TABLE "core"."operations_collection_request" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."operations_collection_request_v" WITH ("security_invoker"='true') AS
 SELECT "o"."id",
    "o"."company_id",
    "c"."company_slug",
    "o"."request_type",
    "o"."request_status",
    "o"."priority",
    "o"."service_date",
    "o"."service_date_start",
    "o"."service_date_end",
    "o"."requested_reports",
    "o"."request_payload",
    "o"."claimed_by",
    "o"."claimed_at",
    "o"."started_at",
    "o"."completed_at",
        CASE
            WHEN (("o"."started_at" IS NOT NULL) AND ("o"."completed_at" IS NOT NULL)) THEN ((EXTRACT(epoch FROM ("o"."completed_at" - "o"."started_at")))::integer * 1000)
            ELSE NULL::integer
        END AS "duration_ms",
    "o"."automation_run_id",
    "o"."report_batch_ids",
    "o"."error_message",
    "o"."created_by_profile_id",
    "o"."created_at",
    "o"."updated_at"
   FROM ("core"."operations_collection_request" "o"
     JOIN "core"."companies" "c" ON (("c"."id" = "o"."company_id")));


ALTER VIEW "public"."operations_collection_request_v" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_operations_collection_request"("p_runner_key" "text") RETURNS "public"."operations_collection_request_v"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_request_id uuid;
  v_row public.operations_collection_request_v;
begin
  select id into v_request_id
  from core.operations_collection_request
  where request_status = 'QUEUED'
  order by priority asc, created_at asc
  for update skip locked
  limit 1;

  if v_request_id is null then
    return null;
  end if;

  update core.operations_collection_request
  set
    request_status = 'CLAIMED',
    claimed_by = p_runner_key,
    claimed_at = now(),
    updated_at = now()
  where id = v_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = v_request_id;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."claim_operations_collection_request"("p_runner_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_effective_end" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
begin
  select id
  into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  update core.company_roster_trainee_pay_override
  set
    is_active = false,
    effective_end = p_effective_end,
    updated_at = now()
  where company_id = v_company_id
    and roster_id = p_roster_id
    and is_active = true;

  return jsonb_build_object(
    'ok', true,
    'roster_id', p_roster_id,
    'effective_end', p_effective_end
  );
end;
$$;


ALTER FUNCTION "public"."close_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_effective_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_onboarding_session"("p_session_id" "uuid", "p_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_session record;
  v_profile record;
  v_person_id uuid;
  v_membership_id uuid;
  v_onboarding_id uuid;
begin
  -- 1) Load session
  select *
  into v_session
  from public.onboarding_session
  where id = p_session_id;

  if not found then
    raise exception 'Session not found';
  end if;

  -- 2) Load signed-in profile
  select *
  into v_profile
  from core.profiles
  where auth_user_id = p_auth_user_id;

  if not found then
    raise exception 'Profile not found for auth user';
  end if;

  -- 3) Find or create person by email
  select p.id
  into v_person_id
  from public.person p
  where lower(p.email) = lower(v_profile.email)
  limit 1;

  if v_person_id is null then
    insert into public.person (
      full_name,
      email,
      phone
    )
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

  -- 4) Link roster to person + profile
  update core.company_roster
  set
    person_id = v_person_id,
    profile_id = v_profile.id,
    invite_status = 'Linked',
    onboarding_completed_at = now()
  where id = v_session.roster_id;

  -- 5) Ensure company membership exists
  select cm.id
  into v_membership_id
  from core.company_memberships cm
  where cm.company_id = v_session.company_id
    and cm.profile_id = v_profile.id
    and cm.membership_status in ('pending', 'active', 'inactive')
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
      'Created from onboarding session completion.'
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

  -- 6) Ensure company onboarding record exists
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
      'self_serve',
      v_membership_id,
      v_session.created_at,
      now(),
      'Completed from onboarding session.'
    )
    returning id into v_onboarding_id;
  else
    update core.company_onboardings
    set
      onboarding_status = 'completed',
      target_membership_id = coalesce(target_membership_id, v_membership_id),
      completed_at = now(),
      updated_at = now()
    where id = v_onboarding_id;
  end if;

  -- 7) Mark invite token used only at true completion
  update public.hiring_invite_token
  set
    status = 'used',
    used_at = coalesce(used_at, now())
  where token = v_session.invite_token;

  -- 8) Mark session complete
  update public.onboarding_session
  set
    status = 'completed',
    completed_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'person_id', v_person_id,
    'profile_id', v_profile.id,
    'membership_id', v_membership_id,
    'company_onboarding_id', v_onboarding_id,
    'roster_id', v_session.roster_id,
    'company_id', v_session.company_id
  );
end;
$$;


ALTER FUNCTION "public"."complete_onboarding_session"("p_session_id" "uuid", "p_auth_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_company_candidate_from_overlay"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_note" "text", "p_date_of_birth" "date", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_start_date" "date", "p_end_date" "date", "p_fx_id" "text", "p_dswid" "text", "p_dot_expiration_date" "date", "p_qual_cert_expiration_date" "date", "p_daily_pay_rate" numeric, "p_invite_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_company_id uuid;
  v_stage_type_id uuid;
  v_roster_id uuid;
  v_profile_id uuid;
  v_full_name text;
  v_roster_email text;
  v_profile_email text;
  v_phone text;
  v_first_name text;
  v_last_name text;
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

  v_full_name := nullif(trim(coalesce(p_full_name, '')), '');
  v_roster_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_profile_email := coalesce(
    v_roster_email,
    'candidate-' || replace(gen_random_uuid()::text, '-', '') || '@placeholder.insight.local'
  );
  v_phone := nullif(trim(coalesce(p_phone, '')), '');

  if v_full_name is null then
    raise exception 'Candidate name is required.';
  end if;

  v_first_name := coalesce(nullif(split_part(v_full_name, ' ', 1), ''), 'Unknown');
  v_last_name := coalesce(
    nullif(trim(regexp_replace(v_full_name, '^\S+\s*', '')), ''),
    'Unknown'
  );

  select stage_type_id into v_stage_type_id
  from public.company_candidate_stage_config_v
  where company_id = v_company_id
    and stage_key = 'candidate_created'
    and is_enabled = true
  limit 1;

  if v_stage_type_id is null then
    raise exception 'Candidate stage seed missing.';
  end if;

  insert into core.profiles (
    auth_user_id,
    email,
    first_name,
    last_name,
    display_name,
    mobile_phone,
    profile_status,
    created_at,
    updated_at
  )
  values (
    null,
    v_profile_email,
    v_first_name,
    v_last_name,
    v_full_name,
    v_phone,
    'active',
    now(),
    now()
  )
  returning id into v_profile_id;

  insert into core.company_roster (
    company_id,
    profile_id,
    full_name,
    email,
    phone,
    worker_type,
    market_code,
    hire_date,
    separation_date,
    employment_status,
    invite_status,
    compliance_summary,
    notes
  )
  values (
    v_company_id,
    v_profile_id,
    v_full_name,
    v_roster_email,
    v_phone,
    nullif(trim(coalesce(p_worker_type, '')), ''),
    nullif(trim(coalesce(p_market_code, '')), ''),
    p_start_date,
    p_end_date,
    'Candidate',
    'Not Invited',
    'Missing',
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_roster_id;

  insert into core.profile_private_fact (
    profile_id,
    date_of_birth,
    address_line_1,
    address_line_2,
    city,
    state_region,
    postal_code,
    created_at,
    updated_at
  )
  values (
    v_profile_id,
    p_date_of_birth,
    nullif(trim(coalesce(p_address_line_1, '')), ''),
    nullif(trim(coalesce(p_address_line_2, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_state_region, '')), ''),
    nullif(trim(coalesce(p_postal_code, '')), ''),
    now(),
    now()
  );

  if nullif(trim(coalesce(p_license_number, '')), '') is not null then
    insert into core.profile_driver_license (
      profile_id,
      license_number,
      issuing_state,
      issue_date,
      expiration_date,
      created_at,
      updated_at
    )
    values (
      v_profile_id,
      trim(p_license_number),
      coalesce(nullif(trim(coalesce(p_issuing_state, '')), ''), 'Unknown'),
      p_license_issue_date,
      coalesce(p_license_expiration_date, current_date),
      now(),
      now()
    );
  end if;

  perform public.update_company_roster_operations(
    p_company_slug,
    v_roster_id,
    p_fx_id,
    p_dswid,
    null::text,
    p_dot_expiration_date,
    p_qual_cert_expiration_date,
    coalesce(p_start_date, current_date),
    coalesce(p_daily_pay_rate, 130),
    null::text,
    null::text
  );

  insert into core.roster_candidate_stage (
    company_id,
    roster_id,
    stage_type_id,
    note
  )
  values (
    v_company_id,
    v_roster_id,
    v_stage_type_id,
    nullif(trim(coalesce(p_note, '')), '')
  );

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    v_roster_id,
    'hiring',
    'candidate_created',
    'Candidate record created from intake overlay.',
    jsonb_build_object(
      'source', 'add_candidate_overlay',
      'invite_action', coalesce(p_invite_action, 'SAVE_ONLY'),
      'profile_id', v_profile_id,
      'auth_user_created', false,
      'profile_seed_deferred', v_roster_email is null,
      'profile_placeholder_email', v_roster_email is null,
      'license_intake_present', nullif(trim(coalesce(p_license_number, '')), '') is not null,
      'private_profile_intake_present',
        p_date_of_birth is not null
        or nullif(trim(coalesce(p_address_line_1, '')), '') is not null
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_roster_id,
    'profile_id', v_profile_id
  );
end;
$$;


ALTER FUNCTION "public"."create_company_candidate_from_overlay"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_note" "text", "p_date_of_birth" "date", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_start_date" "date", "p_end_date" "date", "p_fx_id" "text", "p_dswid" "text", "p_dot_expiration_date" "date", "p_qual_cert_expiration_date" "date", "p_daily_pay_rate" numeric, "p_invite_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_company_payroll_adjustment"("p_company_slug" "text", "p_adjustment_key" "text", "p_adjustment_label" "text", "p_adjustment_scope" "text", "p_start_date" "date", "p_end_date" "date", "p_amount" numeric, "p_amount_mode" "text", "p_notes" "text", "p_roster_member_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_company_id uuid;
  v_event_id uuid;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  insert into core.payroll_adjustment_event (
    company_id,
    adjustment_key,
    adjustment_label,
    adjustment_scope,
    start_date,
    end_date,
    amount,
    amount_mode,
    notes
  )
  values (
    v_company_id,
    upper(trim(p_adjustment_key)),
    trim(p_adjustment_label),
    upper(trim(p_adjustment_scope)),
    p_start_date,
    p_end_date,
    coalesce(p_amount, 0),
    upper(trim(p_amount_mode)),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_event_id;

  if upper(trim(p_adjustment_scope)) = 'TARGETED' then
    insert into core.payroll_adjustment_target (
      adjustment_event_id,
      roster_member_id
    )
    select v_event_id, unnest(p_roster_member_ids)
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'adjustment_event_id', v_event_id);
end;
$$;


ALTER FUNCTION "public"."create_company_payroll_adjustment"("p_company_slug" "text", "p_adjustment_key" "text", "p_adjustment_label" "text", "p_adjustment_scope" "text", "p_start_date" "date", "p_end_date" "date", "p_amount" numeric, "p_amount_mode" "text", "p_notes" "text", "p_roster_member_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_company_id uuid;
  v_roster record;
  v_token uuid := gen_random_uuid();
  v_email text;
begin
  -- 1. Resolve company
  select c.id
  into v_company_id
  from public.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  -- 2. Get roster row
  select r.*
  into v_roster
  from core.company_roster r
  where r.id = p_roster_id
    and r.company_id = v_company_id;

  if not found then
    raise exception 'Roster record not found.';
  end if;

  v_email := trim(v_roster.email);

  if v_email is null or v_email = '' then
    raise exception 'Roster record missing email.';
  end if;

  -- 3. Create invite token
  insert into public.hiring_invite_token (
    id,
    company_id,
    email,
    roster_id,
    status,
    created_at
  )
  values (
    v_token,
    v_company_id,
    v_email,
    p_roster_id,
    'PENDING',
    now()
  );

  -- 4. Update roster status
  update core.company_roster
  set invite_status = 'Invited'
  where id = p_roster_id;

  -- 5. Log event
  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    p_roster_id,
    'onboarding',
    'invite_created',
    'Invite token created.',
    jsonb_build_object(
      'email', v_email,
      'token_id', v_token
    ),
    now()
  );

  -- 6. Return payload for API
  return jsonb_build_object(
    'ok', true,
    'token_id', v_token,
    'email', v_email,
    'roster_id', p_roster_id,
    'invite_status', 'Invited'
  );
end;
$$;


ALTER FUNCTION "public"."create_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_operations_collection_request"("p_company_slug" "text", "p_request_type" "text", "p_service_date" "date" DEFAULT NULL::"date", "p_service_date_start" "date" DEFAULT NULL::"date", "p_service_date_end" "date" DEFAULT NULL::"date", "p_requested_reports" "text"[] DEFAULT '{}'::"text"[], "p_request_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_priority" integer DEFAULT 100) RETURNS "public"."operations_collection_request_v"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_company_id uuid;
  v_request_id uuid;
  v_row public.operations_collection_request_v;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found for slug %', p_company_slug;
  end if;

  insert into core.operations_collection_request (
    company_id,
    request_type,
    priority,
    service_date,
    service_date_start,
    service_date_end,
    requested_reports,
    request_payload
  )
  values (
    v_company_id,
    p_request_type,
    p_priority,
    p_service_date,
    p_service_date_start,
    p_service_date_end,
    coalesce(p_requested_reports, '{}'::text[]),
    coalesce(p_request_payload, '{}'::jsonb)
  )
  returning id into v_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = v_request_id;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."create_operations_collection_request"("p_company_slug" "text", "p_request_type" "text", "p_service_date" "date", "p_service_date_start" "date", "p_service_date_end" "date", "p_requested_reports" "text"[], "p_request_payload" "jsonb", "p_priority" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_roster_dsw_alias"("p_company_id" "uuid", "p_roster_id" "uuid", "p_alias_text" "text", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
begin
  insert into core.company_roster_dsw_alias (
    company_id,
    roster_id,
    alias_text,
    created_by
  )
  values (
    p_company_id,
    p_roster_id,
    trim(p_alias_text),
    p_created_by
  )
  on conflict (company_id, alias_text) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."create_roster_dsw_alias"("p_company_id" "uuid", "p_roster_id" "uuid", "p_alias_text" "text", "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_walk_on_roster_candidate"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date" DEFAULT CURRENT_DATE, "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_result jsonb;
  v_company_id uuid;
  v_roster_id uuid;
  v_full_name text;
begin
  v_full_name := nullif(trim(coalesce(p_full_name, '')), '');

  if v_full_name is null then
    raise exception 'Walk-on driver name is required.';
  end if;

  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not core.can_admin_company(v_company_id) then
    raise exception 'Forbidden.';
  end if;

  select public.import_company_roster_rows(
    p_company_slug,
    jsonb_build_array(
      jsonb_build_object(
        'full_name', v_full_name,
        'worker_type', 'Driver',
        'role', 'Driver',
        'employment_status', 'Candidate',
        'status', 'Candidate',
        'hire_date', p_seen_date::text,
        'start_date', p_seen_date::text,
        'notes', coalesce(p_note, 'Walk-on driver added from Dispatch.'),
        'issues', jsonb_build_array()
      )
    )
  )
  into v_result;

  select r.id into v_roster_id
  from core.company_roster r
  where r.company_id = v_company_id
    and lower(regexp_replace(trim(r.full_name), '\s+', ' ', 'g')) =
        lower(regexp_replace(trim(v_full_name), '\s+', ' ', 'g'))
  order by r.created_at desc
  limit 1;

  if v_roster_id is null then
    raise exception 'Walk-on roster record was not created.';
  end if;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    v_roster_id,
    'hiring',
    'walk_on_created',
    'Walk-on driver created from Dispatch.',
    jsonb_build_object(
      'source', 'dispatch_walk_on',
      'seen_date', p_seen_date,
      'import_result', v_result
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'roster_member_id', v_roster_id,
    'full_name', v_full_name,
    'import_result', v_result
  );
end;
$$;


ALTER FUNCTION "public"."create_walk_on_roster_candidate"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_profile"() RETURNS TABLE("profile_id" "uuid", "auth_user_id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "display_name" "text", "mobile_phone" "text", "profile_status" "text", "is_platform_owner" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select * from core.current_profile();
$$;


ALTER FUNCTION "public"."current_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_profile_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select core.current_profile_id();
$$;


ALTER FUNCTION "public"."current_profile_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_event_types"("p_company_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_types jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'event_code', t.event_code,
        'event_label', t.event_label,
        'event_category', t.event_category,
        'source', t.source,
        'entry_mode', t.entry_mode,
        'requires_person', t.requires_person,
        'requires_route', t.requires_route,
        'requires_assignment', t.requires_assignment,
        'allows_note', t.allows_note,
        'requires_note', t.requires_note,
        'sort_order', t.sort_order
      )
      order by t.sort_order, t.event_label
    ),
    '[]'::jsonb
  )
  into v_types
  from core.dispatch_event_type t
  where t.is_active = true
    and t.entry_mode in ('manual', 'both')
    and (t.company_id is null or t.company_id = p_company_id);

  return v_types;
end;
$$;


ALTER FUNCTION "public"."dispatch_event_types"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_get_or_create_day"("p_company_id" "uuid", "p_dispatch_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_day core.dispatch_day;
  v_events jsonb;
begin
  insert into core.dispatch_day (company_id, dispatch_date, status)
  values (p_company_id, p_dispatch_date, 'ACTIVE')
  on conflict (company_id, dispatch_date) do nothing;

  select *
  into v_day
  from core.dispatch_day
  where company_id = p_company_id
    and dispatch_date = p_dispatch_date;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb)
  into v_events
  from core.dispatch_event e
  where e.dispatch_day_id = v_day.id;

  return jsonb_build_object(
    'dispatch_day', to_jsonb(v_day),
    'events', v_events
  );
end;
$$;


ALTER FUNCTION "public"."dispatch_get_or_create_day"("p_company_id" "uuid", "p_dispatch_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_lock_day"("p_company_id" "uuid", "p_dispatch_date" "date", "p_snapshot_json" "jsonb", "p_locked_by_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_day core.dispatch_day;
begin
  insert into core.dispatch_day (company_id, dispatch_date, status)
  values (p_company_id, p_dispatch_date, 'ACTIVE')
  on conflict (company_id, dispatch_date) do nothing;

  update core.dispatch_day
  set
    status = 'LOCKED',
    locked_at = now(),
    locked_by_profile_id = p_locked_by_profile_id,
    snapshot_json = coalesce(p_snapshot_json, '{}'::jsonb),
    updated_at = now()
  where company_id = p_company_id
    and dispatch_date = p_dispatch_date
  returning *
  into v_day;

  return jsonb_build_object('dispatch_day', to_jsonb(v_day));
end;
$$;


ALTER FUNCTION "public"."dispatch_lock_day"("p_company_id" "uuid", "p_dispatch_date" "date", "p_snapshot_json" "jsonb", "p_locked_by_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_record_event"("p_company_id" "uuid", "p_dispatch_date" "date", "p_event_code" "text", "p_event_label" "text" DEFAULT NULL::"text", "p_event_category" "text" DEFAULT NULL::"text", "p_route_key" "text" DEFAULT NULL::"text", "p_route_label" "text" DEFAULT NULL::"text", "p_seat" "text" DEFAULT NULL::"text", "p_person_roster_member_id" "uuid" DEFAULT NULL::"uuid", "p_person_name" "text" DEFAULT NULL::"text", "p_from_route_key" "text" DEFAULT NULL::"text", "p_from_route_label" "text" DEFAULT NULL::"text", "p_to_route_key" "text" DEFAULT NULL::"text", "p_to_route_label" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text", "p_event_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_created_by_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_day core.dispatch_day;
  v_type core.dispatch_event_type;
  v_event core.dispatch_event;
begin
  insert into core.dispatch_day (company_id, dispatch_date, status)
  values (p_company_id, p_dispatch_date, 'ACTIVE')
  on conflict (company_id, dispatch_date) do nothing;

  select *
  into v_day
  from core.dispatch_day
  where company_id = p_company_id
    and dispatch_date = p_dispatch_date;

  if v_day.status = 'LOCKED' then
    raise exception 'Dispatch day is locked.';
  end if;

  select *
  into v_type
  from core.dispatch_event_type
  where event_code = p_event_code
    and is_active = true
    and (company_id = p_company_id or company_id is null)
  order by company_id nulls last
  limit 1;

  insert into core.dispatch_event (
    dispatch_day_id,
    event_type_id,
    event_code,
    event_label,
    event_category,
    route_key,
    route_label,
    seat,
    person_roster_member_id,
    person_name,
    from_route_key,
    from_route_label,
    to_route_key,
    to_route_label,
    note,
    event_payload,
    created_by_profile_id
  )
  values (
    v_day.id,
    v_type.id,
    p_event_code,
    coalesce(nullif(trim(p_event_label), ''), v_type.event_label, p_event_code),
    coalesce(nullif(trim(p_event_category), ''), v_type.event_category, 'DISPATCH'),
    p_route_key,
    p_route_label,
    p_seat,
    p_person_roster_member_id,
    p_person_name,
    p_from_route_key,
    p_from_route_label,
    p_to_route_key,
    p_to_route_label,
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_event_payload, '{}'::jsonb),
    p_created_by_profile_id
  )
  returning *
  into v_event;

  update core.dispatch_day
  set updated_at = now()
  where id = v_day.id;

  return jsonb_build_object(
    'dispatch_day', to_jsonb(v_day),
    'event', to_jsonb(v_event)
  );
end;
$$;


ALTER FUNCTION "public"."dispatch_record_event"("p_company_id" "uuid", "p_dispatch_date" "date", "p_event_code" "text", "p_event_label" "text", "p_event_category" "text", "p_route_key" "text", "p_route_label" "text", "p_seat" "text", "p_person_roster_member_id" "uuid", "p_person_name" "text", "p_from_route_key" "text", "p_from_route_label" "text", "p_to_route_key" "text", "p_to_route_label" "text", "p_note" "text", "p_event_payload" "jsonb", "p_created_by_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_access_context"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
begin
  perform core.ensure_access_context();
end;
$$;


ALTER FUNCTION "public"."ensure_access_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text" DEFAULT NULL::"text", "p_batch_id" "uuid" DEFAULT NULL::"uuid", "p_inserted_rows" integer DEFAULT NULL::integer, "p_matched_rows" integer DEFAULT NULL::integer, "p_unmatched_rows" integer DEFAULT NULL::integer, "p_error_message" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
begin
  update core.operations_automation_run
  set
    completed_at = now(),
    duration_ms = floor(extract(epoch from (now() - started_at)) * 1000)::integer,
    status = p_status,
    source_filename = p_source_filename,
    batch_id = p_batch_id,
    inserted_rows = p_inserted_rows,
    matched_rows = p_matched_rows,
    unmatched_rows = p_unmatched_rows,
    error_message = p_error_message
  where id = p_run_id;

  return p_run_id;
end;
$$;


ALTER FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text", "p_batch_id" "uuid", "p_inserted_rows" integer, "p_matched_rows" integer, "p_unmatched_rows" integer, "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text" DEFAULT NULL::"text", "p_batch_id" "uuid" DEFAULT NULL::"uuid", "p_inserted_rows" integer DEFAULT NULL::integer, "p_matched_rows" integer DEFAULT NULL::integer, "p_unmatched_rows" integer DEFAULT NULL::integer, "p_error_message" "text" DEFAULT NULL::"text", "p_route_count" integer DEFAULT NULL::integer, "p_summary_rows" integer DEFAULT NULL::integer, "p_download_ms" integer DEFAULT NULL::integer, "p_ingest_ms" integer DEFAULT NULL::integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
begin
  update core.operations_automation_run
  set
    completed_at = now(),
    duration_ms = floor(extract(epoch from (now() - started_at)) * 1000)::integer,
    status = p_status,
    source_filename = p_source_filename,
    batch_id = p_batch_id,
    inserted_rows = p_inserted_rows,
    matched_rows = p_matched_rows,
    unmatched_rows = p_unmatched_rows,
    route_count = p_route_count,
    summary_rows = p_summary_rows,
    download_ms = p_download_ms,
    ingest_ms = p_ingest_ms,
    error_message = p_error_message
  where id = p_run_id;

  return p_run_id;
end;
$$;


ALTER FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text", "p_batch_id" "uuid", "p_inserted_rows" integer, "p_matched_rows" integer, "p_unmatched_rows" integer, "p_error_message" "text", "p_route_count" integer, "p_summary_rows" integer, "p_download_ms" integer, "p_ingest_ms" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_company_contract_config"("p_company_slug" "text", "p_service_date" "date") RETURNS TABLE("id" "uuid", "company_id" "uuid", "contract_number" "text", "terminal_identity" "text", "service_area" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
begin
  return query
  select
    cfg.id,
    cfg.company_id,
    cfg.contract_number,
    cfg.terminal_identity,
    cfg.service_area
  from core.company_contract_config cfg
  join core.companies c on c.id = cfg.company_id
  where c.company_slug = p_company_slug
    and cfg.status = 'ACTIVE'
    and cfg.effective_start_date <= p_service_date
    and (cfg.effective_end_date is null or cfg.effective_end_date >= p_service_date)
  order by cfg.effective_start_date desc
  limit 1;
end;
$$;


ALTER FUNCTION "public"."get_active_company_contract_config"("p_company_slug" "text", "p_service_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_automation_credential"("p_profile_id" "uuid") RETURNS TABLE("username" "text", "has_secret" boolean, "last_verified_at" timestamp with time zone, "last_verification_result" "text", "updated_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select
    c.username,
    c.has_secret,
    c.last_verified_at,
    c.last_verification_result,
    c.updated_at
  from core.automation_credential c
  where c.profile_id = p_profile_id;
$$;


ALTER FUNCTION "public"."get_automation_credential"("p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_automation_credential_for_verify"("p_profile_id" "uuid") RETURNS TABLE("username" "text", "encrypted_secret" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select c.username, c.encrypted_secret
  from core.automation_credential c
  where c.profile_id = p_profile_id
    and c.has_secret = true
  limit 1;
$$;


ALTER FUNCTION "public"."get_automation_credential_for_verify"("p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_access_config"("p_company_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_access jsonb;
  v_company_id uuid;
  v_membership jsonb;
  v_can_edit boolean;
begin
  v_access := core.access_context();

  select c.id
  into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    return jsonb_build_object('error', 'Company not found.');
  end if;

  select m
  into v_membership
  from jsonb_array_elements(coalesce(v_access->'memberships', '[]'::jsonb)) m
  where m->>'company_slug' = p_company_slug
  limit 1;

  v_can_edit :=
    coalesce((v_access->>'is_platform_owner')::boolean, false)
    or (
      v_membership->>'relationship_type' = 'admin'
      and v_membership->>'membership_status' = 'active'
    );

  if not v_can_edit then
    return jsonb_build_object('error', 'Forbidden.');
  end if;

  return jsonb_build_object(
    'company_id', v_company_id,
    'can_edit', v_can_edit,
    'people',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'profile_id', p.id,
          'display_name', coalesce(p.display_name, trim(concat_ws(' ', p.first_name, p.last_name)), p.email),
          'email', p.email,
          'is_platform_owner', coalesce(p.is_platform_owner, false),
          'relationship_type', cm.relationship_type,
          'membership_status', cm.membership_status,
          'title', cm.title,
          'grants', coalesce((
            select jsonb_agg(g.grant_key order by g.grant_key)
            from core.company_user_grant g
            where g.company_id = cm.company_id
              and g.profile_id = cm.profile_id
              and g.is_active = true
          ), '[]'::jsonb)
        )
        order by coalesce(p.display_name, p.email)
      )
      from core.company_memberships cm
      join core.profiles p on p.id = cm.profile_id
      where cm.company_id = v_company_id
        and cm.membership_status in ('pending', 'active', 'inactive')
    ), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."get_company_access_config"("p_company_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_operations_config"("p_company_slug" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select core.get_company_operations_config(p_company_slug);
$$;


ALTER FUNCTION "public"."get_company_operations_config"("p_company_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_operations_history"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("batch_id" "uuid", "company_id" "uuid", "service_date" "date", "weekday_number" integer, "weekday_key" "text", "is_weekday" boolean, "is_weekend" boolean, "source_filename" "text", "batch_created_at" timestamp with time zone, "generated_at_text" "text", "terminal_identity" "text", "contract_label" "text", "route_count" integer, "actual_delivery_stops" numeric, "actual_delivery_packages" numeric, "actual_pickup_stops" numeric, "actual_pickup_packages" numeric, "total_stops" numeric, "total_packages" numeric, "recorded_miles" numeric, "valid_miles" numeric, "mileage_anomaly_count" integer, "routes_with_miles" integer, "on_road_hours" numeric, "on_duty_hours" numeric, "routes_with_road_hours" integer, "routes_with_duty_hours" integer, "potential_dot_hours_violations" integer, "ils_percent" numeric, "ils_impact_packages" numeric, "exceptions" numeric, "dna" numeric, "code_85" numeric, "send_again" numeric, "all_status_code_packages" numeric, "required_signature" numeric, "planned_delivery_stops" numeric, "planned_pickup_stops" numeric, "normalized_row_json" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
begin
  if p_company_id is null then
    raise exception 'Company id is required.'
      using errcode = '22023';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Start date and end date are required.'
      using errcode = '22023';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date must not precede start date.'
      using errcode = '22023';
  end if;

  if (p_end_date - p_start_date) > 365 then
    raise exception 'Analytics history requests are limited to 366 calendar days.'
      using errcode = '22023';
  end if;

  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.'
      using errcode = '42501';
  end if;

  return query
  select *
  from core.get_company_operations_history_internal(
    p_company_id,
    p_start_date,
    p_end_date
  );
end;
$$;


ALTER FUNCTION "public"."get_company_operations_history"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_operations_history_years"("p_company_id" "uuid") RETURNS TABLE("operating_year" integer, "finalized_operating_day_count" bigint, "through_service_date" "date")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
begin
  if p_company_id is null then
    raise exception 'Company id is required.'
      using errcode = '22023';
  end if;

  if not core.can_read_company_data(p_company_id) then
    raise exception 'You do not have access to this company.'
      using errcode = '42501';
  end if;

  return query
  select *
  from core.get_company_operations_history_years_internal(
    p_company_id
  );
end;
$$;


ALTER FUNCTION "public"."get_company_operations_history_years"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_operations_calendar"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("service_date" "date", "status" "text", "has_final" boolean, "has_in_day" boolean, "has_inactive" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select
    b.service_date,
    case
      when b.service_date >= ((now() at time zone 'America/New_York')::date) then 'empty'
      when bool_or(b.snapshot_kind = 'FINAL' and b.status = 'LOADED') then 'final'
      when bool_or(b.snapshot_kind = 'IN_DAY' and b.status = 'LOADED') then 'in_day'
      when bool_or(b.status in ('REPLACED', 'FAILED')) then 'inactive'
      else 'empty'
    end as status,
    bool_or(b.snapshot_kind = 'FINAL' and b.status = 'LOADED') as has_final,
    bool_or(b.snapshot_kind = 'IN_DAY' and b.status = 'LOADED') as has_in_day,
    bool_or(b.status in ('REPLACED', 'FAILED')) as has_inactive
  from core.operations_report_batch b
  where b.company_id = p_company_id
    and b.report_family_key = 'DSW'
    and b.service_date between p_start_date and p_end_date
  group by b.service_date
  order by b.service_date;
$$;


ALTER FUNCTION "public"."get_daily_operations_calendar"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_operations_summary"("p_company_id" "uuid", "p_service_date" "date") RETURNS TABLE("batch_id" "uuid", "service_date" "date", "source_filename" "text", "created_at" timestamp with time zone, "summary_scope" "text", "summary_label" "text", "terminal_code" "text", "route_count" integer, "normalized_row_json" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $_$
  with final_batch as (
    select b.*
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.service_date = p_service_date
      and b.snapshot_kind = 'FINAL'
      and b.status = 'LOADED'
    order by b.created_at desc
    limit 1
  ),
  route_count as (
    select count(*)::integer as routes
    from final_batch b
    join core.operations_report_raw_row r on r.batch_id = b.id
    where r.row_kind = 'ROUTE'
      and nullif(r.normalized_row_json->>'wa_name', '') is not null
      and coalesce(r.source_route_key, '') !~ '^[0-9]+$'
  )
  select
    b.id,
    b.service_date,
    b.source_filename,
    b.created_at,
    s.summary_scope,
    s.summary_label,
    s.terminal_code,
    rc.routes,
    s.normalized_row_json
  from final_batch b
  join core.operations_report_summary_row s on s.batch_id = b.id
  cross join route_count rc
  where s.summary_scope = 'CONTRACT'
  order by s.source_row_index
  limit 1;
$_$;


ALTER FUNCTION "public"."get_daily_operations_summary"("p_company_id" "uuid", "p_service_date" "date") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_automation_schedule_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "automation_type" "text" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "cadence_minutes" integer DEFAULT 15 NOT NULL,
    "window_preset" "text" DEFAULT 'SORT_DELIVERY_DAY'::"text" NOT NULL,
    "start_time" time without time zone DEFAULT '05:00:00'::time without time zone NOT NULL,
    "end_time" time without time zone DEFAULT '23:45:00'::time without time zone NOT NULL,
    "min_cooldown_minutes" integer DEFAULT 12 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operations_automation_schedule_cadence_chk" CHECK (("cadence_minutes" = ANY (ARRAY[15, 30, 60]))),
    CONSTRAINT "operations_automation_schedule_cooldown_chk" CHECK (("min_cooldown_minutes" = ANY (ARRAY[12, 25, 50]))),
    CONSTRAINT "operations_automation_schedule_window_chk" CHECK (("window_preset" = ANY (ARRAY['SORT_DELIVERY_DAY'::"text", 'BUSINESS_DAY'::"text", 'OFF'::"text"])))
);


ALTER TABLE "core"."operations_automation_schedule_config" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."operations_automation_schedule_config_v" WITH ("security_invoker"='true') AS
 SELECT "s"."id",
    "s"."company_id",
    "c"."company_slug",
    "s"."automation_type",
    "s"."is_enabled",
    "s"."cadence_minutes",
    "s"."window_preset",
    "s"."start_time",
    "s"."end_time",
    "s"."min_cooldown_minutes",
    "s"."created_at",
    "s"."updated_at"
   FROM ("core"."operations_automation_schedule_config" "s"
     JOIN "core"."companies" "c" ON (("c"."id" = "s"."company_id")));


ALTER VIEW "public"."operations_automation_schedule_config_v" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_automation_schedule_config"("p_company_slug" "text") RETURNS SETOF "public"."operations_automation_schedule_config_v"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  insert into core.operations_automation_schedule_config (
    company_id,
    automation_type,
    is_enabled,
    cadence_minutes,
    window_preset,
    start_time,
    end_time,
    min_cooldown_minutes
  )
  values
    (v_company_id, 'DSW', false, 15, 'SORT_DELIVERY_DAY', '05:00', '23:45', 12),
    (v_company_id, 'FCC', false, 15, 'SORT_DELIVERY_DAY', '05:00', '23:45', 12)
  on conflict (company_id, automation_type) do nothing;

  return query
  select *
  from public.operations_automation_schedule_config_v
  where company_id = v_company_id
  order by automation_type;
end;
$$;


ALTER FUNCTION "public"."get_operations_automation_schedule_config"("p_company_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_dro_plan_rows"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text" DEFAULT 'PM'::"text") RETURNS TABLE("batch_id" "uuid", "service_date" "date", "report_frame" "text", "route_baseline_id" "uuid", "route_name" "text", "wa_number" "text", "stops" integer, "packages" integer, "time_commits" integer, "miles" numeric, "planned_time" numeric, "miles_per_stop" numeric, "minutes_per_stop" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
with latest_batch as (
  select
    b.id,
    b.service_date,
    b.report_frame
  from core.operations_report_batch b
  where b.company_id = p_company_id
    and b.report_family_key = 'DRO'
    and b.service_date = p_service_date
    and b.report_frame = p_report_frame
    and b.status = 'STAGED'
    and (
      (p_report_frame = 'AM'
        and b.report_shape_key = 'DRO_AM_ROUTE_READINESS')
      or
      (p_report_frame = 'PM'
        and b.report_shape_key = 'DRO_PM_ROUTE_PROJECTION')
    )
  order by b.created_at desc
  limit 1
),
rows as (
  select
    lb.id as batch_id,
    lb.service_date,
    lb.report_frame,
    r.normalized_row_json
  from latest_batch lb
  join core.operations_report_raw_row r
    on r.batch_id = lb.id
  where r.row_kind = 'ROUTE'
)
select
  rows.batch_id,
  rows.service_date,
  rows.report_frame,
  nullif(rows.normalized_row_json->>'route_baseline_id', '')::uuid as route_baseline_id,
  rows.normalized_row_json->>'wa_name' as route_name,
  rows.normalized_row_json->>'wa_number' as wa_number,
  (
    coalesce((rows.normalized_row_json->>'lp_stops')::numeric, 0)
    + coalesce((rows.normalized_row_json->>'bulk_stops')::numeric, 0)
    + coalesce((rows.normalized_row_json->>'small_stops')::numeric, 0)
    + coalesce((rows.normalized_row_json->>'reg_stops')::numeric, 0)
  )::integer as stops,
  (
    coalesce((rows.normalized_row_json->>'lp_packages')::numeric, 0)
    + coalesce((rows.normalized_row_json->>'bulk_packages')::numeric, 0)
    + coalesce((rows.normalized_row_json->>'small_packages')::numeric, 0)
    + coalesce((rows.normalized_row_json->>'reg_packages')::numeric, 0)
  )::integer as packages,
  coalesce((rows.normalized_row_json->>'time_commits')::numeric, 0)::integer as time_commits,
  nullif(rows.normalized_row_json->>'distance', '')::numeric as miles,
  nullif(rows.normalized_row_json->>'planned_time', '')::numeric as planned_time,
  case
    when (
      coalesce((rows.normalized_row_json->>'lp_stops')::numeric, 0)
      + coalesce((rows.normalized_row_json->>'bulk_stops')::numeric, 0)
      + coalesce((rows.normalized_row_json->>'small_stops')::numeric, 0)
      + coalesce((rows.normalized_row_json->>'reg_stops')::numeric, 0)
    ) > 0
    then round(
      nullif(rows.normalized_row_json->>'distance', '')::numeric
      /
      (
        coalesce((rows.normalized_row_json->>'lp_stops')::numeric, 0)
        + coalesce((rows.normalized_row_json->>'bulk_stops')::numeric, 0)
        + coalesce((rows.normalized_row_json->>'small_stops')::numeric, 0)
        + coalesce((rows.normalized_row_json->>'reg_stops')::numeric, 0)
      ),
      2
    )
    else null
  end as miles_per_stop,
  case
    when (
      coalesce((rows.normalized_row_json->>'lp_stops')::numeric, 0)
      + coalesce((rows.normalized_row_json->>'bulk_stops')::numeric, 0)
      + coalesce((rows.normalized_row_json->>'small_stops')::numeric, 0)
      + coalesce((rows.normalized_row_json->>'reg_stops')::numeric, 0)
    ) > 0
    then round(
      (nullif(rows.normalized_row_json->>'planned_time', '')::numeric * 60)
      /
      (
        coalesce((rows.normalized_row_json->>'lp_stops')::numeric, 0)
        + coalesce((rows.normalized_row_json->>'bulk_stops')::numeric, 0)
        + coalesce((rows.normalized_row_json->>'small_stops')::numeric, 0)
        + coalesce((rows.normalized_row_json->>'reg_stops')::numeric, 0)
      ),
      1
    )
    else null
  end as minutes_per_stop
from rows;
$$;


ALTER FUNCTION "public"."get_operations_dro_plan_rows"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_dsw_current_rows"("p_company_id" "uuid", "p_service_date" "date") RETURNS TABLE("batch_id" "uuid", "service_date" "date", "generated_at_text" "text", "terminal_identity" "text", "contract_filter" "text", "route_baseline_id" "uuid", "route_name" "text", "wa_number" "text", "driver_name" "text", "vehicle_text" "text", "vscan_packages" integer, "planned_delivery_stops" integer, "planned_pickup_stops" integer, "actual_delivery_stops" integer, "actual_delivery_packages" integer, "actual_pickup_stops" integer, "actual_pickup_packages" integer, "miles" numeric, "route_match_method" "text", "normalized_row_json" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
with latest_batch as (
  select
    b.id,
    b.service_date,
    b.metadata_json
  from core.operations_report_batch b
  where b.company_id = p_company_id
    and b.report_family_key = 'DSW'
    and b.report_shape_key = 'DSW_DAILY_SERVICE_WORKSHEET'
    and b.service_date = p_service_date
    and b.snapshot_kind = 'IN_DAY'
    and b.status = 'LOADED'
  order by b.created_at desc
  limit 1
)
select
  lb.id as batch_id,
  lb.service_date,
  lb.metadata_json->>'generated_at_text' as generated_at_text,
  lb.metadata_json->>'terminal_identity' as terminal_identity,
  lb.metadata_json->>'contract_filter' as contract_filter,
  nullif(r.normalized_row_json->>'route_baseline_id', '')::uuid,
  r.normalized_row_json->>'wa_name',
  r.normalized_row_json->>'wa_number',
  r.normalized_row_json->>'driver_name',
  r.normalized_row_json->>'vehicle_text',
  coalesce((r.normalized_row_json->>'vscan_packages')::numeric,0)::integer,
  coalesce((r.normalized_row_json->>'planned_delivery_stops')::numeric,0)::integer,
  coalesce((r.normalized_row_json->>'planned_pickup_stops')::numeric,0)::integer,
  coalesce((r.normalized_row_json->>'actual_delivery_stops')::numeric,0)::integer,
  coalesce((r.normalized_row_json->>'actual_delivery_packages')::numeric,0)::integer,
  coalesce((r.normalized_row_json->>'actual_pickup_stops')::numeric,0)::integer,
  coalesce((r.normalized_row_json->>'actual_pickup_packages')::numeric,0)::integer,
  nullif(r.normalized_row_json->>'miles','')::numeric,
  r.normalized_row_json->>'route_match_method',
  r.normalized_row_json
from latest_batch lb
join core.operations_report_raw_row r
  on r.batch_id = lb.id
where r.row_kind = 'ROUTE';
$$;


ALTER FUNCTION "public"."get_operations_dsw_current_rows"("p_company_id" "uuid", "p_service_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_dsw_service_snapshot"("p_company_id" "uuid", "p_service_date" "date") RETURNS TABLE("batch_id" "uuid", "service_date" "date", "created_at" timestamp with time zone, "generated_at_text" "text", "summary_scope" "text", "summary_label" "text", "contract_code" "text", "terminal_code" "text", "normalized_row_json" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  with latest_batch as (
    select b.*
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.report_shape_key in ('DSW_FINALIZED_DAY', 'DSW_DAILY_SERVICE_WORKSHEET')
      and b.service_date = p_service_date
      and b.status = 'LOADED'
    order by
      case when b.report_shape_key = 'DSW_FINALIZED_DAY' then 0 else 1 end,
      b.created_at desc
    limit 1
  )
  select
    b.id as batch_id,
    b.service_date,
    b.created_at,
    b.metadata_json->>'generated_at_text' as generated_at_text,
    s.summary_scope,
    s.summary_label,
    s.contract_code,
    s.terminal_code,
    s.normalized_row_json
  from latest_batch b
  join core.operations_report_summary_row s
    on s.batch_id = b.id
  order by s.source_row_index;
$$;


ALTER FUNCTION "public"."get_operations_dsw_service_snapshot"("p_company_id" "uuid", "p_service_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_fcc_current_rows"("p_company_id" "uuid", "p_service_date" "date") RETURNS TABLE("id" "uuid", "source_row_index" integer, "source_route_key" "text", "source_wa_number" "text", "source_driver_name" "text", "normalized_row_json" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  with latest_batch as (
    select b.id
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'FCC'
      and b.service_date = p_service_date
      and b.status = 'LOADED'
    order by b.created_at desc
    limit 1
  )
  select
    r.id,
    r.source_row_index,
    r.source_route_key,
    r.source_wa_number,
    r.source_driver_name,
    r.normalized_row_json
  from core.operations_report_raw_row r
  join latest_batch b on b.id = r.batch_id
  order by r.source_row_index;
$$;


ALTER FUNCTION "public"."get_operations_fcc_current_rows"("p_company_id" "uuid", "p_service_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_intelligence_route_history"("p_company_id" "uuid", "p_service_dates" "date"[]) RETURNS TABLE("service_date" "date", "route_baseline_id" "uuid", "route_name" "text", "wa_number" "text", "driver_name" "text", "actual_delivery_stops" numeric, "actual_delivery_packages" numeric, "miles" numeric, "on_duty_hours" numeric, "on_road_hours" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $_$
  select
    b.service_date,
    nullif(r.normalized_row_json->>'route_baseline_id', '')::uuid,
    coalesce(r.normalized_row_json->>'wa_name', r.source_route_key),
    coalesce(r.normalized_row_json->>'wa_number', r.source_wa_number),
    coalesce(r.normalized_row_json->>'driver_name', r.source_driver_name),
    nullif(r.normalized_row_json->>'actual_delivery_stops', '')::numeric,
    nullif(r.normalized_row_json->>'actual_delivery_packages', '')::numeric,
    nullif(r.normalized_row_json->>'miles', '')::numeric,
    case
      when r.normalized_row_json->>'on_duty_hours' ~ '^\d+:\d{2}$'
        then split_part(r.normalized_row_json->>'on_duty_hours', ':', 1)::numeric
          + split_part(r.normalized_row_json->>'on_duty_hours', ':', 2)::numeric / 60
      else nullif(r.normalized_row_json->>'on_duty_hours', '')::numeric
    end,
    case
      when r.normalized_row_json->>'on_road_hours' ~ '^\d+:\d{2}$'
        then split_part(r.normalized_row_json->>'on_road_hours', ':', 1)::numeric
          + split_part(r.normalized_row_json->>'on_road_hours', ':', 2)::numeric / 60
      else nullif(r.normalized_row_json->>'on_road_hours', '')::numeric
    end
  from core.operations_report_batch b
  join core.operations_report_raw_row r
    on r.batch_id = b.id
   and r.company_id = b.company_id
  where b.company_id = p_company_id
    and b.service_date = any(p_service_dates)
    and b.report_family_key = 'DSW'
    and b.status in ('LOADED', 'INGESTED')
    and r.row_kind = 'ROUTE'
  order by
    b.service_date desc,
    coalesce(r.normalized_row_json->>'wa_name', r.source_route_key) asc;
$_$;


ALTER FUNCTION "public"."get_operations_intelligence_route_history"("p_company_id" "uuid", "p_service_dates" "date"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_mileage_audit"("p_company_id" "uuid", "p_max_reasonable_miles" numeric DEFAULT 500, "p_before_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("raw_row_id" "uuid", "batch_id" "uuid", "service_date" "date", "route_baseline_id" "uuid", "route_name" "text", "wa_number" "text", "driver_name" "text", "recorded_miles_text" "text", "recorded_miles" numeric, "suggested_miles" numeric, "reason" "text", "sample_size" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $_$
  with dsw_rows as (
    select
      r.id as raw_row_id,
      r.batch_id,
      b.service_date,
      nullif(r.normalized_row_json->>'route_baseline_id', '')::uuid as route_baseline_id,
      coalesce(r.normalized_row_json->>'wa_name', r.source_route_key) as route_name,
      coalesce(r.normalized_row_json->>'wa_number', r.source_wa_number) as wa_number,
      coalesce(r.normalized_row_json->>'driver_name', r.source_driver_name) as driver_name,
      nullif(r.normalized_row_json->>'miles', '') as recorded_miles_text,

      case
        when regexp_replace(coalesce(r.normalized_row_json->>'miles', ''), ',', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then regexp_replace(r.normalized_row_json->>'miles', ',', '', 'g')::numeric
        else null
      end as recorded_miles,

      case
        when regexp_replace(coalesce(r.normalized_row_json->>'actual_delivery_stops', ''), ',', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then regexp_replace(r.normalized_row_json->>'actual_delivery_stops', ',', '', 'g')::numeric
        else null
      end as stops,

      case
        when regexp_replace(coalesce(r.normalized_row_json->>'actual_delivery_packages', ''), ',', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then regexp_replace(r.normalized_row_json->>'actual_delivery_packages', ',', '', 'g')::numeric
        else null
      end as packages,

      coalesce(
        nullif(r.normalized_row_json->>'wa_number', ''),
        nullif(r.source_wa_number, ''),
        nullif(r.normalized_row_json->>'wa_name', ''),
        nullif(r.source_route_key, ''),
        nullif(r.normalized_row_json->>'route_baseline_id', '')
      ) as route_key
    from core.operations_report_batch b
    join core.operations_report_raw_row r
      on r.batch_id = b.id
     and r.company_id = b.company_id
    left join core.operations_mileage_audit_review review
      on review.raw_row_id = r.id
     and review.company_id = r.company_id
     and review.review_action = 'IGNORE'
    where b.company_id = p_company_id
      and b.service_date < p_before_date
      and b.report_family_key = 'DSW'
      and b.status in ('LOADED', 'INGESTED')
      and r.row_kind = 'ROUTE'
      and review.id is null
  ),

  clean_route_samples as (
    select *
    from dsw_rows
    where route_key is not null
      and recorded_miles > 0
      and recorded_miles <= p_max_reasonable_miles
      and stops > 0
      and packages > 0
  ),

  route_model as (
    select
      route_key,
      percentile_cont(0.5) within group (order by recorded_miles) as median_miles,
      avg(recorded_miles) as avg_miles,
      avg(stops) as avg_stops,
      avg(packages) as avg_packages,
      count(*) as sample_size
    from clean_route_samples
    group by route_key
  ),

  target_rows as (
    select
      d.*,
      m.median_miles,
      m.avg_stops,
      m.avg_packages,
      m.sample_size
    from dsw_rows d
    join route_model m
      on m.route_key = d.route_key
    where d.recorded_miles_text is null
       or d.recorded_miles is null
       or d.recorded_miles <= 0
       or d.recorded_miles > p_max_reasonable_miles
  )

  select
    t.raw_row_id,
    t.batch_id,
    t.service_date,
    t.route_baseline_id,
    t.route_name,
    t.wa_number,
    t.driver_name,
    t.recorded_miles_text,
    t.recorded_miles,

    round(
      greatest(
        1,
        t.median_miles
          * (
              1
              + least(greatest(coalesce((t.stops - t.avg_stops) / nullif(t.avg_stops, 0), 0), -0.35), 0.35) * 0.65
              + least(greatest(coalesce((t.packages - t.avg_packages) / nullif(t.avg_packages, 0), 0), -0.25), 0.25) * 0.20
            )
      )::numeric,
      1
    ) as suggested_miles,

    case
      when t.recorded_miles_text is null then 'MISSING_MILEAGE'
      when t.recorded_miles is null then 'INVALID_MILEAGE'
      when t.recorded_miles <= 0 then 'ZERO_OR_NEGATIVE_MILEAGE'
      when t.recorded_miles > p_max_reasonable_miles then 'IMPOSSIBLE_MILEAGE'
      else 'UNKNOWN'
    end as reason,

    t.sample_size
  from target_rows t
  order by t.service_date desc, t.route_name asc;
$_$;


ALTER FUNCTION "public"."get_operations_mileage_audit"("p_company_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_planning_snapshot"("p_company_id" "uuid", "p_service_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'core'
    AS $$
with weekday_history as (
  select *
  from core.operations_dsw_daily_fact_v
  where company_id = p_company_id
    and extract(isodow from service_date) =
        extract(isodow from p_service_date)
    and service_date < p_service_date
),
same_weekday as (
  select
    percentile_cont(0.5) within group (order by routes) as routes,
    percentile_cont(0.5) within group (order by delivery_stops) as stops,
    percentile_cont(0.5) within group (order by delivery_packages) as packages
  from weekday_history
),
last4_weekday as (
  select *
  from weekday_history
  order by service_date desc
  limit 4
),
last4 as (
  select
    percentile_cont(0.5) within group (order by routes) as routes,
    percentile_cont(0.5) within group (order by delivery_stops) as stops,
    percentile_cont(0.5) within group (order by delivery_packages) as packages
  from last4_weekday
),
last14_days as (
  select *
  from core.operations_dsw_daily_fact_v
  where company_id = p_company_id
    and service_date < p_service_date
  order by service_date desc
  limit 14
),
last14 as (
  select
    percentile_cont(0.5) within group (order by routes) as routes,
    percentile_cont(0.5) within group (order by delivery_stops) as stops,
    percentile_cont(0.5) within group (order by delivery_packages) as packages
  from last14_days
)
select jsonb_build_object(
  'same_weekday', (select row_to_json(same_weekday) from same_weekday),
  'last4_weekday', (select row_to_json(last4) from last4),
  'last14_days', (select row_to_json(last14) from last14)
);
$$;


ALTER FUNCTION "public"."get_operations_planning_snapshot"("p_company_id" "uuid", "p_service_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_planning_trends"("p_company_id" "uuid", "p_service_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
with last14 as (
  select
    service_date,
    service_date_label,
    day_label,
    routes,
    delivery_stops,
    delivery_packages
  from core.operations_planning_trend_v
  where company_id = p_company_id
    and service_date < p_service_date
  order by service_date desc
  limit 14
),
same_weekday as (
  select
    service_date,
    service_date_label,
    day_label,
    routes,
    delivery_stops,
    delivery_packages
  from core.operations_planning_trend_v
  where company_id = p_company_id
    and iso_weekday = extract(isodow from p_service_date)
    and service_date < p_service_date
  order by service_date desc
  limit 8
),
weekly as (
  select
    fedex_week_start,
    fedex_week_end,
    sum(routes)::integer as routes,
    sum(delivery_stops)::integer as delivery_stops,
    sum(delivery_packages)::integer as delivery_packages
  from core.operations_planning_trend_v
  where company_id = p_company_id
  group by fedex_week_start, fedex_week_end
  order by fedex_week_start desc
  limit 12
)
select jsonb_build_object(
  'last14',
  (
    select jsonb_agg(
      jsonb_build_object(
        'service_date', service_date,
        'day_label', day_label,
        'label', service_date_label,
        'routes', routes,
        'stops', delivery_stops,
        'packages', delivery_packages
      )
      order by service_date
    )
    from last14
  ),
  'same_weekday',
  (
    select jsonb_agg(
      jsonb_build_object(
        'service_date', service_date,
        'day_label', day_label,
        'label', service_date_label,
        'routes', routes,
        'stops', delivery_stops,
        'packages', delivery_packages
      )
      order by service_date
    )
    from same_weekday
  ),
  'weekly',
  (
    select jsonb_agg(
      jsonb_build_object(
        'week_start', fedex_week_start,
        'week_end', fedex_week_end,
        'label', to_char(fedex_week_start, 'MM/DD') || '-' || to_char(fedex_week_end, 'MM/DD'),
        'routes', routes,
        'stops', delivery_stops,
        'packages', delivery_packages
      )
      order by fedex_week_start
    )
    from weekly
  )
);
$$;


ALTER FUNCTION "public"."get_operations_planning_trends"("p_company_id" "uuid", "p_service_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_prior_day_dsw_summary"("p_company_id" "uuid", "p_service_date" "date") RETURNS TABLE("batch_id" "uuid", "service_date" "date", "snapshot_kind" "text", "status" "text", "source_filename" "text", "created_at" timestamp with time zone, "summary_scope" "text", "summary_label" "text", "contract_code" "text", "terminal_code" "text", "normalized_row_json" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  with final_batch as (
    select b.*
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.service_date = p_service_date
      and b.snapshot_kind = 'FINAL'
      and b.status = 'LOADED'
    order by b.created_at desc
    limit 1
  )
  select
    b.id as batch_id,
    b.service_date,
    b.snapshot_kind,
    b.status,
    b.source_filename,
    b.created_at,
    s.summary_scope,
    s.summary_label,
    s.contract_code,
    s.terminal_code,
    s.normalized_row_json
  from final_batch b
  join core.operations_report_summary_row s
    on s.batch_id = b.id
  where s.summary_scope = 'CONTRACT'
  order by s.source_row_index
  limit 1;
$$;


ALTER FUNCTION "public"."get_operations_prior_day_dsw_summary"("p_company_id" "uuid", "p_service_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_prior_day_summary"("p_company_id" "uuid", "p_service_date" "date") RETURNS TABLE("batch_id" "uuid", "service_date" "date", "snapshot_kind" "text", "status" "text", "source_filename" "text", "created_at" timestamp with time zone, "row_id" "uuid", "source_row_index" integer, "wa_number" "text", "route_name" "text", "driver_name" "text", "planned_delivery_stops" numeric, "actual_delivery_stops" numeric, "stop_diff" numeric, "vscan_packages" numeric, "actual_delivery_packages" numeric, "exceptions" numeric, "code_85" numeric, "dna" numeric, "send_again" numeric, "on_duty_hours" "text", "on_road_hours" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $_$
  with final_batch as (
    select b.*
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.service_date = p_service_date
      and b.snapshot_kind = 'FINAL'
      and b.status = 'LOADED'
    order by b.created_at desc
    limit 1
  )
  select
    b.id as batch_id,
    b.service_date,
    b.snapshot_kind,
    b.status,
    b.source_filename,
    b.created_at,
    r.id as row_id,
    r.source_row_index,
    coalesce(nullif(r.normalized_row_json->>'wa_number', ''), r.source_wa_number) as wa_number,
    r.normalized_row_json->>'wa_name' as route_name,
    coalesce(nullif(r.normalized_row_json->>'driver_name', ''), r.source_driver_name) as driver_name,
    nullif(r.normalized_row_json->>'planned_delivery_stops', '')::numeric as planned_delivery_stops,
    nullif(r.normalized_row_json->>'actual_delivery_stops', '')::numeric as actual_delivery_stops,
    nullif(r.normalized_row_json->>'diff', '')::numeric as stop_diff,
    nullif(r.normalized_row_json->>'vscan_packages', '')::numeric as vscan_packages,
    nullif(r.normalized_row_json->>'actual_delivery_packages', '')::numeric as actual_delivery_packages,
    nullif(r.normalized_row_json->>'exceptions', '')::numeric as exceptions,
    nullif(r.normalized_row_json->>'code_85', '')::numeric as code_85,
    nullif(r.normalized_row_json->>'dna', '')::numeric as dna,
    nullif(r.normalized_row_json->>'send_again', '')::numeric as send_again,
    nullif(r.normalized_row_json->>'on_duty_hours', '') as on_duty_hours,
    nullif(r.normalized_row_json->>'on_road_hours', '') as on_road_hours
  from final_batch b
  join core.operations_report_raw_row r
    on r.batch_id = b.id
  where r.row_kind = 'ROUTE'
    and nullif(r.normalized_row_json->>'wa_name', '') is not null
    and coalesce(r.source_route_key, '') !~ '^[0-9]+$'
  order by r.source_row_index;
$_$;


ALTER FUNCTION "public"."get_operations_prior_day_summary"("p_company_id" "uuid", "p_service_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operations_report_batch_feed"("p_company_id" "uuid", "p_report_family_key" "text", "p_service_dates" "date"[], "p_limit" integer DEFAULT 3) RETURNS TABLE("id" "uuid", "report_family_key" "text", "report_frame" "text", "service_date" "date", "source_filename" "text", "status" "text", "created_at" timestamp with time zone, "metadata_json" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select
    b.id,
    b.report_family_key,
    b.report_frame,
    b.service_date,
    b.source_filename,
    b.status,
    b.created_at,
    b.metadata_json
  from core.operations_report_batch b
  where b.company_id = p_company_id
    and b.report_family_key = p_report_family_key
    and b.service_date = any(p_service_dates)
  order by b.created_at desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."get_operations_report_batch_feed"("p_company_id" "uuid", "p_report_family_key" "text", "p_service_dates" "date"[], "p_limit" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."automation_profile" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "provider_key" "text" NOT NULL,
    "status" "text" DEFAULT 'NOT_CONFIGURED'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."automation_profile" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."automation_profile_v" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "provider_key",
    "status",
    "created_at",
    "updated_at"
   FROM "core"."automation_profile";


ALTER VIEW "public"."automation_profile_v" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_automation_profile"("p_company_id" "uuid", "p_provider_key" "text") RETURNS "public"."automation_profile_v"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_profile core.automation_profile%rowtype;
begin
  select *
  into v_profile
  from core.automation_profile
  where company_id = p_company_id
    and provider_key = p_provider_key
  limit 1;

  if v_profile.id is null then
    insert into core.automation_profile (
      company_id,
      provider_key,
      status
    )
    values (
      p_company_id,
      p_provider_key,
      'NOT_CONFIGURED'
    )
    returning * into v_profile;
  end if;

  return (
    v_profile.id,
    v_profile.company_id,
    v_profile.provider_key,
    v_profile.status,
    v_profile.created_at,
    v_profile.updated_at
  )::public.automation_profile_v;
end;
$$;


ALTER FUNCTION "public"."get_or_create_automation_profile"("p_company_id" "uuid", "p_provider_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payroll_time_tracking_dsw_rows"("p_company_id" "uuid", "p_week_start" "date", "p_week_end" "date") RETURNS TABLE("batch_id" "uuid", "service_date" "date", "source_row_index" integer, "roster_member_id" "uuid", "person_name" "text", "worker_type" "text", "dswid" "text", "driver_name" "text", "route_name" "text", "wa_number" "text", "on_duty_hours" "text", "on_road_hours" "text", "potential_dot_hours_violations" integer, "next_available_on_duty" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  with latest_batches as (
    select distinct on (b.service_date)
      b.id,
      b.service_date,
      b.created_at
    from core.operations_report_batch b
    where b.company_id = p_company_id
      and b.report_family_key = 'DSW'
      and b.report_shape_key = 'DSW_FINALIZED_DAY'
      and b.status = 'LOADED'
      and b.service_date between p_week_start and p_week_end
    order by b.service_date, b.created_at desc
  ),
  dsw_rows as (
    select
      b.id as batch_id,
      b.service_date,
      r.source_row_index,
      nullif(coalesce(r.source_driver_name, r.normalized_row_json->>'driver_name'), '') as driver_name,
      nullif(coalesce(r.source_route_key, r.normalized_row_json->>'wa_name'), '') as route_name,
      nullif(coalesce(r.source_wa_number, r.normalized_row_json->>'wa_number'), '') as wa_number,
      nullif(r.normalized_row_json->>'on_duty_hours', '') as on_duty_hours,
      nullif(r.normalized_row_json->>'on_road_hours', '') as on_road_hours,
      nullif(r.normalized_row_json->>'potential_dot_hours_violations', '')::integer as potential_dot_hours_violations,
      nullif(r.normalized_row_json->>'next_available_on_duty', '') as next_available_on_duty,
      public.payroll_dsw_bridge_key(nullif(coalesce(r.source_driver_name, r.normalized_row_json->>'driver_name'), '')) as driver_key
    from latest_batches b
    join core.operations_report_raw_row r
      on r.batch_id = b.id
    where nullif(coalesce(r.source_driver_name, r.normalized_row_json->>'driver_name'), '') is not null
  ),
  roster_matches as (
    select distinct on (public.payroll_dsw_bridge_key(crv.dswid))
      public.payroll_dsw_bridge_key(crv.dswid) as driver_key,
      crv.roster_member_id,
      crv.full_name,
      crv.worker_type,
      crv.dswid
    from public.company_roster_view crv
    where crv.company_id = p_company_id
      and nullif(crv.dswid, '') is not null
      and public.payroll_dsw_bridge_key(crv.dswid) <> ''
    order by public.payroll_dsw_bridge_key(crv.dswid), crv.full_name
  )
  select
    d.batch_id,
    d.service_date,
    d.source_row_index,
    rm.roster_member_id,
    rm.full_name as person_name,
    rm.worker_type,
    rm.dswid,
    d.driver_name,
    d.route_name,
    d.wa_number,
    d.on_duty_hours,
    d.on_road_hours,
    d.potential_dot_hours_violations,
    d.next_available_on_duty
  from dsw_rows d
  left join roster_matches rm
    on rm.driver_key = d.driver_key
  order by d.service_date, d.source_row_index;
$$;


ALTER FUNCTION "public"."get_payroll_time_tracking_dsw_rows"("p_company_id" "uuid", "p_week_start" "date", "p_week_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hiring_upsert_candidate"("p_company_slug" "text", "p_full_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_worker_type" "text" DEFAULT NULL::"text", "p_market_code" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_existing core.company_roster;
  v_roster core.company_roster;
  v_email text := nullif(lower(trim(p_email)), '');
begin
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Candidate name is required';
  end if;

  select id
  into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  if v_email is not null then
    select *
    into v_existing
    from core.company_roster
    where company_id = v_company_id
      and lower(trim(email)) = v_email
    limit 1;
  end if;

  if v_existing.id is not null then
    update core.company_roster
    set
      full_name = trim(p_full_name),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      worker_type = coalesce(nullif(trim(coalesce(p_worker_type, '')), ''), worker_type),
      market_code = coalesce(nullif(trim(coalesce(p_market_code, '')), ''), market_code),
      employment_status = 'Candidate'
    where id = v_existing.id
    returning *
    into v_roster;

    insert into core.company_roster_event (
      company_id,
      roster_id,
      event_category,
      event_type,
      event_detail,
      event_metadata,
      occurred_at
    )
    values (
      v_company_id,
      v_roster.id,
      'hiring',
      'candidate_updated',
      'Candidate updated from hiring pipeline.',
      jsonb_build_object(
        'source', 'hiring_candidate_overlay',
        'note', p_note
      ),
      now()
    );
  else
    insert into core.company_roster (
      company_id,
      full_name,
      email,
      phone,
      worker_type,
      employment_status,
      market_code,
      invite_status,
      compliance_summary
    )
    values (
      v_company_id,
      trim(p_full_name),
      v_email,
      nullif(trim(coalesce(p_phone, '')), ''),
      coalesce(nullif(trim(coalesce(p_worker_type, '')), ''), 'Candidate'),
      'Candidate',
      nullif(trim(coalesce(p_market_code, '')), ''),
      'Not Invited',
      'Missing'
    )
    returning *
    into v_roster;

    insert into core.company_roster_event (
      company_id,
      roster_id,
      event_category,
      event_type,
      event_detail,
      event_metadata,
      occurred_at
    )
    values (
      v_company_id,
      v_roster.id,
      'hiring',
      'candidate_created',
      'Candidate created from hiring pipeline.',
      jsonb_build_object(
        'source', 'hiring_candidate_overlay',
        'note', p_note
      ),
      now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_roster.id,
    'full_name', v_roster.full_name,
    'email', v_roster.email,
    'phone', v_roster.phone,
    'worker_type', v_roster.worker_type,
    'employment_status', v_roster.employment_status,
    'market_code', v_roster.market_code,
    'invite_status', v_roster.invite_status,
    'compliance_summary', v_roster.compliance_summary
  );
end;
$$;


ALTER FUNCTION "public"."hiring_upsert_candidate"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_company_roster_rows"("p_company_slug" "text", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_company_id uuid;
  v_row jsonb;
  v_roster_id uuid;
  v_inserted_count integer := 0;
begin
  select c.id
  into v_company_id
  from public.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  for v_row in
    select value
    from jsonb_array_elements(p_rows)
  loop
    if jsonb_array_length(coalesce(v_row -> 'issues', '[]'::jsonb)) > 0 then
      continue;
    end if;

    insert into core.company_roster (
      company_id,
      full_name,
      email,
      phone,
      worker_type,
      job_title,
      employment_status,
      market_code,
      hire_date,
      invite_status,
      compliance_summary
    )
    values (
      v_company_id,
      nullif(trim(coalesce(v_row ->> 'full_name', '')), ''),
      nullif(trim(coalesce(v_row ->> 'email', '')), ''),
      nullif(trim(coalesce(v_row ->> 'phone', '')), ''),
      nullif(trim(coalesce(v_row ->> 'role', '')), ''),
      nullif(trim(coalesce(v_row ->> 'role', '')), ''),
      case lower(trim(coalesce(v_row ->> 'status', '')))
        when 'active' then 'Active'
        when 'candidate' then 'Candidate'
        when 'former' then 'Former'
        when 'inactive' then 'Former'
        else 'Candidate'
      end,
      nullif(trim(coalesce(v_row ->> 'market', '')), ''),
      case
        when nullif(trim(coalesce(v_row ->> 'start_date', '')), '') is null then null
        else (v_row ->> 'start_date')::date
      end,
      'Not Invited',
      'Missing'
    )
    returning id into v_roster_id;

    if nullif(trim(coalesce(v_row ->> 'fx_id', '')), '') is not null then
      insert into core.company_roster_identifier (
        roster_id,
        identifier_type,
        identifier_value
      )
      values (
        v_roster_id,
        'fx_id',
        trim(v_row ->> 'fx_id')
      );
    end if;

    if nullif(trim(coalesce(v_row ->> 'dswid', '')), '') is not null then
      insert into core.company_roster_identifier (
        roster_id,
        identifier_type,
        identifier_value
      )
      values (
        v_roster_id,
        'dswid',
        trim(v_row ->> 'dswid')
      );
    end if;

    insert into core.company_roster_event (
      company_id,
      roster_id,
      event_category,
      event_type,
      event_detail,
      event_metadata,
      occurred_at
    )
    values (
      v_company_id,
      v_roster_id,
      'hiring',
      'candidate_imported',
      'Candidate imported from roster CSV.',
      jsonb_build_object(
        'source', 'csv_import',
        'status', nullif(trim(coalesce(v_row ->> 'status', '')), ''),
        'role', nullif(trim(coalesce(v_row ->> 'role', '')), ''),
        'market', nullif(trim(coalesce(v_row ->> 'market', '')), ''),
        'fx_id', nullif(trim(coalesce(v_row ->> 'fx_id', '')), ''),
        'dswid', nullif(trim(coalesce(v_row ->> 'dswid', '')), '')
      ),
      now()
    );

    v_inserted_count := v_inserted_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'inserted_count', v_inserted_count
  );
end;
$$;


ALTER FUNCTION "public"."import_company_roster_rows"("p_company_slug" "text", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_batch_id uuid;
begin
  delete from core.operations_report_summary_row s
  using core.operations_report_batch b
  where s.batch_id = b.id
    and b.company_id = p_company_id
    and b.report_family_key = 'DSW'
    and b.report_shape_key = 'DSW_FINALIZED_DAY'
    and b.service_date = p_service_date;

  delete from core.operations_report_raw_row r
  using core.operations_report_batch b
  where r.batch_id = b.id
    and b.company_id = p_company_id
    and b.report_family_key = 'DSW'
    and b.report_shape_key = 'DSW_FINALIZED_DAY'
    and b.service_date = p_service_date;

  delete from core.operations_report_batch
  where company_id = p_company_id
    and report_family_key = 'DSW'
    and report_shape_key = 'DSW_FINALIZED_DAY'
    and service_date = p_service_date;

  insert into core.operations_report_batch (
    company_id,
    report_family_key,
    report_shape_key,
    service_date,
    report_frame,
    snapshot_kind,
    source_filename,
    source_hash,
    detected_sheet_name,
    detected_header_row,
    detected_headers,
    row_count,
    route_row_count,
    participant_row_count,
    skipped_row_count,
    status,
    uploaded_by_profile_id,
    metadata_json
  )
  values (
    p_company_id,
    'DSW',
    'DSW_FINALIZED_DAY',
    p_service_date,
    'FINAL',
    'FINAL',
    p_source_filename,
    p_source_hash,
    'legacy_csv_archive',
    1,
    p_detected_headers,
    p_row_count,
    jsonb_array_length(p_rows),
    0,
    p_row_count - jsonb_array_length(p_rows),
    'FINALIZED',
    p_uploaded_by_profile_id,
    p_metadata_json
  )
  returning id into v_batch_id;

  insert into core.operations_report_raw_row (
    batch_id,
    company_id,
    sheet_name,
    source_row_index,
    row_kind,
    raw_row_json,
    normalized_row_json,
    source_route_key,
    source_wa_number,
    source_driver_name
  )
  select
    v_batch_id,
    p_company_id,
    'legacy_csv_archive',
    r.source_row_index,
    'ROUTE',
    r.raw_row_json,
    r.normalized_row_json,
    r.source_route_key,
    r.source_wa_number,
    r.source_driver_name
  from jsonb_to_recordset(p_rows) as r(
    source_row_index integer,
    raw_row_json jsonb,
    normalized_row_json jsonb,
    source_route_key text,
    source_wa_number text,
    source_driver_name text
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'service_date', p_service_date,
    'inserted_row_count', jsonb_array_length(p_rows)
  );
end;
$$;


ALTER FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb", "p_summary_rows" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_batch_id uuid;
  v_deleted_batches integer := 0;
begin

  delete from core.operations_report_summary_row s
  using core.operations_report_batch b
  where s.batch_id = b.id
    and b.company_id = p_company_id
    and b.report_family_key = 'DSW'
    and b.report_shape_key in ('DSW_FINALIZED_DAY','DSW_DAILY_SERVICE_WORKSHEET')
    and b.service_date = p_service_date;

  delete from core.operations_report_raw_row r
  using core.operations_report_batch b
  where r.batch_id = b.id
    and b.company_id = p_company_id
    and b.report_family_key = 'DSW'
    and b.report_shape_key in ('DSW_FINALIZED_DAY','DSW_DAILY_SERVICE_WORKSHEET')
    and b.service_date = p_service_date;

  delete from core.operations_report_batch
  where company_id = p_company_id
    and report_family_key = 'DSW'
    and report_shape_key in ('DSW_FINALIZED_DAY','DSW_DAILY_SERVICE_WORKSHEET')
    and service_date = p_service_date;

  get diagnostics v_deleted_batches = row_count;

  insert into core.operations_report_batch (
    company_id,
    report_family_key,
    report_shape_key,
    service_date,
    report_frame,
    snapshot_kind,
    source_filename,
    source_hash,
    detected_sheet_name,
    detected_header_row,
    detected_headers,
    row_count,
    route_row_count,
    participant_row_count,
    skipped_row_count,
    status,
    uploaded_by_profile_id,
    metadata_json
  )
  values (
    p_company_id,
    'DSW',
    'DSW_FINALIZED_DAY',
    p_service_date,
    null,
    'FINAL',
    p_source_filename,
    p_source_hash,
    coalesce(p_metadata_json->>'detected_sheet_name','DSW'),
    coalesce((p_metadata_json->>'detected_header_row')::integer,1),
    p_detected_headers,
    p_row_count,
    jsonb_array_length(p_rows),
    0,
    greatest(p_row_count - jsonb_array_length(p_rows),0),
    'LOADED',
    p_uploaded_by_profile_id,
    p_metadata_json
  )
  returning id into v_batch_id;

  insert into core.operations_report_raw_row (
    batch_id,
    company_id,
    sheet_name,
    source_row_index,
    row_kind,

    parent_source_row_index,
    parent_route_key,
    parent_wa_number,
    parent_driver_name,

    raw_row_json,
    normalized_row_json,
    source_route_key,
    source_wa_number,
    source_driver_name,
    source_dswid
  )
  select
    v_batch_id,
    p_company_id,
    coalesce(r.sheet_name, p_metadata_json->>'detected_sheet_name', 'DSW'),
    r.source_row_index,
    coalesce(r.row_kind,'ROUTE'),

    r.parent_source_row_index,
    r.parent_route_key,
    r.parent_wa_number,
    r.parent_driver_name,

    r.raw_row_json,
    r.normalized_row_json,
    r.source_route_key,
    r.source_wa_number,
    r.source_driver_name,
    r.source_dswid

  from jsonb_to_recordset(p_rows) as r(
    sheet_name text,
    source_row_index integer,
    row_kind text,

    parent_source_row_index integer,
    parent_route_key text,
    parent_wa_number text,
    parent_driver_name text,

    raw_row_json jsonb,
    normalized_row_json jsonb,
    source_route_key text,
    source_wa_number text,
    source_driver_name text,
    source_dswid text
  );

  insert into core.operations_report_summary_row (
    batch_id,
    company_id,
    report_family_key,
    service_date,
    summary_scope,
    summary_label,
    contract_code,
    terminal_code,
    source_row_index,
    raw_row_json,
    normalized_row_json
  )
  select
    v_batch_id,
    p_company_id,
    'DSW',
    p_service_date,
    s.summary_scope,
    s.summary_label,
    s.contract_code,
    s.terminal_code,
    s.source_row_index,
    s.raw_row_json,
    s.normalized_row_json
  from jsonb_to_recordset(p_summary_rows) as s(
    summary_scope text,
    summary_label text,
    contract_code text,
    terminal_code text,
    source_row_index integer,
    raw_row_json jsonb,
    normalized_row_json jsonb
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'service_date', p_service_date,
    'snapshot_kind', 'FINAL',
    'status', 'LOADED',
    'deleted_batch_count', v_deleted_batches,
    'inserted_row_count', jsonb_array_length(p_rows),
    'inserted_summary_row_count', jsonb_array_length(p_summary_rows)
  );
end;
$$;


ALTER FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb", "p_summary_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."legal_update_document_section"("p_section_id" "uuid", "p_body" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'legal', 'core'
    AS $$
declare
  v_updated_at timestamptz;
begin

  update legal.document_section
     set body_markdown = p_body,
         updated_at = now()
   where id = p_section_id
   returning updated_at
   into v_updated_at;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Section not found'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'section_id', p_section_id,
    'updated_at', v_updated_at
  );

end;
$$;


ALTER FUNCTION "public"."legal_update_document_section"("p_section_id" "uuid", "p_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_industries"() RETURNS TABLE("id" "uuid", "industry_key" "text", "industry_label" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'ref'
    AS $$
  select
    i.id,
    i.industry_key,
    i.industry_label
  from ref.industries i
  where i.is_active = true
  order by i.sort_order asc, i.industry_label asc
$$;


ALTER FUNCTION "public"."list_industries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_payroll_dsw_unmatched"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("service_date" "date", "person_name" "text", "route_name" "text", "wa_number" "text", "actual_delivery_stops" numeric, "actual_pickup_stops" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select
    f.service_date,
    f.person_name,
    f.route_name,
    f.wa_number,
    f.actual_delivery_stops,
    f.actual_pickup_stops
  from core.payroll_activity_fact f
  where f.company_id = p_company_id
    and f.service_date between p_start_date and p_end_date
    and f.roster_member_id is null
    and nullif(trim(f.person_name), '') is not null;
$$;


ALTER FUNCTION "public"."list_payroll_dsw_unmatched"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_roster_invite_sent"("p_company_id" "uuid", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_token_id" "uuid", "p_email_provider_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
begin
  update core.company_roster
  set invite_status = 'Invited'
  where id = p_roster_id
    and company_id = p_company_id;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    p_company_id,
    p_roster_id,
    'onboarding',
    'invite_sent',
    'Invite email sent from roster.',
    jsonb_build_object(
      'source', 'roster_invite_button',
      'full_name', p_full_name,
      'email', p_email,
      'token_id', p_token_id,
      'email_provider_id', p_email_provider_id
    ),
    now()
  );
end;
$$;


ALTER FUNCTION "public"."mark_roster_invite_sent"("p_company_id" "uuid", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_token_id" "uuid", "p_email_provider_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("batch_id" "uuid", "company_id" "uuid", "report_family_key" "text", "report_shape_key" "text", "service_date" "date", "report_frame" "text", "snapshot_kind" "text", "source_filename" "text", "source_hash" "text", "detected_sheet_name" "text", "detected_header_row" integer, "detected_headers" "text"[], "row_count" integer, "route_row_count" integer, "participant_row_count" integer, "skipped_row_count" integer, "status" "text", "uploaded_by_profile_id" "uuid", "metadata_json" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "raw_row_count" bigint, "matched_row_count" bigint, "unmatched_row_count" bigint, "summary_row_count" bigint, "summary_rows" "jsonb", "total_history_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'core'
    AS $$
  select *
  from core.operations_report_history(
    p_company_id,
    p_report_family_key,
    p_limit,
    p_offset
  );
$$;


ALTER FUNCTION "public"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."paint_schedule_day_fact_for_company"("p_company_id" "uuid", "p_start_date" "date" DEFAULT CURRENT_DATE, "p_horizon_days" integer DEFAULT 70) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_window_start date;
  v_window_end date;

  v_generated_count integer := 0;
  v_override_count integer := 0;
  v_deleted_count integer := 0;
  v_baseline_count integer := 0;
  v_add_in_insert_count integer := 0;

  v_terminal_id uuid;
begin
  v_window_start := coalesce(p_start_date, current_date);

  v_window_end :=
    v_window_start
    + greatest(coalesce(p_horizon_days, 70) - 1, 0);

  /*
   * Preserve the existing terminal-resolution behavior before deleting
   * any materialized rows in the requested window.
   */
  select sdf.terminal_id
  into v_terminal_id
  from public.schedule_day_fact sdf
  where sdf.company_id = p_company_id
    and sdf.terminal_id <>
      '00000000-0000-0000-0000-000000000000'::uuid
  order by
    sdf.service_date desc,
    sdf.created_at desc
  limit 1;

  v_terminal_id := coalesce(
    v_terminal_id,
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  /*
   * Preserve the existing baseline reporting count.
   */
  select count(*)::integer
  into v_baseline_count
  from public.schedule_baseline sb
  where sb.company_id = p_company_id
    and sb.is_active = true
    and sb.effective_end is null
    and sb.effective_start <= v_window_end;

  /*
   * Replace the existing materialized window.
   */
  delete from public.schedule_day_fact
  where company_id = p_company_id
    and service_date between v_window_start and v_window_end;

  get diagnostics v_deleted_count = row_count;

  /*
   * Materialize the exact output of the shared read-only resolver.
   *
   * We deliberately use v_terminal_id rather than the resolver's returned
   * terminal_id because the prior facts have already been deleted.
   */
  insert into public.schedule_day_fact (
    company_id,
    terminal_id,
    service_date,
    roster_member_id,
    planned_on,
    route_name,
    source_kind,
    preset_id,
    rotation_mode,
    anchor_date,
    baseline_id,
    override_id
  )
  select
    projection.company_id,
    v_terminal_id,
    projection.service_date,
    projection.roster_member_id,
    projection.planned_on,
    projection.route_name,
    projection.source_kind,
    projection.preset_id,
    projection.rotation_mode,
    projection.anchor_date,
    projection.baseline_id,
    projection.override_id
  from public.resolve_schedule_projection(
    p_company_id,
    v_window_start,
    p_horizon_days
  ) projection;

  /*
   * Rows originating from a baseline equal the prior loop's generated count.
   * Off overrides retain their baseline_id, just as the old painter updated
   * an already-generated baseline row.
   */
  select count(*)::integer
  into v_generated_count
  from public.schedule_day_fact sdf
  where sdf.company_id = p_company_id
    and sdf.service_date between v_window_start and v_window_end
    and sdf.baseline_id is not null;

  /*
   * Preserve the old override_count meaning:
   * baseline rows changed by CALL_OUT, TIME_OFF, or ADMIN_OFF.
   */
  select count(*)::integer
  into v_override_count
  from public.schedule_day_fact sdf
  join public.schedule_override so
    on so.id = sdf.override_id
  where sdf.company_id = p_company_id
    and sdf.service_date between v_window_start and v_window_end
    and sdf.baseline_id is not null
    and so.override_type in (
      'CALL_OUT',
      'TIME_OFF',
      'ADMIN_OFF'
    );

  /*
   * Preserve the old add_in_insert_count meaning:
   * ADD_IN rows created where no baseline row existed.
   */
  select count(*)::integer
  into v_add_in_insert_count
  from public.schedule_day_fact sdf
  join public.schedule_override so
    on so.id = sdf.override_id
  where sdf.company_id = p_company_id
    and sdf.service_date between v_window_start and v_window_end
    and sdf.baseline_id is null
    and so.override_type = 'ADD_IN';

  return jsonb_build_object(
    'ok', true,
    'mode', 'company_repainted',
    'company_id', p_company_id,
    'window_start', v_window_start,
    'window_end', v_window_end,
    'baselines_touched', v_baseline_count,
    'deleted_existing_count', v_deleted_count,
    'generated_count', v_generated_count,
    'override_count', v_override_count,
    'add_in_insert_count', v_add_in_insert_count,
    'terminal_id_used', v_terminal_id
  );
end;
$$;


ALTER FUNCTION "public"."paint_schedule_day_fact_for_company"("p_company_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."paint_schedule_day_fact_for_roster_member"("p_company_id" "uuid", "p_roster_member_id" "uuid", "p_start_date" "date" DEFAULT CURRENT_DATE, "p_horizon_days" integer DEFAULT 70) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_baseline public.schedule_baseline%rowtype;
  v_preset public.schedule_preset%rowtype;
  v_window_start date;
  v_window_end date;
  v_service_date date;
  v_day_key text;
  v_should_work boolean;
  v_route_name text;
  v_rotation_hit boolean;
  v_rotation_day boolean;
  v_generated_count integer := 0;
  v_override_count integer := 0;
  v_add_in_insert_count integer := 0;
  v_terminal_id uuid;
  v_override record;
begin
  v_window_start := coalesce(p_start_date, CURRENT_DATE);
  v_window_end := v_window_start + greatest(p_horizon_days - 1, 0);

  select sb.*
  into v_baseline
  from public.schedule_baseline sb
  where sb.company_id = p_company_id
    and sb.roster_member_id = p_roster_member_id
    and sb.is_active = true
    and sb.effective_end is null
  order by sb.updated_at desc, sb.created_at desc
  limit 1;

  if not found then
    delete from public.schedule_day_fact
    where company_id = p_company_id
      and roster_member_id = p_roster_member_id
      and service_date between v_window_start and v_window_end;

    return jsonb_build_object(
      'ok', true,
      'mode', 'no_active_baseline',
      'generated_count', 0,
      'override_count', 0,
      'add_in_insert_count', 0,
      'window_start', v_window_start,
      'window_end', v_window_end
    );
  end if;

  select sp.*
  into v_preset
  from public.schedule_preset sp
  where sp.id = v_baseline.preset_id
    and sp.company_id = p_company_id
    and sp.is_active = true
  limit 1;

  if not found then
    raise exception 'Active schedule_preset not found for baseline %', v_baseline.id;
  end if;

  select sdf.terminal_id
  into v_terminal_id
  from public.schedule_day_fact sdf
  where sdf.company_id = p_company_id
    and sdf.roster_member_id = p_roster_member_id
    and sdf.terminal_id <> '00000000-0000-0000-0000-000000000000'::uuid
  order by sdf.service_date desc, sdf.created_at desc
  limit 1;

  v_terminal_id := coalesce(
    v_terminal_id,
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  v_window_start := greatest(v_window_start, v_baseline.effective_start);

  delete from public.schedule_day_fact
  where company_id = p_company_id
    and roster_member_id = p_roster_member_id
    and service_date between v_window_start and v_window_end;

  v_service_date := v_window_start;

  while v_service_date <= v_window_end loop
    v_day_key := lower(to_char(v_service_date, 'dy'));

    v_should_work := case v_day_key
      when 'sat' then v_preset.works_s
      when 'sun' then v_preset.works_u
      when 'mon' then v_preset.works_m
      when 'tue' then v_preset.works_t
      when 'wed' then v_preset.works_w
      when 'thu' then v_preset.works_h
      when 'fri' then v_preset.works_f
      else false
    end;

    v_route_name := case v_day_key
      when 'sat' then v_baseline.default_route_s
      when 'sun' then v_baseline.default_route_u
      when 'mon' then v_baseline.default_route_m
      when 'tue' then v_baseline.default_route_t
      when 'wed' then v_baseline.default_route_w
      when 'thu' then v_baseline.default_route_h
      when 'fri' then v_baseline.default_route_f
      else null
    end;

    v_rotation_day := case v_day_key
      when 'sat' then coalesce(v_baseline.rotation_works_s, false)
      when 'sun' then coalesce(v_baseline.rotation_works_u, false)
      when 'mon' then coalesce(v_baseline.rotation_works_m, false)
      when 'tue' then coalesce(v_baseline.rotation_works_t, false)
      when 'wed' then coalesce(v_baseline.rotation_works_w, false)
      when 'thu' then coalesce(v_baseline.rotation_works_h, false)
      when 'fri' then coalesce(v_baseline.rotation_works_f, false)
      else false
    end;

    v_rotation_hit := false;

    if v_baseline.rotation_mode = 'WEEKEND_ALT'
       and v_baseline.anchor_date is not null
       and v_rotation_day
    then
      if (floor((v_service_date - v_baseline.anchor_date) / 7)::integer % 2) = 0 then
        v_rotation_hit := true;
      end if;
    end if;

    if v_rotation_hit then
      v_should_work := false;
      v_route_name := null;
    end if;

    if v_should_work then
      insert into public.schedule_day_fact (
        company_id,
        terminal_id,
        service_date,
        roster_member_id,
        planned_on,
        route_name,
        source_kind,
        preset_id,
        rotation_mode,
        anchor_date,
        baseline_id,
        override_id
      )
      values (
        p_company_id,
        v_terminal_id,
        v_service_date,
        p_roster_member_id,
        true,
        v_route_name,
        'BASELINE',
        v_baseline.preset_id,
        v_baseline.rotation_mode,
        v_baseline.anchor_date,
        v_baseline.id,
        null
      );

      v_generated_count := v_generated_count + 1;
    end if;

    v_service_date := v_service_date + 1;
  end loop;

  update public.schedule_day_fact sdf
  set
    planned_on = false,
    route_name = null,
    source_kind = 'OVERRIDE',
    override_id = so.id
  from public.schedule_override so
  where sdf.company_id = p_company_id
    and sdf.roster_member_id = p_roster_member_id
    and sdf.service_date between v_window_start and v_window_end
    and so.company_id = p_company_id
    and so.roster_member_id = p_roster_member_id
    and so.is_active = true
    and so.override_type in ('CALL_OUT', 'TIME_OFF')
    and sdf.service_date between so.start_date and so.end_date;

  get diagnostics v_override_count = row_count;

  for v_override in
    select so.*
    from public.schedule_override so
    where so.company_id = p_company_id
      and so.roster_member_id = p_roster_member_id
      and so.is_active = true
      and so.override_type = 'ADD_IN'
      and so.end_date >= v_window_start
      and so.start_date <= v_window_end
    order by so.created_at asc
  loop
    v_service_date := greatest(v_window_start, v_override.start_date);

    while v_service_date <= least(v_window_end, v_override.end_date) loop
      if exists (
        select 1
        from public.schedule_day_fact sdf
        where sdf.company_id = p_company_id
          and sdf.roster_member_id = p_roster_member_id
          and sdf.service_date = v_service_date
      ) then
        update public.schedule_day_fact
        set
          planned_on = true,
          route_name = null,
          source_kind = 'OVERRIDE',
          override_id = v_override.id
        where company_id = p_company_id
          and roster_member_id = p_roster_member_id
          and service_date = v_service_date;
      else
        insert into public.schedule_day_fact (
          company_id,
          terminal_id,
          service_date,
          roster_member_id,
          planned_on,
          route_name,
          source_kind,
          preset_id,
          rotation_mode,
          anchor_date,
          baseline_id,
          override_id
        )
        values (
          p_company_id,
          v_terminal_id,
          v_service_date,
          p_roster_member_id,
          true,
          null,
          'OVERRIDE',
          null,
          null,
          null,
          null,
          v_override.id
        );

        v_add_in_insert_count := v_add_in_insert_count + 1;
      end if;

      v_service_date := v_service_date + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mode', 'repainted',
    'generated_count', v_generated_count,
    'override_count', v_override_count,
    'add_in_insert_count', v_add_in_insert_count,
    'window_start', v_window_start,
    'window_end', v_window_end,
    'baseline_id', v_baseline.id,
    'preset_id', v_baseline.preset_id,
    'terminal_id_used', v_terminal_id
  );
end;
$$;


ALTER FUNCTION "public"."paint_schedule_day_fact_for_roster_member"("p_company_id" "uuid", "p_roster_member_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payroll_dsw_bridge_key"("p_value" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  raw text := upper(trim(coalesce(p_value, '')));
  clean text;
  parts text[];
  last_part text;
  first_part text;
begin
  if raw = '' then return ''; end if;

  if position(',' in raw) > 0 then
    last_part := split_part(trim(regexp_replace(split_part(raw, ',', 1), '[^A-Z0-9]+', ' ', 'g')), ' ', 1);
    first_part := split_part(trim(regexp_replace(split_part(raw, ',', 2), '[^A-Z0-9]+', ' ', 'g')), ' ', 1);
    if last_part <> '' and first_part <> '' then
      return last_part || '|' || first_part;
    end if;
    return '';
  end if;

  clean := trim(regexp_replace(raw, '[^A-Z0-9]+', ' ', 'g'));
  parts := regexp_split_to_array(clean, '\s+');

  if array_length(parts, 1) >= 2 then
    return parts[array_length(parts, 1)] || '|' || parts[1];
  end if;

  return '';
end;
$$;


ALTER FUNCTION "public"."payroll_dsw_bridge_key"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
  select core.rebuild_payroll_activity_fact(
    p_company_id,
    p_start_date,
    p_end_date
  );
$$;


ALTER FUNCTION "public"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_automation_credential_verification"("p_profile_id" "uuid", "p_result" "text", "p_status" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
begin
  update core.automation_credential
  set
    last_verified_at = now(),
    last_verification_result = p_result,
    updated_at = now()
  where profile_id = p_profile_id;

  update core.automation_profile
  set
    status = p_status,
    updated_at = now()
  where id = p_profile_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."record_automation_credential_verification"("p_profile_id" "uuid", "p_result" "text", "p_status" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_collection_artifact" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collection_request_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "service_date" "date",
    "artifact_kind" "text" DEFAULT 'REPORT_FILE'::"text" NOT NULL,
    "report_family_key" "text",
    "report_shape_key" "text",
    "report_frame" "text",
    "artifact_status" "text" DEFAULT 'UPLOADED'::"text" NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "normalized_filename" "text" NOT NULL,
    "content_type" "text",
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "source_hash" "text",
    "runner_key" "text",
    "runner_artifact_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ingest_metadata_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "report_batch_id" "uuid",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operations_collection_artifact_frame_chk" CHECK ((("report_frame" = ANY (ARRAY['AM'::"text", 'PM'::"text"])) OR ("report_frame" IS NULL))),
    CONSTRAINT "operations_collection_artifact_status_chk" CHECK (("artifact_status" = ANY (ARRAY['UPLOADED'::"text", 'READY_FOR_INGEST'::"text", 'INGESTING'::"text", 'INGESTED'::"text", 'FAILED'::"text", 'IGNORED'::"text"])))
);


ALTER TABLE "core"."operations_collection_artifact" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."operations_collection_artifact_v" WITH ("security_invoker"='true') AS
 SELECT "a"."id",
    "a"."collection_request_id",
    "a"."company_id",
    "a"."service_date",
    "a"."artifact_kind",
    "a"."report_family_key",
    "a"."report_shape_key",
    "a"."report_frame",
    "a"."artifact_status",
    "a"."storage_bucket",
    "a"."storage_path",
    "a"."original_filename",
    "a"."normalized_filename",
    "a"."content_type",
    "a"."size_bytes",
    "a"."source_hash",
    "a"."runner_key",
    "a"."runner_artifact_json",
    "a"."ingest_metadata_json",
    "a"."report_batch_id",
    "a"."error_message",
    "a"."created_at",
    "a"."updated_at",
    "c"."company_slug",
    "r"."request_type",
    "r"."request_status"
   FROM (("core"."operations_collection_artifact" "a"
     JOIN "core"."companies" "c" ON (("c"."id" = "a"."company_id")))
     JOIN "core"."operations_collection_request" "r" ON (("r"."id" = "a"."collection_request_id")));


ALTER VIEW "public"."operations_collection_artifact_v" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_operations_collection_artifact"("p_collection_request_id" "uuid", "p_company_id" "uuid", "p_service_date" "date", "p_artifact_kind" "text", "p_report_family_key" "text", "p_report_shape_key" "text", "p_report_frame" "text", "p_artifact_status" "text", "p_storage_bucket" "text", "p_storage_path" "text", "p_original_filename" "text", "p_normalized_filename" "text", "p_content_type" "text", "p_size_bytes" bigint, "p_source_hash" "text", "p_runner_key" "text", "p_runner_artifact_json" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."operations_collection_artifact_v"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_row public.operations_collection_artifact_v;
begin
  insert into core.operations_collection_artifact (
    collection_request_id,
    company_id,
    service_date,
    artifact_kind,
    report_family_key,
    report_shape_key,
    report_frame,
    artifact_status,
    storage_bucket,
    storage_path,
    original_filename,
    normalized_filename,
    content_type,
    size_bytes,
    source_hash,
    runner_key,
    runner_artifact_json
  )
  values (
    p_collection_request_id,
    p_company_id,
    p_service_date,
    coalesce(nullif(p_artifact_kind, ''), 'REPORT_FILE'),
    nullif(p_report_family_key, ''),
    nullif(p_report_shape_key, ''),
    nullif(p_report_frame, ''),
    coalesce(nullif(p_artifact_status, ''), 'READY_FOR_INGEST'),
    p_storage_bucket,
    p_storage_path,
    p_original_filename,
    p_normalized_filename,
    nullif(p_content_type, ''),
    coalesce(p_size_bytes, 0),
    nullif(p_source_hash, ''),
    p_runner_key,
    coalesce(p_runner_artifact_json, '{}'::jsonb)
  )
  on conflict (storage_bucket, storage_path)
  do update set
    artifact_status = excluded.artifact_status,
    size_bytes = excluded.size_bytes,
    source_hash = excluded.source_hash,
    runner_key = excluded.runner_key,
    runner_artifact_json = excluded.runner_artifact_json,
    updated_at = now()
  returning * into v_row;

  select * into v_row
  from public.operations_collection_artifact_v
  where id = v_row.id;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."register_operations_collection_artifact"("p_collection_request_id" "uuid", "p_company_id" "uuid", "p_service_date" "date", "p_artifact_kind" "text", "p_report_family_key" "text", "p_report_shape_key" "text", "p_report_frame" "text", "p_artifact_status" "text", "p_storage_bucket" "text", "p_storage_path" "text", "p_original_filename" "text", "p_normalized_filename" "text", "p_content_type" "text", "p_size_bytes" bigint, "p_source_hash" "text", "p_runner_key" "text", "p_runner_artifact_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_release_reason" "text" DEFAULT 'RELEASED'::"text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select core.release_company_asset(
    p_company_slug := p_company_slug,
    p_asset_id := p_asset_id,
    p_release_reason := p_release_reason
  );
$$;


ALTER FUNCTION "public"."release_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_release_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_schedule_projection"("p_company_id" "uuid", "p_start_date" "date" DEFAULT CURRENT_DATE, "p_horizon_days" integer DEFAULT 70) RETURNS TABLE("company_id" "uuid", "terminal_id" "uuid", "service_date" "date", "roster_member_id" "uuid", "planned_on" boolean, "route_name" "text", "source_kind" "text", "preset_id" "uuid", "rotation_mode" "text", "anchor_date" "date", "baseline_id" "uuid", "override_id" "uuid")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'core'
    AS $$
with params as (
  select
    p_company_id as company_id,
    coalesce(p_start_date, current_date) as window_start,
    coalesce(p_start_date, current_date)
      + greatest(coalesce(p_horizon_days, 70) - 1, 0) as window_end,
    coalesce(
      (
        select sdf.terminal_id
        from public.schedule_day_fact sdf
        where sdf.company_id = p_company_id
          and sdf.terminal_id <>
            '00000000-0000-0000-0000-000000000000'::uuid
        order by sdf.service_date desc, sdf.created_at desc
        limit 1
      ),
      '00000000-0000-0000-0000-000000000000'::uuid
    ) as terminal_id
),
service_dates as (
  select
    gs::date as service_date
  from params p
  cross join lateral generate_series(
    p.window_start,
    p.window_end,
    interval '1 day'
  ) gs
),
baseline_evaluation as (
  select
    sb.company_id,
    p.terminal_id,
    d.service_date,
    sb.roster_member_id,

    case extract(dow from d.service_date)::integer
      when 6 then sp.works_s
      when 0 then sp.works_u
      when 1 then sp.works_m
      when 2 then sp.works_t
      when 3 then sp.works_w
      when 4 then sp.works_h
      when 5 then sp.works_f
      else false
    end as preset_should_work,

    case extract(dow from d.service_date)::integer
      when 6 then sb.default_route_s
      when 0 then sb.default_route_u
      when 1 then sb.default_route_m
      when 2 then sb.default_route_t
      when 3 then sb.default_route_w
      when 4 then sb.default_route_h
      when 5 then sb.default_route_f
      else null
    end as baseline_route_name,

    case extract(dow from d.service_date)::integer
      when 6 then coalesce(sb.rotation_works_s, false)
      when 0 then coalesce(sb.rotation_works_u, false)
      when 1 then coalesce(sb.rotation_works_m, false)
      when 2 then coalesce(sb.rotation_works_t, false)
      when 3 then coalesce(sb.rotation_works_w, false)
      when 4 then coalesce(sb.rotation_works_h, false)
      when 5 then coalesce(sb.rotation_works_f, false)
      else false
    end as rotation_day,

    sb.preset_id,
    sb.rotation_mode,
    sb.anchor_date,
    sb.id as baseline_id
  from params p
  join public.schedule_baseline sb
    on sb.company_id = p.company_id
   and sb.is_active = true
   and sb.effective_end is null
   and sb.effective_start <= p.window_end
  join public.schedule_preset sp
    on sp.id = sb.preset_id
   and sp.company_id = sb.company_id
   and sp.is_active = true
  join service_dates d
    on d.service_date >= greatest(p.window_start, sb.effective_start)
),
baseline_rows as (
  select
    be.company_id,
    be.terminal_id,
    be.service_date,
    be.roster_member_id,
    true as planned_on,
    be.baseline_route_name as route_name,
    'BASELINE'::text as source_kind,
    be.preset_id,
    be.rotation_mode,
    be.anchor_date,
    be.baseline_id,
    null::uuid as override_id
  from baseline_evaluation be
  where be.preset_should_work = true
    and not (
      be.rotation_mode = 'WEEKEND_ALT'
      and be.anchor_date is not null
      and be.rotation_day = true
      and (
        floor(
          (be.service_date - be.anchor_date) / 7
        )::integer % 2
      ) = 0
    )
),
off_resolved as (
  select
    br.company_id,
    br.terminal_id,
    br.service_date,
    br.roster_member_id,

    case
      when off_override.id is not null then false
      else br.planned_on
    end as planned_on,

    case
      when off_override.id is not null then null
      else br.route_name
    end as route_name,

    case
      when off_override.id is not null then 'OVERRIDE'
      else br.source_kind
    end as source_kind,

    br.preset_id,
    br.rotation_mode,
    br.anchor_date,
    br.baseline_id,
    coalesce(off_override.id, br.override_id) as override_id
  from baseline_rows br
  left join lateral (
    select so.id
    from public.schedule_override so
    where so.company_id = br.company_id
      and so.roster_member_id = br.roster_member_id
      and so.is_active = true
      and so.override_type in (
        'CALL_OUT',
        'TIME_OFF',
        'ADMIN_OFF'
      )
      and br.service_date between so.start_date and so.end_date
    order by so.created_at desc
    limit 1
  ) off_override on true
),
add_in_rows as (
  select distinct on (
    so.company_id,
    so.roster_member_id,
    d.service_date
  )
    so.company_id,
    p.terminal_id,
    d.service_date,
    so.roster_member_id,
    true as planned_on,
    null::text as route_name,
    'OVERRIDE'::text as source_kind,
    null::uuid as preset_id,
    null::text as rotation_mode,
    null::date as anchor_date,
    null::uuid as baseline_id,
    so.id as override_id
  from params p
  join public.schedule_override so
    on so.company_id = p.company_id
   and so.is_active = true
   and so.override_type = 'ADD_IN'
   and so.end_date >= p.window_start
   and so.start_date <= p.window_end
  join service_dates d
    on d.service_date between
      greatest(p.window_start, so.start_date)
      and least(p.window_end, so.end_date)
  order by
    so.company_id,
    so.roster_member_id,
    d.service_date,
    so.created_at desc
),
baseline_with_add_ins as (
  select
    obr.company_id,
    obr.terminal_id,
    obr.service_date,
    obr.roster_member_id,

    case
      when air.override_id is not null then true
      else obr.planned_on
    end as planned_on,

    case
      when air.override_id is not null then null
      else obr.route_name
    end as route_name,

    case
      when air.override_id is not null then 'OVERRIDE'
      else obr.source_kind
    end as source_kind,

    obr.preset_id,
    obr.rotation_mode,
    obr.anchor_date,
    obr.baseline_id,
    coalesce(air.override_id, obr.override_id) as override_id
  from off_resolved obr
  left join add_in_rows air
    on air.company_id = obr.company_id
   and air.roster_member_id = obr.roster_member_id
   and air.service_date = obr.service_date
),
add_in_only as (
  select air.*
  from add_in_rows air
  where not exists (
    select 1
    from off_resolved obr
    where obr.company_id = air.company_id
      and obr.roster_member_id = air.roster_member_id
      and obr.service_date = air.service_date
  )
)
select *
from baseline_with_add_ins

union all

select *
from add_in_only;
$$;


ALTER FUNCTION "public"."resolve_schedule_projection"("p_company_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_raw_row_ids" "uuid"[], "p_reviewed_by_profile_id" "uuid" DEFAULT NULL::"uuid", "p_max_reasonable_miles" numeric DEFAULT 500, "p_before_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("reviewed_count" integer, "corrected_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_reviewed integer := 0;
  v_corrected integer := 0;
begin
  if p_action not in ('APPLY', 'IGNORE') then
    raise exception 'Invalid mileage review action: %', p_action;
  end if;

  with audit as (
    select *
    from public.get_operations_mileage_audit(p_company_id, p_max_reasonable_miles, p_before_date)
    where raw_row_id = any(p_raw_row_ids)
  ),
  reviewed as (
    insert into core.operations_mileage_audit_review (
      company_id,
      raw_row_id,
      review_action,
      review_reason,
      suggested_miles,
      reviewed_by_profile_id
    )
    select
      p_company_id,
      raw_row_id,
      p_action,
      reason,
      suggested_miles,
      p_reviewed_by_profile_id
    from audit
    on conflict (raw_row_id) do update
      set review_action = excluded.review_action,
          review_reason = excluded.review_reason,
          suggested_miles = excluded.suggested_miles,
          reviewed_by_profile_id = excluded.reviewed_by_profile_id,
          reviewed_at = now()
    returning raw_row_id
  )
  select count(*) into v_reviewed from reviewed;

  if p_action = 'APPLY' then
    with audit as (
      select *
      from public.get_operations_mileage_audit(p_company_id, p_max_reasonable_miles, p_before_date)
      where raw_row_id = any(p_raw_row_ids)
        and suggested_miles is not null
    ),
    targets as (
      select
        a.*,
        r.normalized_row_json as original_json,
        jsonb_set(r.normalized_row_json, '{miles}', to_jsonb(a.suggested_miles), true) as healed_json
      from audit a
      join core.operations_report_raw_row r
        on r.id = a.raw_row_id
       and r.company_id = p_company_id
    ),
    logged as (
      insert into core.operations_mileage_correction_log (
        company_id, raw_row_id, batch_id, service_date, route_baseline_id,
        route_name, wa_number, driver_name, original_miles_text, original_miles,
        corrected_miles, correction_reason, correction_method,
        original_normalized_row_json, corrected_normalized_row_json, corrected_by_profile_id
      )
      select
        p_company_id, raw_row_id, batch_id, service_date, route_baseline_id,
        route_name, wa_number, driver_name, recorded_miles_text, recorded_miles,
        suggested_miles, reason, 'WORKLOAD_ADJUSTED_REVIEW',
        original_json, healed_json, p_reviewed_by_profile_id
      from targets
      on conflict (raw_row_id) do nothing
      returning raw_row_id
    )
    update core.operations_report_raw_row r
    set normalized_row_json = t.healed_json
    from targets t
    join logged l on l.raw_row_id = t.raw_row_id
    where r.id = t.raw_row_id
      and r.company_id = p_company_id;

    get diagnostics v_corrected = row_count;
  end if;

  return query select v_reviewed, v_corrected;
end;
$$;


ALTER FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_raw_row_ids" "uuid"[], "p_reviewed_by_profile_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_review_items" "jsonb", "p_reviewed_by_profile_id" "uuid" DEFAULT NULL::"uuid", "p_max_reasonable_miles" numeric DEFAULT 500, "p_before_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("reviewed_count" integer, "corrected_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_reviewed integer := 0;
  v_corrected integer := 0;
begin
  if p_action not in ('APPLY', 'IGNORE') then
    raise exception 'Invalid mileage review action: %', p_action;
  end if;

  with items as (
    select
      (item->>'rawRowId')::uuid as raw_row_id,
      nullif(item->>'miles', '')::numeric as applied_miles
    from jsonb_array_elements(p_review_items) item
  ),
  audit as (
    select a.*, i.applied_miles
    from public.get_operations_mileage_audit(p_company_id, p_max_reasonable_miles, p_before_date) a
    join items i on i.raw_row_id = a.raw_row_id
  ),
  reviewed as (
    insert into core.operations_mileage_audit_review (
      company_id,
      raw_row_id,
      review_action,
      review_reason,
      suggested_miles,
      computed_suggested_miles,
      applied_miles,
      reviewed_by_profile_id
    )
    select
      p_company_id,
      raw_row_id,
      p_action,
      reason,
      suggested_miles,
      suggested_miles,
      case when p_action = 'APPLY' then coalesce(applied_miles, suggested_miles) else null end,
      p_reviewed_by_profile_id
    from audit
    on conflict (raw_row_id) do update
      set review_action = excluded.review_action,
          review_reason = excluded.review_reason,
          suggested_miles = excluded.suggested_miles,
          computed_suggested_miles = excluded.computed_suggested_miles,
          applied_miles = excluded.applied_miles,
          reviewed_by_profile_id = excluded.reviewed_by_profile_id,
          reviewed_at = now()
    returning raw_row_id
  )
  select count(*) into v_reviewed from reviewed;

  if p_action = 'APPLY' then
    with items as (
      select
        (item->>'rawRowId')::uuid as raw_row_id,
        nullif(item->>'miles', '')::numeric as applied_miles
      from jsonb_array_elements(p_review_items) item
    ),
    audit as (
      select a.*, coalesce(i.applied_miles, a.suggested_miles) as final_miles
      from public.get_operations_mileage_audit(p_company_id, p_max_reasonable_miles, p_before_date) a
      join items i on i.raw_row_id = a.raw_row_id
      where coalesce(i.applied_miles, a.suggested_miles) is not null
    ),
    targets as (
      select
        a.*,
        r.normalized_row_json as original_json,
        jsonb_set(r.normalized_row_json, '{miles}', to_jsonb(a.final_miles), true) as healed_json
      from audit a
      join core.operations_report_raw_row r
        on r.id = a.raw_row_id
       and r.company_id = p_company_id
    ),
    logged as (
      insert into core.operations_mileage_correction_log (
        company_id, raw_row_id, batch_id, service_date, route_baseline_id,
        route_name, wa_number, driver_name, original_miles_text, original_miles,
        corrected_miles, correction_reason, correction_method,
        original_normalized_row_json, corrected_normalized_row_json, corrected_by_profile_id
      )
      select
        p_company_id, raw_row_id, batch_id, service_date, route_baseline_id,
        route_name, wa_number, driver_name, recorded_miles_text, recorded_miles,
        final_miles, reason, 'WORKLOAD_ADJUSTED_REVIEW',
        original_json, healed_json, p_reviewed_by_profile_id
      from targets
      on conflict (raw_row_id) do nothing
      returning raw_row_id
    )
    update core.operations_report_raw_row r
    set normalized_row_json = t.healed_json
    from targets t
    join logged l on l.raw_row_id = t.raw_row_id
    where r.id = t.raw_row_id
      and r.company_id = p_company_id;

    get diagnostics v_corrected = row_count;
  end if;

  return query select v_reviewed, v_corrected;
end;
$$;


ALTER FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_review_items" "jsonb", "p_reviewed_by_profile_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roster_set_employment_status"("p_company_slug" "text", "p_roster_id" "uuid", "p_status" "text", "p_effective_date" "date" DEFAULT CURRENT_DATE, "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_existing core.company_roster;
  v_event_category text;
  v_next_hire_date date;
begin
  if p_status not in ('Candidate', 'Trainee', 'Active', 'Former') then
    raise exception 'Invalid employment status: %', p_status;
  end if;

  v_event_category := case
    when p_status = 'Candidate' then 'hiring'
    when p_status = 'Former' then 'separation'
    else 'operations'
  end;

  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  select * into v_existing
  from core.company_roster
  where company_id = v_company_id
    and id = p_roster_id;

  if v_existing.id is null then
    raise exception 'Roster record not found';
  end if;

  v_next_hire_date := case
    when p_status in ('Trainee', 'Active') then coalesce(v_existing.hire_date, p_effective_date)
    else v_existing.hire_date
  end;

  update core.company_roster
  set
    employment_status = p_status,
    hire_date = v_next_hire_date,
    separation_date = case when p_status = 'Former' then p_effective_date else null end
  where id = v_existing.id;

  if p_status in ('Candidate', 'Former') then
    update public.schedule_baseline
    set is_active = false,
        effective_end = p_effective_date
    where company_id = v_company_id
      and roster_member_id = v_existing.id
      and is_active = true;

    delete from public.schedule_day_fact
    where company_id = v_company_id
      and roster_member_id = v_existing.id
      and service_date >= p_effective_date;
  end if;

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type,
    event_detail, event_metadata, occurred_at
  )
  values (
    v_company_id,
    v_existing.id,
    v_event_category,
    'marked_' || lower(p_status),
    'Roster member moved to ' || p_status || ' status.',
    jsonb_build_object(
      'source', 'person_status_workflow',
      'before', jsonb_build_object(
        'employment_status', v_existing.employment_status,
        'hire_date', v_existing.hire_date,
        'separation_date', v_existing.separation_date
      ),
      'after', jsonb_build_object(
        'employment_status', p_status,
        'hire_date', v_next_hire_date,
        'separation_date', case when p_status = 'Former' then p_effective_date else null end
      ),
      'effective_date', p_effective_date,
      'note', p_note
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_existing.id,
    'employment_status', p_status,
    'hire_date', v_next_hire_date,
    'separation_date', case when p_status = 'Former' then p_effective_date else null end
  );
end;
$$;


ALTER FUNCTION "public"."roster_set_employment_status"("p_company_slug" "text", "p_roster_id" "uuid", "p_status" "text", "p_effective_date" "date", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."roster_upsert_person"("p_company_slug" "text", "p_full_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_worker_type" "text" DEFAULT 'Driver'::"text", "p_employment_status" "text" DEFAULT 'Active'::"text", "p_market_code" "text" DEFAULT NULL::"text", "p_compliance_summary" "text" DEFAULT 'Missing'::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_existing core.company_roster;
  v_roster core.company_roster;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_event_category text;
begin
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Full name is required';
  end if;

  if p_employment_status not in ('Candidate', 'Active', 'Former') then
    raise exception 'Invalid employment status: %', p_employment_status;
  end if;

  if p_compliance_summary not in ('Compliant', 'Missing', 'Expiring', 'Expired') then
    raise exception 'Invalid compliance summary: %', p_compliance_summary;
  end if;

  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  if v_email is not null then
    select *
    into v_existing
    from core.company_roster
    where company_id = v_company_id
      and lower(trim(email)) = v_email
    limit 1;
  end if;

  if v_existing.id is not null then
    update core.company_roster
    set
      full_name = trim(p_full_name),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      worker_type = coalesce(nullif(trim(coalesce(p_worker_type, '')), ''), worker_type),
      employment_status = p_employment_status,
      market_code = nullif(trim(coalesce(p_market_code, '')), ''),
      compliance_summary = p_compliance_summary,
      separation_date = case when p_employment_status = 'Former' then current_date else null end
    where id = v_existing.id
    returning *
    into v_roster;
  else
    insert into core.company_roster (
      company_id,
      full_name,
      email,
      phone,
      worker_type,
      employment_status,
      market_code,
      invite_status,
      compliance_summary,
      separation_date
    )
    values (
      v_company_id,
      trim(p_full_name),
      v_email,
      nullif(trim(coalesce(p_phone, '')), ''),
      coalesce(nullif(trim(coalesce(p_worker_type, '')), ''), 'Driver'),
      p_employment_status,
      nullif(trim(coalesce(p_market_code, '')), ''),
      'Not Invited',
      p_compliance_summary,
      case when p_employment_status = 'Former' then current_date else null end
    )
    returning *
    into v_roster;
  end if;

  v_event_category := case
    when p_employment_status = 'Candidate' then 'hiring'
    when p_employment_status = 'Former' then 'separation'
    else 'operations'
  end;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    v_roster.id,
    v_event_category,
    'roster_person_upserted',
    'Roster person added or updated from roster workflow.',
    jsonb_build_object(
      'source', 'roster_add_person_overlay',
      'employment_status', p_employment_status,
      'compliance_summary', p_compliance_summary,
      'note', p_note
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_roster.id,
    'employment_status', v_roster.employment_status,
    'full_name', v_roster.full_name
  );
end;
$$;


ALTER FUNCTION "public"."roster_upsert_person"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_employment_status" "text", "p_market_code" "text", "p_compliance_summary" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_automation_credential"("p_profile_id" "uuid", "p_username" "text", "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
begin
  insert into core.automation_credential (
    profile_id,
    username,
    encrypted_secret,
    has_secret
  )
  values (
    p_profile_id,
    p_username,
    p_password,
    true
  )
  on conflict (profile_id)
  do update
  set
    username = excluded.username,
    encrypted_secret = excluded.encrypted_secret,
    has_secret = true,
    updated_at = now();

  update core.automation_profile
  set status = 'CONFIGURED', updated_at = now()
  where id = p_profile_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."save_automation_credential"("p_profile_id" "uuid", "p_username" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_operations_automation_schedule_config"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text") RETURNS "public"."operations_automation_schedule_config_v"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_cooldown integer;
  v_start time;
  v_end time;
  v_row public.operations_automation_schedule_config_v;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if p_automation_type not in ('DSW', 'FCC', 'DRO_AM', 'DRO_PM') then
    raise exception 'Unsupported automation type.';
  end if;

  if p_cadence_minutes not in (15, 30, 60) then
    raise exception 'Unsupported cadence.';
  end if;

  if p_window_preset not in ('SORT_DELIVERY_DAY', 'BUSINESS_DAY', 'OFF') then
    raise exception 'Unsupported window preset.';
  end if;

  v_cooldown := case
    when p_cadence_minutes = 15 then 12
    when p_cadence_minutes = 30 then 25
    else 50
  end;

  v_start := case
    when p_window_preset = 'BUSINESS_DAY' then '07:00'::time
    else '05:00'::time
  end;

  v_end := case
    when p_window_preset = 'BUSINESS_DAY' then '19:00'::time
    else '23:45'::time
  end;

  insert into core.operations_automation_schedule_config (
    company_id,
    automation_type,
    is_enabled,
    cadence_minutes,
    window_preset,
    start_time,
    end_time,
    min_cooldown_minutes,
    updated_at
  )
  values (
    v_company_id,
    p_automation_type,
    case when p_window_preset = 'OFF' then false else p_is_enabled end,
    p_cadence_minutes,
    p_window_preset,
    v_start,
    v_end,
    v_cooldown,
    now()
  )
  on conflict (company_id, automation_type)
  do update set
    is_enabled = excluded.is_enabled,
    cadence_minutes = excluded.cadence_minutes,
    window_preset = excluded.window_preset,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    min_cooldown_minutes = excluded.min_cooldown_minutes,
    updated_at = now();

  select *
  into v_row
  from public.operations_automation_schedule_config_v
  where company_id = v_company_id
    and automation_type = p_automation_type;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."save_operations_automation_schedule_config"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_operations_automation_schedule_config_with_window"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text", "p_start_time" time without time zone, "p_end_time" time without time zone) RETURNS "public"."operations_automation_schedule_config_v"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_cooldown integer;
  v_row public.operations_automation_schedule_config_v;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if p_automation_type not in ('DSW', 'FCC', 'DRO_AM', 'DRO_PM') then
    raise exception 'Unsupported automation type.';
  end if;

  if p_cadence_minutes not in (15, 30, 60) then
    raise exception 'Unsupported cadence.';
  end if;

  if p_window_preset not in ('SORT_DELIVERY_DAY', 'BUSINESS_DAY', 'OFF') then
    raise exception 'Unsupported window preset.';
  end if;

  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    raise exception 'Invalid schedule window.';
  end if;

  v_cooldown := case
    when p_cadence_minutes = 15 then 12
    when p_cadence_minutes = 30 then 25
    else 50
  end;

  insert into core.operations_automation_schedule_config (
    company_id,
    automation_type,
    is_enabled,
    cadence_minutes,
    window_preset,
    start_time,
    end_time,
    min_cooldown_minutes,
    updated_at
  )
  values (
    v_company_id,
    p_automation_type,
    case when p_window_preset = 'OFF' then false else p_is_enabled end,
    p_cadence_minutes,
    p_window_preset,
    p_start_time,
    p_end_time,
    v_cooldown,
    now()
  )
  on conflict (company_id, automation_type)
  do update set
    is_enabled = excluded.is_enabled,
    cadence_minutes = excluded.cadence_minutes,
    window_preset = excluded.window_preset,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    min_cooldown_minutes = excluded.min_cooldown_minutes,
    updated_at = now();

  select *
  into v_row
  from public.operations_automation_schedule_config_v
  where company_id = v_company_id
    and automation_type = p_automation_type;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."save_operations_automation_schedule_config_with_window"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text", "p_start_time" time without time zone, "p_end_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_profile_setup"("p_auth_user_id" "uuid", "p_email" "text", "p_first_name" "text", "p_last_name" "text", "p_display_name" "text" DEFAULT NULL::"text", "p_mobile_phone" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_profile_id uuid;
begin
  select id
  into v_profile_id
  from core.profiles
  where auth_user_id = p_auth_user_id
     or lower(email) = lower(trim(p_email))
  order by case when auth_user_id = p_auth_user_id then 0 else 1 end
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
      auth_user_id = p_auth_user_id,
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


ALTER FUNCTION "public"."save_profile_setup"("p_auth_user_id" "uuid", "p_email" "text", "p_first_name" "text", "p_last_name" "text", "p_display_name" "text", "p_mobile_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_sweep_month"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_ops_mode" "text", "p_modified_start_date" "date" DEFAULT NULL::"date") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  d date;
  rec record;

  v_modified_start_date date;
  v_planned_on boolean;
  v_is_sunday boolean;
  v_sunday_allowed boolean;
  v_route_name text;
  v_rotation_hit boolean;
  v_terminal_id uuid;
begin
  /*
    Locked rule:
    - default modified start date = today
    - preserve any existing schedule rows before modified start date
    - wipe + repaint only on and after modified start date
  */
  v_modified_start_date := coalesce(p_modified_start_date, current_date);

  /*
    Only mutate dates on and after modified start date.
    Anything before that stays intact.
  */
  delete from public.schedule_day_fact sdf
  where sdf.company_id = p_company_id
    and sdf.service_date between greatest(p_start_date, v_modified_start_date) and p_end_date
    and sdf.source_kind = 'BASELINE';

  for rec in
    select
      sb.id as baseline_id,
      sb.company_id,
      sb.roster_member_id,
      sb.preset_id,
      sb.rotation_mode,
      sb.anchor_date,
      sb.effective_start,
      sb.effective_end,
      sb.default_route_s,
      sb.default_route_u,
      sb.default_route_m,
      sb.default_route_t,
      sb.default_route_w,
      sb.default_route_h,
      sb.default_route_f,
      sp.works_s,
      sp.works_u,
      sp.works_m,
      sp.works_t,
      sp.works_w,
      sp.works_h,
      sp.works_f
    from public.schedule_baseline sb
    join public.schedule_preset sp
      on sp.id = sb.preset_id
    where sb.company_id = p_company_id
      and sb.is_active = true
  loop
    d := p_start_date;

    while d <= p_end_date loop
      /*
        Preserve existing framed schedule before modified start date.
      */
      if d < v_modified_start_date then
        d := d + interval '1 day';
        continue;
      end if;

      /*
        Baseline effective window
      */
      if d < rec.effective_start then
        d := d + interval '1 day';
        continue;
      end if;

      if rec.effective_end is not null and d > rec.effective_end then
        d := d + interval '1 day';
        continue;
      end if;

      v_is_sunday := extract(dow from d) = 0;

      /*
        Preset says whether this is a work day.
        Postgres dow:
        0 = Sunday
        1 = Monday
        2 = Tuesday
        3 = Wednesday
        4 = Thursday
        5 = Friday
        6 = Saturday
      */
      case extract(dow from d)
        when 0 then v_planned_on := rec.works_u;
        when 1 then v_planned_on := rec.works_m;
        when 2 then v_planned_on := rec.works_t;
        when 3 then v_planned_on := rec.works_w;
        when 4 then v_planned_on := rec.works_h;
        when 5 then v_planned_on := rec.works_f;
        when 6 then v_planned_on := rec.works_s;
      end case;

      /*
        Sunday ops gating
      */
      if v_is_sunday then
        v_sunday_allowed := (p_ops_mode = 'SEVEN_DAY');
      else
        v_sunday_allowed := true;
      end if;

      /*
        Default route selection by day
      */
      case extract(dow from d)
        when 0 then v_route_name := rec.default_route_u;
        when 1 then v_route_name := rec.default_route_m;
        when 2 then v_route_name := rec.default_route_t;
        when 3 then v_route_name := rec.default_route_w;
        when 4 then v_route_name := rec.default_route_h;
        when 5 then v_route_name := rec.default_route_f;
        when 6 then v_route_name := rec.default_route_s;
      end case;

      /*
        Base result before rotation
      */
      v_planned_on := v_planned_on and v_sunday_allowed;

      /*
        Rotation logic
        Current locked behavior:
        - WEEKEND_ALT suppresses qualifying weekend work
        - anchor_date governs alternation
        - if no anchor_date, no rotation suppression
      */
      v_rotation_hit := false;

      if rec.rotation_mode = 'WEEKEND_ALT'
         and rec.anchor_date is not null
         and extract(dow from d) in (0, 6)
      then
        /*
          Existing alternation logic preserved for now:
          alternating 7-day cadence from anchor_date
        */
        if floor((d - rec.anchor_date) / 7) % 2 = 0 then
          v_rotation_hit := true;
        end if;
      end if;

      if v_rotation_hit then
        v_planned_on := false;
        v_route_name := null;
      end if;

      /*
        terminal_id is required on schedule_day_fact.
        Use the company's single active terminal for now.
        If none exists, fail loudly instead of silently writing bad data.
      */
      select ct.terminal_id
      into v_terminal_id
      from public.company_terminal ct
      where ct.company_id = p_company_id
        and ct.is_active = true
      order by ct.created_at asc
      limit 1;

      if v_terminal_id is null then
        raise exception 'No active company_terminal found for company_id %', p_company_id;
      end if;

      insert into public.schedule_day_fact (
        company_id,
        terminal_id,
        service_date,
        roster_member_id,
        planned_on,
        route_name,
        source_kind,
        preset_id,
        rotation_mode,
        anchor_date,
        baseline_id
      )
      values (
        p_company_id,
        v_terminal_id,
        d,
        rec.roster_member_id,
        v_planned_on,
        case when v_planned_on then v_route_name else null end,
        'BASELINE',
        rec.preset_id,
        rec.rotation_mode,
        rec.anchor_date,
        rec.baseline_id
      );

      d := d + interval '1 day';
    end loop;
  end loop;
end;
$$;


ALTER FUNCTION "public"."schedule_sweep_month"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_ops_mode" "text", "p_modified_start_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_company_id uuid;
  v_roster record;
  v_token text;
  v_expires_at timestamptz;
begin
  select c.id
  into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  select r.*
  into v_roster
  from core.company_roster r
  where r.id = p_roster_id
    and r.company_id = v_company_id;

  if not found then
    raise exception 'Roster record not found.';
  end if;

  if v_roster.email is null or btrim(v_roster.email) = '' then
    raise exception 'Roster record missing email.';
  end if;

  update public.hiring_invite_token
  set
    status = 'expired',
    expires_at = now()
  where roster_id = p_roster_id
    and company_id = v_company_id
    and status = 'active';

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := now() + interval '7 days';

  insert into public.hiring_invite_token (
    roster_id,
    company_id,
    candidate_id,
    pc_org_id,
    email,
    token,
    expires_at,
    status
  )
  values (
    p_roster_id,
    v_company_id,
    p_roster_id,
    v_company_id,
    btrim(v_roster.email),
    v_token,
    v_expires_at,
    'active'
  );

  update core.company_roster
  set invite_status = 'Invited'
  where id = p_roster_id;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    p_roster_id,
    'onboarding',
    'invite_created',
    'Invite token created from roster.',
    jsonb_build_object(
      'source', 'roster_invite_button',
      'full_name', v_roster.full_name,
      'email', btrim(v_roster.email),
      'token', v_token,
      'expires_at', v_expires_at
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'company_id', v_company_id,
    'roster_id', p_roster_id,
    'email', btrim(v_roster.email),
    'token', v_token,
    'expires_at', v_expires_at,
    'invite_status', 'Invited'
  );
end;
$$;


ALTER FUNCTION "public"."send_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_trainee_daily_pay_rate" numeric, "p_effective_start" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
begin
  select id
  into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  update core.company_roster_trainee_pay_override
  set
    is_active = false,
    effective_end = p_effective_start - interval '1 day',
    updated_at = now()
  where company_id = v_company_id
    and roster_id = p_roster_id
    and is_active = true;

  insert into core.company_roster_trainee_pay_override (
    company_id,
    roster_id,
    trainee_daily_pay_rate,
    effective_start,
    is_active
  )
  values (
    v_company_id,
    p_roster_id,
    p_trainee_daily_pay_rate,
    p_effective_start,
    true
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', p_roster_id,
    'trainee_daily_pay_rate', p_trainee_daily_pay_rate,
    'effective_start', p_effective_start
  );
end;
$$;


ALTER FUNCTION "public"."set_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_trainee_daily_pay_rate" numeric, "p_effective_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_operations_dro_report"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_batch_id uuid;
  v_report_shape_key text;
begin

  v_report_shape_key :=
    case
      when upper(coalesce(p_report_frame,'')) = 'AM'
        then 'DRO_AM_ROUTE_READINESS'
      when upper(coalesce(p_report_frame,'')) = 'PM'
        then 'DRO_PM_ROUTE_PROJECTION'
      else
        'DRO_PM_ROUTE_PROJECTION'
    end;

  insert into core.operations_report_batch (
    company_id,
    report_family_key,
    report_shape_key,
    service_date,
    report_frame,
    snapshot_kind,
    source_filename,
    source_hash,
    detected_sheet_name,
    detected_header_row,
    detected_headers,
    row_count,
    route_row_count,
    participant_row_count,
    skipped_row_count,
    status,
    uploaded_by_profile_id,
    metadata_json
  )
  values (
    p_company_id,
    'DRO',
    v_report_shape_key,
    p_service_date,
    p_report_frame,
    'IN_DAY',
    p_source_filename,
    p_source_hash,
    p_detected_sheet_name,
    p_detected_header_row,
    p_detected_headers,
    p_row_count,
    p_route_row_count,
    p_participant_row_count,
    p_skipped_row_count,
    'STAGED',
    p_uploaded_by_profile_id,
    p_metadata_json
  )
  returning id into v_batch_id;

  insert into core.operations_report_raw_row (
    batch_id,
    company_id,
    sheet_name,
    source_row_index,
    row_kind,
    raw_row_json,
    normalized_row_json,
    source_route_key,
    source_wa_number
  )
  select
    v_batch_id,
    p_company_id,
    r.sheet_name,
    r.source_row_index,
    r.row_kind,
    r.raw_row_json,
    r.normalized_row_json,
    r.source_route_key,
    r.source_wa_number
  from jsonb_to_recordset(p_rows) as r(
    sheet_name text,
    source_row_index integer,
    row_kind text,
    raw_row_json jsonb,
    normalized_row_json jsonb,
    source_route_key text,
    source_wa_number text
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'report_shape_key', v_report_shape_key,
    'inserted_row_count', jsonb_array_length(p_rows)
  );
end;
$$;


ALTER FUNCTION "public"."stage_operations_dro_report"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_operations_dsw_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_batch_id uuid;
begin

  -- leave existing delete/insert batch logic unchanged

  delete from core.operations_report_summary_row s
  using core.operations_report_batch b
  where s.batch_id = b.id
    and b.company_id = p_company_id
    and b.report_family_key = 'DSW'
    and b.report_shape_key = 'DSW_DAILY_SERVICE_WORKSHEET'
    and b.service_date = p_service_date;

  delete from core.operations_report_raw_row r
  using core.operations_report_batch b
  where r.batch_id = b.id
    and b.company_id = p_company_id
    and b.report_family_key = 'DSW'
    and b.report_shape_key = 'DSW_DAILY_SERVICE_WORKSHEET'
    and b.service_date = p_service_date;

  delete from core.operations_report_batch
  where company_id = p_company_id
    and report_family_key = 'DSW'
    and report_shape_key = 'DSW_DAILY_SERVICE_WORKSHEET'
    and service_date = p_service_date;

  insert into core.operations_report_batch (
    company_id, report_family_key, report_shape_key, service_date,
    report_frame, snapshot_kind, source_filename, source_hash,
    detected_sheet_name, detected_header_row, detected_headers,
    row_count, route_row_count, participant_row_count, skipped_row_count,
    status, uploaded_by_profile_id, metadata_json
  )
  values (
    p_company_id, 'DSW', 'DSW_DAILY_SERVICE_WORKSHEET', p_service_date,
    null, 'IN_DAY', p_source_filename, p_source_hash,
    p_detected_sheet_name, p_detected_header_row, p_detected_headers,
    p_row_count, p_route_row_count, p_participant_row_count, p_skipped_row_count,
    'LOADED', p_uploaded_by_profile_id, p_metadata_json
  )
  returning id into v_batch_id;

  insert into core.operations_report_raw_row (
    batch_id,
    company_id,
    sheet_name,
    source_row_index,
    row_kind,
    parent_source_row_index,
    parent_route_key,
    parent_wa_number,
    parent_driver_name,
    raw_row_json,
    normalized_row_json,
    source_route_key,
    source_wa_number,
    source_driver_name,
    source_dswid
  )
  select
    v_batch_id,
    p_company_id,
    r.sheet_name,
    r.source_row_index,
    r.row_kind,
    r.parent_source_row_index,
    r.parent_route_key,
    r.parent_wa_number,
    r.parent_driver_name,
    r.raw_row_json,
    r.normalized_row_json,
    r.source_route_key,
    r.source_wa_number,
    r.source_driver_name,
    r.source_dswid
  from jsonb_to_recordset(p_rows) as r(
    sheet_name text,
    source_row_index integer,
    row_kind text,
    parent_source_row_index integer,
    parent_route_key text,
    parent_wa_number text,
    parent_driver_name text,
    raw_row_json jsonb,
    normalized_row_json jsonb,
    source_route_key text,
    source_wa_number text,
    source_driver_name text,
    source_dswid text
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'inserted_row_count', jsonb_array_length(p_rows)
  );

end;
$$;


ALTER FUNCTION "public"."stage_operations_dsw_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_operations_dsw_summary_rows"("p_batch_id" "uuid", "p_company_id" "uuid", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
begin
  delete from core.operations_report_summary_row
  where batch_id = p_batch_id
    and company_id = p_company_id
    and report_family_key = 'DSW';

  insert into core.operations_report_summary_row (
    batch_id,
    company_id,
    report_family_key,
    service_date,
    summary_scope,
    summary_label,
    contract_code,
    terminal_code,
    source_row_index,
    raw_row_json,
    normalized_row_json
  )
  select
    p_batch_id,
    p_company_id,
    'DSW',
    r.service_date,
    r.summary_scope,
    r.summary_label,
    r.contract_code,
    r.terminal_code,
    r.source_row_index,
    r.raw_row_json,
    r.normalized_row_json
  from jsonb_to_recordset(p_rows) as r(
    service_date date,
    summary_scope text,
    summary_label text,
    contract_code text,
    terminal_code text,
    source_row_index integer,
    raw_row_json jsonb,
    normalized_row_json jsonb
  );

  return jsonb_build_object(
    'inserted_summary_row_count',
    coalesce(jsonb_array_length(p_rows), 0)
  );
end;
$$;


ALTER FUNCTION "public"."stage_operations_dsw_summary_rows"("p_batch_id" "uuid", "p_company_id" "uuid", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_operations_fcc_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_batch_id uuid;
  v_row jsonb;
begin
  insert into core.operations_report_batch (
    company_id,
    report_family_key,
    report_shape_key,
    service_date,
    report_frame,
    snapshot_kind,
    source_filename,
    source_hash,
    detected_sheet_name,
    detected_header_row,
    detected_headers,
    row_count,
    route_row_count,
    participant_row_count,
    skipped_row_count,
    status,
    uploaded_by_profile_id,
    metadata_json
  )
  values (
    p_company_id,
    'FCC',
    'FCC_SERVICE_AREA_STATUS',
    p_service_date,
    null,
    'IN_DAY',
    p_source_filename,
    p_source_hash,
    p_detected_sheet_name,
    p_detected_header_row,
    p_detected_headers,
    p_row_count,
    p_route_row_count,
    p_participant_row_count,
    p_skipped_row_count,
    'LOADED',
    p_uploaded_by_profile_id,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into core.operations_report_raw_row (
      batch_id,
      company_id,
      sheet_name,
      source_row_index,
      row_kind,
      raw_row_json,
      normalized_row_json,
      source_route_key,
      source_wa_number,
      source_driver_name,
      source_dswid,
      matched_roster_member_id,
      match_method,
      match_confidence
    )
    values (
      v_batch_id,
      p_company_id,
      v_row->>'sheet_name',
      coalesce((v_row->>'source_row_index')::integer, 0),
      coalesce(v_row->>'row_kind', 'ROUTE'),
      coalesce(v_row->'raw_row_json', '{}'::jsonb),
      coalesce(v_row->'normalized_row_json', '{}'::jsonb),
      nullif(v_row->>'source_route_key', ''),
      nullif(v_row->>'source_wa_number', ''),
      nullif(v_row->>'source_driver_name', ''),
      nullif(v_row->>'source_dswid', ''),
      nullif(v_row->>'matched_roster_member_id', '')::uuid,
      nullif(v_row->>'match_method', ''),
      nullif(v_row->>'match_confidence', '')::numeric
    );
  end loop;

  return jsonb_build_object('batch_id', v_batch_id);
end;
$$;


ALTER FUNCTION "public"."stage_operations_fcc_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_operations_automation_run"("p_company_id" "uuid", "p_automation_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_run_id uuid;
begin
  insert into core.operations_automation_run (
    company_id,
    automation_type,
    status,
    started_at
  )
  values (
    p_company_id,
    p_automation_type,
    'RUNNING',
    now()
  )
  returning id into v_run_id;

  return v_run_id;
end;
$$;


ALTER FUNCTION "public"."start_operations_automation_run"("p_company_id" "uuid", "p_automation_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supersede_operations_report_batch"("p_new_batch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_report_family_key text;
  v_service_date date;
  v_snapshot_kind text;
begin
  select
    company_id,
    report_family_key,
    service_date,
    snapshot_kind
  into
    v_company_id,
    v_report_family_key,
    v_service_date,
    v_snapshot_kind
  from core.operations_report_batch
  where id = p_new_batch_id;

  if v_company_id is null then
    raise exception 'Batch not found: %', p_new_batch_id;
  end if;

  -- IN_DAY snapshots are intentionally retained during the active service day.
  if v_snapshot_kind <> 'FINAL' then
    return;
  end if;

  -- FINAL is the authoritative artifact for the service date.
  -- When FINAL lands, sweep related LOADED DSW artifacts for that date.
  update core.operations_report_batch
  set
    status = 'REPLACED',
    metadata_json = metadata_json || jsonb_build_object(
      'replaced_reason', 'Superseded by FINAL report artifact for same company/service date',
      'replaced_by_batch_id', p_new_batch_id,
      'replaced_at', now()
    ),
    updated_at = now()
  where company_id = v_company_id
    and report_family_key = v_report_family_key
    and service_date = v_service_date
    and id <> p_new_batch_id
    and status = 'LOADED';
end;
$$;


ALTER FUNCTION "public"."supersede_operations_report_batch"("p_new_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_notes" "text", "p_assignment_muted" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_company_id uuid;
  v_asset core.asset%rowtype;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found';
  end if;

  select * into v_asset
  from core.asset
  where id = p_asset_id
    and company_id = v_company_id;

  if v_asset.id is null then
    raise exception 'Asset not found';
  end if;

  update core.asset
  set notes = nullif(trim(coalesce(p_notes, '')), ''),
      assignment_muted = coalesce(p_assignment_muted, false),
      updated_at = now()
  where id = p_asset_id;

  insert into core.asset_event (
    asset_id,
    company_id,
    event_key,
    event_label,
    from_status_id,
    to_status_id,
    person_id,
    roster_member_id,
    event_notes
  )
  values (
    p_asset_id,
    v_company_id,
    'ADMIN_UPDATE',
    'Asset admin update',
    v_asset.asset_status_id,
    v_asset.asset_status_id,
    null,
    v_asset.assigned_roster_member_id,
    concat_ws(
      E'\n',
      'Assignment muted: ' || coalesce(p_assignment_muted, false)::text,
      nullif(trim(coalesce(p_notes, '')), '')
    )
  );

  return jsonb_build_object('ok', true, 'asset_id', p_asset_id);
end;
$$;


ALTER FUNCTION "public"."update_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_notes" "text", "p_assignment_muted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_company_operations_config"("p_company_slug" "text", "p_route_sort_key" "text", "p_route_sort_direction" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select core.update_company_operations_config(
    p_company_slug,
    p_route_sort_key,
    p_route_sort_direction
  );
$$;


ALTER FUNCTION "public"."update_company_operations_config"("p_company_slug" "text", "p_route_sort_key" "text", "p_route_sort_direction" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_company_profile_grants"("p_company_slug" "text", "p_profile_id" "uuid", "p_grant_keys" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_access jsonb;
  v_company_id uuid;
  v_actor_profile_id uuid;
  v_membership jsonb;
  v_can_edit boolean;
begin
  v_access := core.access_context();
  v_actor_profile_id := nullif(v_access->>'profile_id', '')::uuid;

  select c.id
  into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    return jsonb_build_object('error', 'Company not found.');
  end if;

  select m
  into v_membership
  from jsonb_array_elements(coalesce(v_access->'memberships', '[]'::jsonb)) m
  where m->>'company_slug' = p_company_slug
  limit 1;

  v_can_edit :=
    coalesce((v_access->>'is_platform_owner')::boolean, false)
    or (
      v_membership->>'relationship_type' = 'admin'
      and v_membership->>'membership_status' = 'active'
    );

  if not v_can_edit then
    return jsonb_build_object('error', 'Forbidden.');
  end if;

  if not exists (
    select 1
    from core.company_memberships cm
    where cm.company_id = v_company_id
      and cm.profile_id = p_profile_id
  ) then
    return jsonb_build_object('error', 'Profile is not attached to this company.');
  end if;

  delete from core.company_user_grant
  where company_id = v_company_id
    and profile_id = p_profile_id;

  insert into core.company_user_grant (
    company_id,
    profile_id,
    grant_key,
    granted_by_profile_id
  )
  select
    v_company_id,
    p_profile_id,
    grant_key,
    v_actor_profile_id
  from (
    select distinct unnest(coalesce(p_grant_keys, array[]::text[])) as grant_key
  ) s
  where grant_key in (
    'schedule',
    'dispatch',
    'routes',
    'planning',
    'delivery_window',
    'operations_uploads',
    'reports',
    'roster',
    'hiring',
    'payroll',
    'admin_config',
    'grant_management'
  );

  return public.get_company_access_config(p_company_slug);
end;
$$;


ALTER FUNCTION "public"."update_company_profile_grants"("p_company_slug" "text", "p_profile_id" "uuid", "p_grant_keys" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select core.update_company_roster_details(
    p_company_slug,
    p_roster_id,
    p_full_name,
    p_email,
    p_phone,
    p_worker_type,
    p_market_code,
    p_notes,
    p_date_of_birth,
    p_address_line_1,
    p_address_line_2,
    p_city,
    p_state_region,
    p_postal_code,
    p_license_number,
    p_issuing_state,
    p_license_issue_date,
    p_license_expiration_date
  );
$$;


ALTER FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_hire_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select core.update_company_roster_details(
    p_company_slug,
    p_roster_id,
    p_full_name,
    p_email,
    p_phone,
    p_worker_type,
    p_market_code,
    p_notes,
    p_date_of_birth,
    p_hire_date,
    p_address_line_1,
    p_address_line_2,
    p_city,
    p_state_region,
    p_postal_code,
    p_license_number,
    p_issuing_state,
    p_license_issue_date,
    p_license_expiration_date
  );
$$;


ALTER FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_hire_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_company_roster_note"("p_company_slug" "text", "p_roster_id" "uuid", "p_note" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
  select core.update_company_roster_note(
    p_company_slug,
    p_roster_id,
    p_note
  );
$$;


ALTER FUNCTION "public"."update_company_roster_note"("p_company_slug" "text", "p_roster_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_company_roster_operations"("p_company_slug" "text", "p_roster_id" "uuid", "p_fx_id" "text" DEFAULT NULL::"text", "p_dswid" "text" DEFAULT NULL::"text", "p_scanner_serial" "text" DEFAULT NULL::"text", "p_dot_exp" "date" DEFAULT NULL::"date", "p_qual_cert_exp" "date" DEFAULT NULL::"date", "p_daily_pay_effective_date" "date" DEFAULT NULL::"date", "p_daily_pay_rate" numeric DEFAULT NULL::numeric, "p_fuel_card" "text" DEFAULT NULL::"text", "p_pin_id_no" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_company_id uuid;
  v_roster_id uuid;
  v_result jsonb;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found for slug %', p_company_slug;
  end if;

  select id into v_roster_id
  from core.company_roster
  where id = p_roster_id
    and company_id = v_company_id;

  if v_roster_id is null then
    raise exception 'Roster record not found for %', p_roster_id;
  end if;

  delete from core.company_roster_identifier
  where roster_id = p_roster_id
    and identifier_type in ('fx_id', 'dswid');

  if nullif(trim(coalesce(p_fx_id, '')), '') is not null then
    insert into core.company_roster_identifier (roster_id, identifier_type, identifier_value)
    values (p_roster_id, 'fx_id', trim(p_fx_id));
  end if;

  if nullif(trim(coalesce(p_dswid, '')), '') is not null then
    insert into core.company_roster_identifier (roster_id, identifier_type, identifier_value)
    values (p_roster_id, 'dswid', trim(p_dswid));
  end if;

  insert into core.company_roster_operations_fact (
    roster_id,
    scanner_serial,
    dot_exp,
    qual_cert_exp,
    daily_pay_effective_date,
    daily_pay_rate,
    fuel_card,
    pin_id_no,
    updated_at
  )
  values (
    p_roster_id,
    nullif(trim(coalesce(p_scanner_serial, '')), ''),
    p_dot_exp,
    p_qual_cert_exp,
    p_daily_pay_effective_date,
    p_daily_pay_rate,
    nullif(trim(coalesce(p_fuel_card, '')), ''),
    nullif(trim(coalesce(p_pin_id_no, '')), ''),
    now()
  )
  on conflict (roster_id) do update set
    scanner_serial = excluded.scanner_serial,
    dot_exp = excluded.dot_exp,
    qual_cert_exp = excluded.qual_cert_exp,
    daily_pay_effective_date = excluded.daily_pay_effective_date,
    daily_pay_rate = excluded.daily_pay_rate,
    fuel_card = excluded.fuel_card,
    pin_id_no = excluded.pin_id_no,
    updated_at = now();

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at
  )
  values (
    v_company_id,
    p_roster_id,
    'operations',
    'operations_updated',
    'Operations fields updated',
    jsonb_build_object('source', 'update_company_roster_operations_rpc'),
    now()
  );

  select jsonb_build_object(
    'roster_member_id', crv.roster_member_id,
    'fx_id', crv.fx_id,
    'dswid', crv.dswid,
    'scanner_serial', ops.scanner_serial,
    'dot_expiration_date', ops.dot_exp,
    'qual_cert_expiration_date', ops.qual_cert_exp,
    'daily_pay_effective_date', ops.daily_pay_effective_date,
    'daily_pay_rate', ops.daily_pay_rate,
    'fuel_card', ops.fuel_card,
    'pin_id_no', ops.pin_id_no
  )
  into v_result
  from public.company_roster_view crv
  left join core.company_roster_operations_fact ops
    on ops.roster_id = crv.roster_member_id
  where crv.roster_member_id = p_roster_id
    and crv.company_id = v_company_id;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."update_company_roster_operations"("p_company_slug" "text", "p_roster_id" "uuid", "p_fx_id" "text", "p_dswid" "text", "p_scanner_serial" "text", "p_dot_exp" "date", "p_qual_cert_exp" "date", "p_daily_pay_effective_date" "date", "p_daily_pay_rate" numeric, "p_fuel_card" "text", "p_pin_id_no" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_operations_collection_artifact_status"("p_artifact_id" "uuid", "p_artifact_status" "text", "p_ingest_metadata_json" "jsonb" DEFAULT NULL::"jsonb", "p_report_batch_id" "uuid" DEFAULT NULL::"uuid", "p_error_message" "text" DEFAULT NULL::"text") RETURNS "public"."operations_collection_artifact_v"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'core', 'public'
    AS $$
declare
  v_row public.operations_collection_artifact_v;
begin
  update core.operations_collection_artifact
  set
    artifact_status = p_artifact_status,
    ingest_metadata_json = coalesce(p_ingest_metadata_json, ingest_metadata_json),
    report_batch_id = p_report_batch_id,
    error_message = p_error_message,
    updated_at = now()
  where id = p_artifact_id;

  select *
  into v_row
  from public.operations_collection_artifact_v
  where id = p_artifact_id;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."update_operations_collection_artifact_status"("p_artifact_id" "uuid", "p_artifact_status" "text", "p_ingest_metadata_json" "jsonb", "p_report_batch_id" "uuid", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_operations_collection_request_status"("p_request_id" "uuid", "p_request_status" "text", "p_error_message" "text" DEFAULT NULL::"text", "p_automation_run_id" "uuid" DEFAULT NULL::"uuid", "p_report_batch_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "public"."operations_collection_request_v"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_row public.operations_collection_request_v;
begin
  update core.operations_collection_request
  set
    request_status = p_request_status,
    started_at = case when p_request_status = 'RUNNING' and started_at is null then now() else started_at end,
    completed_at = case when p_request_status in ('COMPLETE', 'FAILED', 'CANCELLED') then now() else completed_at end,
    error_message = coalesce(p_error_message, error_message),
    automation_run_id = coalesce(p_automation_run_id, automation_run_id),
    report_batch_ids = coalesce(p_report_batch_ids, report_batch_ids),
    updated_at = now()
  where id = p_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = p_request_id;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."update_operations_collection_request_status"("p_request_id" "uuid", "p_request_status" "text", "p_error_message" "text", "p_automation_run_id" "uuid", "p_report_batch_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_asset_type_key" "text", "p_asset_identifier" "text", "p_asset_status_key" "text", "p_asset_provider_id" "uuid", "p_secondary_identifier" "text", "p_notes" "text", "p_assignment_muted" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_company_id uuid;
  v_asset_type_id uuid;
  v_status_id uuid;
  v_asset_id uuid;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found'; end if;

  select id into v_asset_type_id
  from core.asset_type
  where asset_type_key = upper(trim(p_asset_type_key));

  if v_asset_type_id is null then raise exception 'Asset type not found'; end if;

  select id into v_status_id
  from core.asset_status
  where status_key = upper(trim(p_asset_status_key));

  if v_status_id is null then raise exception 'Asset status not found'; end if;

  if p_asset_provider_id is not null and not exists (
    select 1
    from core.asset_provider
    where id = p_asset_provider_id
      and company_id = v_company_id
      and asset_type_id = v_asset_type_id
      and is_active = true
  ) then
    raise exception 'Provider not valid for company asset type';
  end if;

  if p_asset_id is null then
    insert into core.asset (
      company_id,
      asset_type_id,
      asset_status_id,
      asset_identifier,
      display_name,
      asset_provider_id,
      secondary_identifier,
      notes,
      assignment_muted
    )
    values (
      v_company_id,
      v_asset_type_id,
      v_status_id,
      trim(p_asset_identifier),
      trim(p_asset_identifier),
      p_asset_provider_id,
      nullif(trim(coalesce(p_secondary_identifier, '')), ''),
      nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(p_assignment_muted, false)
    )
    returning id into v_asset_id;
  else
    update core.asset
    set asset_status_id = v_status_id,
        asset_identifier = trim(p_asset_identifier),
        display_name = trim(p_asset_identifier),
        asset_provider_id = p_asset_provider_id,
        secondary_identifier = nullif(trim(coalesce(p_secondary_identifier, '')), ''),
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        assignment_muted = coalesce(p_assignment_muted, false),
        updated_at = now()
    where id = p_asset_id
      and company_id = v_company_id
    returning id into v_asset_id;

    if v_asset_id is null then raise exception 'Asset not found'; end if;
  end if;

  return jsonb_build_object('ok', true, 'asset_id', v_asset_id);
end;
$$;


ALTER FUNCTION "public"."upsert_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_asset_type_key" "text", "p_asset_identifier" "text", "p_asset_status_key" "text", "p_asset_provider_id" "uuid", "p_secondary_identifier" "text", "p_notes" "text", "p_assignment_muted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_walk_on_driver"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date" DEFAULT CURRENT_DATE, "p_created_by_profile_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'core'
    AS $$
declare
  v_company_id uuid;
  v_full_name text;
  v_normalized_name text;
  v_walk_on core.walk_on_driver;
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

  v_full_name := nullif(trim(coalesce(p_full_name, '')), '');

  if v_full_name is null then
    raise exception 'Walk-on driver name is required.';
  end if;

  v_normalized_name := lower(regexp_replace(v_full_name, '\s+', ' ', 'g'));

  insert into core.walk_on_driver (
    company_id,
    full_name,
    normalized_name,
    first_seen_date,
    last_seen_date,
    dispatch_count,
    status,
    created_by_profile_id
  )
  values (
    v_company_id,
    v_full_name,
    v_normalized_name,
    coalesce(p_seen_date, current_date),
    coalesce(p_seen_date, current_date),
    1,
    'ACTIVE',
    p_created_by_profile_id
  )
  on conflict (company_id, normalized_name)
  do update set
    full_name = excluded.full_name,
    last_seen_date = greatest(core.walk_on_driver.last_seen_date, excluded.last_seen_date),
    dispatch_count = core.walk_on_driver.dispatch_count + 1,
    status = case
      when core.walk_on_driver.status = 'ARCHIVED' then 'ACTIVE'
      else core.walk_on_driver.status
    end,
    updated_at = now()
  returning *
  into v_walk_on;

  return jsonb_build_object(
    'ok', true,
    'walk_on_driver', to_jsonb(v_walk_on)
  );
end;
$$;


ALTER FUNCTION "public"."upsert_walk_on_driver"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date", "p_created_by_profile_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."customer" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "provider_customer_id" "text",
    "billing_email" "text",
    "billing_name" "text",
    "billing_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_customer_provider_ck" CHECK (("provider" = 'stripe'::"text")),
    CONSTRAINT "billing_customer_status_ck" CHECK (("billing_status" = ANY (ARRAY['not_started'::"text", 'ready'::"text", 'active'::"text", 'past_due'::"text", 'suspended'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "billing"."customer" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."subscription" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "provider_subscription_id" "text",
    "price_key" "text" NOT NULL,
    "billing_interval" "text" DEFAULT 'week'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_subscription_interval_ck" CHECK (("billing_interval" = ANY (ARRAY['week'::"text", 'month'::"text", 'year'::"text"]))),
    CONSTRAINT "billing_subscription_provider_ck" CHECK (("provider" = 'stripe'::"text")),
    CONSTRAINT "billing_subscription_status_ck" CHECK (("subscription_status" = ANY (ARRAY['not_started'::"text", 'incomplete'::"text", 'trialing'::"text", 'active'::"text", 'past_due'::"text", 'unpaid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "billing"."subscription" OWNER TO "postgres";


CREATE OR REPLACE VIEW "billing"."customer_subscription_v" AS
 SELECT "c"."id" AS "billing_customer_id",
    "c"."company_id",
    "co"."company_slug",
    "co"."company_name",
    "c"."provider",
    "c"."provider_customer_id",
    "c"."billing_email",
    "c"."billing_name",
    "c"."billing_status",
    "s"."id" AS "subscription_id",
    "s"."provider_subscription_id",
    "s"."price_key",
    "s"."billing_interval",
    "s"."subscription_status",
    "s"."current_period_start",
    "s"."current_period_end",
    "s"."cancel_at_period_end",
    GREATEST("c"."updated_at", COALESCE("s"."updated_at", "c"."updated_at")) AS "updated_at"
   FROM (("billing"."customer" "c"
     JOIN "core"."companies" "co" ON (("co"."id" = "c"."company_id")))
     LEFT JOIN "billing"."subscription" "s" ON (("s"."customer_id" = "c"."id")));


ALTER VIEW "billing"."customer_subscription_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."payment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "payment_purpose" "text" NOT NULL,
    "provider_checkout_session_id" "text",
    "provider_payment_intent_id" "text",
    "provider_event_id" "text",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "provider_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_payment_amount_ck" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "billing_payment_currency_ck" CHECK (("currency" = "lower"("currency"))),
    CONSTRAINT "billing_payment_provider_ck" CHECK (("provider" = 'stripe'::"text")),
    CONSTRAINT "billing_payment_purpose_ck" CHECK (("payment_purpose" = ANY (ARRAY['implementation'::"text", 'subscription'::"text"]))),
    CONSTRAINT "billing_payment_status_ck" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'partially_refunded'::"text"])))
);


ALTER TABLE "billing"."payment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "commercial"."operator_tier" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tier_key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "min_routes" integer,
    "max_routes" integer,
    "implementation_fee" numeric(10,2),
    "weekly_subscription" numeric(10,2),
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_subscription_product_id" "text",
    "stripe_subscription_price_id" "text",
    "stripe_setup_product_id" "text",
    "stripe_setup_price_id" "text"
);


ALTER TABLE "commercial"."operator_tier" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "commercial"."profile" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "operator_tier_key" "text",
    "implementation_fee" numeric(10,2),
    "weekly_subscription" numeric(10,2),
    "billing_contact_name" "text",
    "billing_email" "text",
    "billing_phone" "text",
    "commercial_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commercial_profile_commercial_status_check" CHECK (("commercial_status" = ANY (ARRAY['draft'::"text", 'profile_complete'::"text", 'ready_for_stripe'::"text", 'stripe_customer_created'::"text", 'implementation_paid'::"text", 'subscription_active'::"text", 'suspended'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "commercial"."profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."asset" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "asset_type_id" "uuid" NOT NULL,
    "asset_status_id" "uuid" NOT NULL,
    "asset_identifier" "text" NOT NULL,
    "assigned_person_id" "uuid",
    "assigned_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "display_name" "text",
    "secondary_identifier" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider" "text",
    "assigned_roster_member_id" "uuid",
    "assignment_muted" boolean DEFAULT false NOT NULL,
    "asset_provider_id" "uuid",
    CONSTRAINT "asset_assigned_state_ck" CHECK ((("assigned_person_id" IS NULL) OR ("assigned_at" IS NOT NULL))),
    CONSTRAINT "asset_identifier_not_blank_ck" CHECK (("length"(TRIM(BOTH FROM "asset_identifier")) > 0))
);


ALTER TABLE "core"."asset" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."asset_assignment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "person_id" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone,
    "release_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "roster_member_id" "uuid",
    CONSTRAINT "asset_assignment_window_ck" CHECK ((("released_at" IS NULL) OR ("released_at" >= "assigned_at")))
);


ALTER TABLE "core"."asset_assignment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."asset_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "person_id" "uuid",
    "audit_key" "text" DEFAULT 'CUSTODY_CHECK'::"text" NOT NULL,
    "verification_outcome" "text" NOT NULL,
    "health_status" "text",
    "notes" "text",
    "verified_by_person_id" "uuid",
    "verified_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "asset_audit_outcome_not_blank_ck" CHECK (("length"(TRIM(BOTH FROM "verification_outcome")) > 0))
);


ALTER TABLE "core"."asset_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."asset_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "event_key" "text" NOT NULL,
    "event_label" "text" NOT NULL,
    "from_status_id" "uuid",
    "to_status_id" "uuid",
    "person_id" "uuid",
    "event_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "roster_member_id" "uuid",
    CONSTRAINT "asset_event_key_not_blank_ck" CHECK (("length"(TRIM(BOTH FROM "event_key")) > 0))
);


ALTER TABLE "core"."asset_event" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."asset_provider" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "asset_type_id" "uuid" NOT NULL,
    "provider_key" "text" NOT NULL,
    "provider_label" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."asset_provider" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."asset_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status_key" "text" NOT NULL,
    "status_label" "text" NOT NULL,
    "status_group" "text" NOT NULL,
    "is_assignable" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."asset_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."asset_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_type_key" "text" NOT NULL,
    "asset_type_label" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."asset_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."automation_credential" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "encrypted_secret" "text" NOT NULL,
    "has_secret" boolean DEFAULT true NOT NULL,
    "last_verified_at" timestamp with time zone,
    "last_verification_result" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."automation_credential" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."candidate_checklist_item_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_key" "text" NOT NULL,
    "default_label" "text" NOT NULL,
    "description" "text",
    "default_required" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."candidate_checklist_item_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."candidate_stage_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stage_key" "text" NOT NULL,
    "default_label" "text" NOT NULL,
    "description" "text",
    "is_terminal" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."candidate_stage_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_candidate_checklist_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "item_type_id" "uuid" NOT NULL,
    "display_label" "text" NOT NULL,
    "is_required" boolean DEFAULT true NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "readiness_weight" numeric(8,2) DEFAULT 1 NOT NULL
);


ALTER TABLE "core"."company_candidate_checklist_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_candidate_stage_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "stage_type_id" "uuid" NOT NULL,
    "display_label" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."company_candidate_stage_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_contract_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "contract_number" "text" NOT NULL,
    "terminal_identity" "text" NOT NULL,
    "service_area" "text" NOT NULL,
    "effective_start_date" "date" NOT NULL,
    "effective_end_date" "date",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."company_contract_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "mobile_phone" "text",
    "invite_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "linked_profile_id" "uuid",
    "sent_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "uploaded_batch_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_invites_accepted_at_ck" CHECK ((("accepted_at" IS NULL) OR ("invite_status" = 'accepted'::"text"))),
    CONSTRAINT "company_invites_email_ck" CHECK (("length"("btrim"("email")) > 0)),
    CONSTRAINT "company_invites_first_name_ck" CHECK (("length"("btrim"("first_name")) > 0)),
    CONSTRAINT "company_invites_invite_status_ck" CHECK (("invite_status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "company_invites_last_name_ck" CHECK (("length"("btrim"("last_name")) > 0)),
    CONSTRAINT "company_invites_sent_at_ck" CHECK ((("sent_at" IS NULL) OR ("invite_status" = ANY (ARRAY['sent'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"])))),
    CONSTRAINT "company_invites_source_type_ck" CHECK (("source_type" = ANY (ARRAY['manual'::"text", 'csv_import'::"text", 'admin_created'::"text"])))
);


ALTER TABLE "core"."company_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "membership_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "relationship_type" "text" DEFAULT 'member'::"text" NOT NULL,
    "title" "text",
    "invited_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "default_company_home" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_memberships_accepted_implies_invited_ck" CHECK ((("accepted_at" IS NULL) OR ("invited_at" IS NOT NULL))),
    CONSTRAINT "company_memberships_membership_status_ck" CHECK (("membership_status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'inactive'::"text", 'ended'::"text"]))),
    CONSTRAINT "company_memberships_relationship_type_ck" CHECK (("relationship_type" = ANY (ARRAY['member'::"text", 'candidate'::"text", 'admin'::"text"]))),
    CONSTRAINT "company_memberships_started_ended_ck" CHECK ((("ended_at" IS NULL) OR ("started_at" IS NULL) OR ("ended_at" >= "started_at")))
);


ALTER TABLE "core"."company_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_onboardings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "onboarding_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "source_type" "text" DEFAULT 'self_serve'::"text" NOT NULL,
    "target_membership_id" "uuid",
    "initiated_by_profile_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "abandoned_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_onboardings_abandoned_at_ck" CHECK ((("abandoned_at" IS NULL) OR ("onboarding_status" = 'abandoned'::"text"))),
    CONSTRAINT "company_onboardings_completed_at_ck" CHECK ((("completed_at" IS NULL) OR ("onboarding_status" = 'completed'::"text"))),
    CONSTRAINT "company_onboardings_onboarding_status_ck" CHECK (("onboarding_status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'abandoned'::"text"]))),
    CONSTRAINT "company_onboardings_source_type_ck" CHECK (("source_type" = ANY (ARRAY['self_serve'::"text", 'company_invite'::"text", 'csv_import'::"text", 'admin_created'::"text"])))
);


ALTER TABLE "core"."company_onboardings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_operations_config" (
    "company_id" "uuid" NOT NULL,
    "route_sort_key" "text" DEFAULT 'route_name'::"text" NOT NULL,
    "route_sort_direction" "text" DEFAULT 'asc'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_operations_config_route_sort_direction_chk" CHECK (("route_sort_direction" = ANY (ARRAY['asc'::"text", 'desc'::"text"]))),
    CONSTRAINT "company_operations_config_route_sort_key_chk" CHECK (("route_sort_key" = ANY (ARRAY['route_name'::"text", 'current_wa_num'::"text", 'route_location'::"text"])))
);


ALTER TABLE "core"."company_operations_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_person_compensation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_member_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "pay_frequency" "text" NOT NULL,
    "standard_hours_per_week" numeric(5,2) DEFAULT 40 NOT NULL,
    "effective_start_date" "date",
    "effective_end_date" "date",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "source" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_person_compensation_pay_frequency_check" CHECK (("pay_frequency" = ANY (ARRAY['HOURLY'::"text", 'DAILY'::"text", 'WEEKLY'::"text", 'BIWEEKLY'::"text", 'MONTHLY'::"text", 'ANNUALLY'::"text"]))),
    CONSTRAINT "company_person_compensation_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'PENDING'::"text", 'ENDED'::"text"])))
);


ALTER TABLE "core"."company_person_compensation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_roster" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "worker_type" "text",
    "job_title" "text",
    "employment_status" "text",
    "market_code" "text",
    "hire_date" "date",
    "separation_date" "date",
    "reports_to_roster_id" "uuid",
    "invite_status" "text" DEFAULT 'Not Invited'::"text",
    "compliance_summary" "text" DEFAULT 'Missing'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "onboarding_completed_at" timestamp with time zone,
    "person_id" "uuid",
    "notes" "text",
    CONSTRAINT "company_roster_compliance_summary_check" CHECK (("compliance_summary" = ANY (ARRAY['Compliant'::"text", 'Missing'::"text", 'Expiring'::"text", 'Expired'::"text"]))),
    CONSTRAINT "company_roster_employment_status_check" CHECK (("employment_status" = ANY (ARRAY['Active'::"text", 'Candidate'::"text", 'Trainee'::"text", 'Former'::"text"]))),
    CONSTRAINT "company_roster_invite_status_check" CHECK (("invite_status" = ANY (ARRAY['Not Invited'::"text", 'Invited'::"text", 'Linked'::"text"])))
);


ALTER TABLE "core"."company_roster" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_roster_compliance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_member_id" "uuid" NOT NULL,
    "document_type_id" "uuid" NOT NULL,
    "has_document" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'MISSING'::"text" NOT NULL,
    "expiration_date" "date",
    "verified_at" timestamp with time zone,
    "verified_by_user_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_roster_compliance_status_check" CHECK (("status" = ANY (ARRAY['MISSING'::"text", 'ON_FILE'::"text", 'PENDING_REVIEW'::"text", 'EXPIRED'::"text", 'EXPIRING_SOON'::"text", 'WAIVED'::"text"])))
);


ALTER TABLE "core"."company_roster_compliance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_roster_document_file" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_member_id" "uuid" NOT NULL,
    "compliance_document_id" "uuid",
    "document_code" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'company-documents'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "sensitivity_level" "text" DEFAULT 'CONTROLLED'::"text" NOT NULL,
    "uploaded_by_user_id" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_current" boolean DEFAULT true NOT NULL,
    "notes" "text",
    CONSTRAINT "company_roster_document_file_sensitivity_level_check" CHECK (("sensitivity_level" = ANY (ARRAY['LOW'::"text", 'CONTROLLED'::"text", 'SENSITIVE'::"text", 'RESTRICTED'::"text"])))
);


ALTER TABLE "core"."company_roster_document_file" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_roster_dsw_alias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_id" "uuid" NOT NULL,
    "alias_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "core"."company_roster_dsw_alias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_roster_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_id" "uuid" NOT NULL,
    "event_category" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_detail" "text",
    "event_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_roster_event_event_category_check" CHECK (("event_category" = ANY (ARRAY['hiring'::"text", 'onboarding'::"text", 'compliance'::"text", 'operations'::"text", 'separation'::"text", 'system'::"text"])))
);


ALTER TABLE "core"."company_roster_event" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_roster_identifier" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "roster_id" "uuid",
    "identifier_type" "text" NOT NULL,
    "identifier_value" "text" NOT NULL
);


ALTER TABLE "core"."company_roster_identifier" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_roster_operations_fact" (
    "roster_id" "uuid" NOT NULL,
    "scanner_serial" "text",
    "dot_exp" "date",
    "qual_cert_exp" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fuel_card" "text",
    "pin_id_no" "text",
    "daily_pay_effective_date" "date",
    "daily_pay_rate" numeric(10,2),
    "fx_id" "text",
    "dswid" "text",
    "dsw_driver_name" "text",
    "trainee_daily_pay_rate" numeric
);


ALTER TABLE "core"."company_roster_operations_fact" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_roster_trainee_pay_override" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_id" "uuid" NOT NULL,
    "trainee_daily_pay_rate" numeric NOT NULL,
    "effective_start" "date" DEFAULT CURRENT_DATE NOT NULL,
    "effective_end" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."company_roster_trainee_pay_override" OWNER TO "postgres";


CREATE OR REPLACE VIEW "core"."company_roster_view" AS
 SELECT "r"."id" AS "roster_member_id",
    "r"."company_id",
    "r"."profile_id",
    "r"."full_name",
    "r"."email",
    "r"."phone",
    "r"."worker_type",
    "r"."job_title",
    "r"."employment_status",
    "r"."market_code",
    "sup"."full_name" AS "reports_to_name",
    "r"."hire_date",
    "r"."invite_status",
    "r"."compliance_summary",
    "fx"."identifier_value" AS "fx_id",
    "ds"."identifier_value" AS "dswid",
    "r"."person_id",
    "r"."reports_to_roster_id",
    "r"."separation_date",
    "r"."onboarding_completed_at",
    "r"."created_at",
    "r"."notes"
   FROM ((("core"."company_roster" "r"
     LEFT JOIN "core"."company_roster" "sup" ON (("sup"."id" = "r"."reports_to_roster_id")))
     LEFT JOIN "core"."company_roster_identifier" "fx" ON ((("fx"."roster_id" = "r"."id") AND ("fx"."identifier_type" = 'fx_id'::"text"))))
     LEFT JOIN "core"."company_roster_identifier" "ds" ON ((("ds"."roster_id" = "r"."id") AND ("ds"."identifier_type" = 'dswid'::"text"))));


ALTER VIEW "core"."company_roster_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."company_user_grant" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "grant_key" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."company_user_grant" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."compliance_document_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_type_key" "text" NOT NULL,
    "document_type_label" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "expiration_required" boolean DEFAULT false NOT NULL,
    "issue_date_allowed" boolean DEFAULT true NOT NULL,
    "verification_required" boolean DEFAULT true NOT NULL,
    "protected_access_level" "text" DEFAULT 'standard'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."compliance_document_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."data_rebuild_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "rebuild_type" "text" NOT NULL,
    "started_by" "uuid",
    "parameters_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."data_rebuild_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."dispatch_day" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "dispatch_date" "date" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "locked_at" timestamp with time zone,
    "locked_by_profile_id" "uuid",
    "snapshot_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dispatch_day_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'LOCKED'::"text"])))
);


ALTER TABLE "core"."dispatch_day" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."dispatch_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dispatch_day_id" "uuid" NOT NULL,
    "event_type_id" "uuid",
    "event_code" "text" NOT NULL,
    "event_label" "text" NOT NULL,
    "event_category" "text" DEFAULT 'DISPATCH'::"text" NOT NULL,
    "route_key" "text",
    "route_label" "text",
    "seat" "text",
    "person_roster_member_id" "uuid",
    "person_name" "text",
    "from_route_key" "text",
    "from_route_label" "text",
    "to_route_key" "text",
    "to_route_label" "text",
    "note" "text",
    "event_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."dispatch_event" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."dispatch_event_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "event_code" "text" NOT NULL,
    "event_label" "text" NOT NULL,
    "event_category" "text" DEFAULT 'DISPATCH'::"text" NOT NULL,
    "source" "text" DEFAULT 'system'::"text" NOT NULL,
    "requires_person" boolean DEFAULT false NOT NULL,
    "requires_route" boolean DEFAULT false NOT NULL,
    "requires_assignment" boolean DEFAULT false NOT NULL,
    "allows_note" boolean DEFAULT true NOT NULL,
    "requires_note" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "entry_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    CONSTRAINT "dispatch_event_type_entry_mode_check" CHECK (("entry_mode" = ANY (ARRAY['auto'::"text", 'manual'::"text", 'both'::"text"]))),
    CONSTRAINT "dispatch_event_type_source_check" CHECK (("source" = ANY (ARRAY['system'::"text", 'company'::"text"])))
);


ALTER TABLE "core"."dispatch_event_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."driver_activity_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "person_id" "uuid",
    "roster_member_id" "uuid",
    "service_date" "date" NOT NULL,
    "event_type" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "device_occurred_at" timestamp with time zone,
    "source" "text" DEFAULT 'DRIVER_WEB'::"text" NOT NULL,
    "event_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."driver_activity_event" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."driver_activity_event_type" (
    "event_type" "text" NOT NULL,
    "event_family" "text" NOT NULL,
    "event_owner" "text" NOT NULL,
    "description" "text" NOT NULL,
    "is_driver_action" boolean DEFAULT false NOT NULL,
    "is_system_action" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."driver_activity_event_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."driver_activity_signal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "person_id" "uuid",
    "roster_member_id" "uuid",
    "service_date" "date" NOT NULL,
    "signal_type" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confidence" "text" DEFAULT 'MEDIUM'::"text" NOT NULL,
    "source" "text" DEFAULT 'INSIGHT'::"text" NOT NULL,
    "source_activity_event_id" "uuid",
    "source_breadcrumb_id" "uuid",
    "signal_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."driver_activity_signal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."driver_breadcrumb_point" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "person_id" "uuid",
    "roster_member_id" "uuid",
    "service_date" "date" NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "device_captured_at" timestamp with time zone,
    "latitude" numeric(10,7) NOT NULL,
    "longitude" numeric(10,7) NOT NULL,
    "accuracy_meters" numeric(10,2),
    "source" "text" DEFAULT 'DRIVER_WEB'::"text" NOT NULL,
    "tracking_context" "text" DEFAULT 'SCHEDULED_WORK_WINDOW'::"text" NOT NULL,
    "source_activity_event_id" "uuid",
    "breadcrumb_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."driver_breadcrumb_point" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_automation_run" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "automation_type" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "status" "text" DEFAULT 'RUNNING'::"text" NOT NULL,
    "source_filename" "text",
    "batch_id" "uuid",
    "inserted_rows" integer,
    "matched_rows" integer,
    "unmatched_rows" integer,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "route_count" integer,
    "summary_rows" integer,
    "download_ms" integer,
    "ingest_ms" integer,
    "artifact_bucket" "text",
    "artifact_path" "text",
    "artifact_filename" "text",
    "artifact_size" bigint,
    "artifact_hash" "text",
    "artifact_uploaded_at" timestamp with time zone,
    "artifact_status" "text"
);


ALTER TABLE "core"."operations_automation_run" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_collection_order" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "order_type" "text" NOT NULL,
    "order_status" "text" DEFAULT 'QUEUED'::"text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "service_date" "date",
    "service_date_start" "date",
    "service_date_end" "date",
    "requested_reports" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "order_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "claimed_by" "text",
    "claimed_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "automation_run_id" "uuid",
    "report_batch_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "error_message" "text",
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."operations_collection_order" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_report_batch" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "report_family_key" "text",
    "report_shape_key" "text",
    "service_date" "date",
    "report_frame" "text",
    "snapshot_kind" "text" DEFAULT 'IN_DAY'::"text" NOT NULL,
    "source_filename" "text",
    "source_hash" "text",
    "detected_sheet_name" "text",
    "detected_header_row" integer,
    "detected_headers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "row_count" integer DEFAULT 0 NOT NULL,
    "route_row_count" integer DEFAULT 0 NOT NULL,
    "participant_row_count" integer DEFAULT 0 NOT NULL,
    "skipped_row_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'STAGED'::"text" NOT NULL,
    "uploaded_by_profile_id" "uuid",
    "metadata_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operations_report_batch_report_frame_check" CHECK ((("report_frame" = ANY (ARRAY['AM'::"text", 'PM'::"text"])) OR ("report_frame" IS NULL))),
    CONSTRAINT "operations_report_batch_snapshot_kind_check" CHECK (("snapshot_kind" = ANY (ARRAY['IN_DAY'::"text", 'FINAL'::"text", 'PROJECTION'::"text"]))),
    CONSTRAINT "operations_report_batch_status_check" CHECK (("status" = ANY (ARRAY['STAGED'::"text", 'LOADED'::"text", 'REPLACED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "core"."operations_report_batch" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_report_raw_row" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "sheet_name" "text",
    "source_row_index" integer NOT NULL,
    "row_kind" "text" DEFAULT 'UNKNOWN'::"text" NOT NULL,
    "raw_row_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "normalized_row_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source_route_key" "text",
    "source_wa_number" "text",
    "source_driver_name" "text",
    "source_dswid" "text",
    "matched_roster_member_id" "uuid",
    "match_method" "text",
    "match_confidence" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_source_row_index" integer,
    "parent_route_key" "text",
    "parent_wa_number" "text",
    "parent_driver_name" "text",
    CONSTRAINT "operations_report_raw_row_row_kind_check" CHECK (("row_kind" = ANY (ARRAY['UNKNOWN'::"text", 'HEADER'::"text", 'METADATA'::"text", 'ROUTE'::"text", 'ROUTE_CANDIDATE'::"text", 'ROUTE_BREAKOUT'::"text", 'PARTICIPANT'::"text", 'SUMMARY'::"text", 'FOOTER'::"text", 'SKIP'::"text"])))
);


ALTER TABLE "core"."operations_report_raw_row" OWNER TO "postgres";


CREATE OR REPLACE VIEW "core"."operations_dsw_daily_fact_v" AS
 SELECT "b"."company_id",
    "b"."service_date",
    ("count"(*))::integer AS "routes",
    "sum"(COALESCE((("r"."normalized_row_json" ->> 'actual_delivery_stops'::"text"))::numeric, (0)::numeric)) AS "delivery_stops",
    "sum"(COALESCE((("r"."normalized_row_json" ->> 'actual_delivery_packages'::"text"))::numeric, (0)::numeric)) AS "delivery_packages",
    "sum"(COALESCE((("r"."normalized_row_json" ->> 'actual_pickup_stops'::"text"))::numeric, (0)::numeric)) AS "pickup_stops",
    "sum"(COALESCE((("r"."normalized_row_json" ->> 'actual_pickup_packages'::"text"))::numeric, (0)::numeric)) AS "pickup_packages"
   FROM ("core"."operations_report_batch" "b"
     JOIN "core"."operations_report_raw_row" "r" ON (("r"."batch_id" = "b"."id")))
  WHERE (("b"."report_family_key" = 'DSW'::"text") AND ("b"."report_shape_key" = 'DSW_FINALIZED_DAY'::"text"))
  GROUP BY "b"."company_id", "b"."service_date";


ALTER VIEW "core"."operations_dsw_daily_fact_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_legacy_dsw_import_stage" (
    "import_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "UniqueKey" "text",
    "StationCode" "text",
    "Batch Date" "text",
    "Batch Time" "text",
    "Data Date" "text",
    "Svc Area #" "text",
    "WA Name" "text",
    "Veh #" "text",
    "Driver Name" "text",
    "WA#" "text",
    "VScan Pkgs" "text",
    "Del Stps" "text",
    "PU Stps" "text",
    "DIFF" "text",
    "Act Del Stps" "text",
    "Act Del Pkgs" "text",
    "Act PU Stps" "text",
    "Act PU Pkgs" "text",
    "ILS%" "text",
    "ILS Impact Pkgs" "text",
    "Non Delvd Stps" "text",
    "Code 85" "text",
    "All Status Code Pkgs" "text",
    "P'L M'L" "text",
    "DNA" "text",
    "Snd Agn" "text",
    "Exc's" "text",
    "VSA vs STAR (DIFF)" "text",
    "% Returns Scans" "text",
    "Miles" "text",
    "On Road Hours" "text",
    "On Duty Hours" "text",
    "Pot. DOT Hrs Viols" "text",
    "Next Avail On Duty" "text",
    "Pot. Miss PUs" "text",
    "E/L PUs" "text",
    "Req. Sig." "text",
    "Date Certain" "text",
    "Evening" "text",
    "Appt" "text"
);


ALTER TABLE "core"."operations_legacy_dsw_import_stage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_mileage_audit_review" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "raw_row_id" "uuid" NOT NULL,
    "review_action" "text" NOT NULL,
    "review_reason" "text",
    "suggested_miles" numeric,
    "reviewed_by_profile_id" "uuid",
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_miles" numeric,
    "computed_suggested_miles" numeric,
    CONSTRAINT "operations_mileage_audit_review_review_action_check" CHECK (("review_action" = ANY (ARRAY['APPLY'::"text", 'IGNORE'::"text"])))
);


ALTER TABLE "core"."operations_mileage_audit_review" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_mileage_correction_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "raw_row_id" "uuid" NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "service_date" "date" NOT NULL,
    "route_baseline_id" "uuid",
    "route_name" "text",
    "wa_number" "text",
    "driver_name" "text",
    "original_miles_text" "text",
    "original_miles" numeric,
    "corrected_miles" numeric NOT NULL,
    "correction_reason" "text" NOT NULL,
    "correction_method" "text" DEFAULT 'ROUTE_MEDIAN'::"text" NOT NULL,
    "original_normalized_row_json" "jsonb" NOT NULL,
    "corrected_normalized_row_json" "jsonb" NOT NULL,
    "corrected_by_profile_id" "uuid",
    "corrected_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."operations_mileage_correction_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "core"."operations_planning_trend_v" AS
 SELECT "company_id",
    "service_date",
    "routes",
    "delivery_stops",
    "delivery_packages",
    "pickup_stops",
    "pickup_packages",
    (EXTRACT(isodow FROM "service_date"))::integer AS "iso_weekday",
    ("date_trunc"('week'::"text", ("service_date")::timestamp with time zone))::"date" AS "week_start",
    "to_char"(("service_date")::timestamp with time zone, 'Dy'::"text") AS "day_label",
    (("to_char"(("service_date")::timestamp with time zone, 'Dy'::"text") || ' '::"text") || "to_char"(("service_date")::timestamp with time zone, 'MM/DD'::"text")) AS "service_date_label",
    ("service_date" - (((EXTRACT(dow FROM "service_date"))::integer + 1) % 7)) AS "fedex_week_start",
    (("service_date" - (((EXTRACT(dow FROM "service_date"))::integer + 1) % 7)) + 6) AS "fedex_week_end"
   FROM "core"."operations_dsw_daily_fact_v";


ALTER VIEW "core"."operations_planning_trend_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_report_family" (
    "report_family_key" "text" NOT NULL,
    "report_family_label" "text" NOT NULL,
    "source_system" "text" DEFAULT 'FEDEX'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."operations_report_family" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_report_shape" (
    "report_shape_key" "text" NOT NULL,
    "report_family_key" "text" NOT NULL,
    "report_shape_label" "text" NOT NULL,
    "required_headers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "optional_headers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."operations_report_shape" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."operations_report_summary_row" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "report_family_key" "text",
    "service_date" "date",
    "summary_scope" "text" NOT NULL,
    "summary_label" "text" NOT NULL,
    "contract_code" "text",
    "terminal_code" "text",
    "source_row_index" integer NOT NULL,
    "raw_row_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "normalized_row_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operations_report_summary_row_summary_scope_check" CHECK (("summary_scope" = ANY (ARRAY['CONTRACT'::"text", 'COLOCATION'::"text", 'UNKNOWN'::"text"])))
);


ALTER TABLE "core"."operations_report_summary_row" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."payroll_activity_fact" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "service_date" "date" NOT NULL,
    "week_end_date" "date" NOT NULL,
    "roster_member_id" "uuid",
    "person_name" "text",
    "activity_role" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "attendance_status" "text" DEFAULT 'present'::"text" NOT NULL,
    "route_baseline_id" "uuid",
    "route_name" "text",
    "wa_number" "text",
    "vehicle_text" "text",
    "actual_delivery_stops" numeric,
    "actual_delivery_packages" numeric,
    "actual_pickup_stops" numeric,
    "actual_pickup_packages" numeric,
    "threshold_stops" numeric,
    "threshold_rate" numeric,
    "threshold_overage" numeric,
    "daily_pay_rate" numeric,
    "daily_pay_eligible" boolean DEFAULT false NOT NULL,
    "source_kind" "text" NOT NULL,
    "source_ref_id" "uuid",
    "review_flags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "metadata_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "daily_pay_effective_date" "date",
    "threshold_pay_amount" numeric
);


ALTER TABLE "core"."payroll_activity_fact" OWNER TO "postgres";


CREATE OR REPLACE VIEW "core"."payroll_identity_resolved" AS
 SELECT "r"."id" AS "roster_member_id",
    "r"."company_id",
    "ops"."dswid",
    "ops"."fx_id",
    "ops"."dsw_driver_name",
    "r"."full_name" AS "roster_name"
   FROM ("core"."company_roster" "r"
     LEFT JOIN "core"."company_roster_operations_fact" "ops" ON (("ops"."roster_id" = "r"."id")));


ALTER VIEW "core"."payroll_identity_resolved" OWNER TO "postgres";


CREATE OR REPLACE VIEW "core"."payroll_activity_fact_v" AS
 SELECT "p"."id",
    "p"."company_id",
    "p"."service_date",
    "p"."week_end_date",
    "p"."roster_member_id",
    "p"."person_name",
    "p"."activity_role",
    "p"."attendance_status",
    "p"."route_baseline_id",
    "p"."route_name",
    "p"."wa_number",
    "p"."vehicle_text",
    "p"."actual_delivery_stops",
    "p"."actual_delivery_packages",
    "p"."actual_pickup_stops",
    "p"."actual_pickup_packages",
    "p"."threshold_stops",
    "p"."threshold_rate",
    "p"."threshold_overage",
    "p"."daily_pay_rate",
    "p"."daily_pay_eligible",
    "p"."source_kind",
    "p"."source_ref_id",
    "p"."review_flags",
    "p"."metadata_json",
    "p"."created_at",
    "p"."updated_at",
    "p"."daily_pay_effective_date",
    "p"."threshold_pay_amount",
    "idr"."dswid",
    "idr"."fx_id",
    "idr"."dsw_driver_name"
   FROM ("core"."payroll_activity_fact" "p"
     LEFT JOIN "core"."payroll_identity_resolved" "idr" ON (("idr"."roster_member_id" = "p"."roster_member_id")));


ALTER VIEW "core"."payroll_activity_fact_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "core"."payroll_activity_identity_debug_v" AS
 SELECT "paf"."id",
    "paf"."company_id",
    "paf"."service_date",
    "paf"."person_name",
    "paf"."roster_member_id",
    "cr"."full_name" AS "roster_full_name",
    ("paf"."metadata_json" ->> 'raw_driver_name'::"text") AS "raw_driver_name",
        CASE
            WHEN ("paf"."roster_member_id" IS NOT NULL) THEN 'MATCHED'::"text"
            WHEN ("cr"."id" IS NOT NULL) THEN 'MATCHED_VIA_JOIN'::"text"
            ELSE 'UNMATCHED'::"text"
        END AS "identity_state"
   FROM ("core"."payroll_activity_fact" "paf"
     LEFT JOIN "core"."company_roster" "cr" ON (("cr"."id" = "paf"."roster_member_id")));


ALTER VIEW "core"."payroll_activity_identity_debug_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."payroll_adjustment_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "adjustment_key" "text" NOT NULL,
    "adjustment_label" "text" NOT NULL,
    "adjustment_scope" "text" DEFAULT 'TARGETED'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "amount_mode" "text" DEFAULT 'FLAT'::"text" NOT NULL,
    "applies_to_daily_pay" boolean DEFAULT true NOT NULL,
    "applies_to_threshold_pay" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payroll_adjustment_amount_mode_ck" CHECK (("amount_mode" = ANY (ARRAY['FLAT'::"text", 'DAILY'::"text"]))),
    CONSTRAINT "payroll_adjustment_scope_ck" CHECK (("adjustment_scope" = ANY (ARRAY['GLOBAL'::"text", 'TARGETED'::"text"])))
);


ALTER TABLE "core"."payroll_adjustment_event" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."payroll_adjustment_target" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "adjustment_event_id" "uuid" NOT NULL,
    "roster_member_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."payroll_adjustment_target" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."profile_document" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "document_type_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "content_type" "text",
    "file_size" bigint,
    "issue_date" "date",
    "expiration_date" "date",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "uploaded_by_profile_id" "uuid",
    "verified_at" timestamp with time zone,
    "verified_by_profile_id" "uuid",
    "is_archived" boolean DEFAULT false NOT NULL
);


ALTER TABLE "core"."profile_document" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."profile_driver_license" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "license_number" "text" NOT NULL,
    "issuing_state" "text" NOT NULL,
    "issue_date" "date",
    "expiration_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."profile_driver_license" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."profile_private_fact" (
    "profile_id" "uuid" NOT NULL,
    "date_of_birth" "date",
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "state_region" "text",
    "postal_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."profile_private_fact" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid",
    "email" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "display_name" "text",
    "mobile_phone" "text",
    "profile_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_active_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_platform_owner" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_archived_requires_status_ck" CHECK ((("archived_at" IS NULL) OR ("profile_status" = 'archived'::"text"))),
    CONSTRAINT "profiles_email_ck" CHECK (("length"("btrim"("email")) > 0)),
    CONSTRAINT "profiles_first_name_ck" CHECK (("length"("btrim"("first_name")) > 0)),
    CONSTRAINT "profiles_last_name_ck" CHECK (("length"("btrim"("last_name")) > 0)),
    CONSTRAINT "profiles_profile_status_ck" CHECK (("profile_status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'archived'::"text"])))
);


ALTER TABLE "core"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."roster_candidate_checklist_fact" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_id" "uuid" NOT NULL,
    "item_type_id" "uuid" NOT NULL,
    "is_complete" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_by_profile_id" "uuid",
    "note" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."roster_candidate_checklist_fact" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."roster_candidate_stage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_id" "uuid" NOT NULL,
    "stage_type_id" "uuid" NOT NULL,
    "note" "text",
    "updated_by_profile_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."roster_candidate_stage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."roster_compliance_requirement" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "document_type_id" "uuid" NOT NULL,
    "required" boolean DEFAULT true NOT NULL,
    "expiration_required" boolean DEFAULT false NOT NULL,
    "days_before_warning" integer DEFAULT 30 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."roster_compliance_requirement" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."roster_compliance_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_id" "uuid" NOT NULL,
    "document_type_id" "uuid" NOT NULL,
    "document_id" "uuid",
    "status" "text" DEFAULT 'MISSING'::"text" NOT NULL,
    "expires_on" "date",
    "verified_by_profile_id" "uuid",
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "core"."roster_compliance_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "core"."walk_on_driver" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "normalized_name" "text" NOT NULL,
    "first_seen_date" "date" NOT NULL,
    "last_seen_date" "date" NOT NULL,
    "dispatch_count" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "candidate_roster_id" "uuid",
    "created_by_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "walk_on_driver_name_ck" CHECK (("length"("btrim"("full_name")) > 0)),
    CONSTRAINT "walk_on_driver_status_ck" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'RECONCILED'::"text", 'ARCHIVED'::"text"])))
);


ALTER TABLE "core"."walk_on_driver" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "legal"."document" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "version_major" integer DEFAULT 0 NOT NULL,
    "version_minor" integer DEFAULT 1 NOT NULL,
    "version_patch" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "effective_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_version" "text" DEFAULT '0.1.0'::"text",
    "last_reviewed_at" timestamp with time zone,
    "owner_name" "text"
);


ALTER TABLE "legal"."document" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "legal"."document_acceptance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "revision_id" "uuid",
    "company_id" "uuid",
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acceptance_method" "text" DEFAULT 'CLICK'::"text",
    "ip_address" "inet",
    "user_agent" "text"
);


ALTER TABLE "legal"."document_acceptance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "legal"."document_section" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "section_number" integer NOT NULL,
    "section_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "body_markdown" "text" DEFAULT ''::"text" NOT NULL,
    "section_version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workflow_status" "text" DEFAULT 'DRAFT'::"text",
    "published_revision_id" "uuid",
    "current_revision_id" "uuid"
);


ALTER TABLE "legal"."document_section" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "legal"."document_section_note" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_id" "uuid" NOT NULL,
    "note_type" "text" DEFAULT 'EDITORIAL'::"text" NOT NULL,
    "note_body" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone,
    "is_resolved" boolean DEFAULT false NOT NULL
);


ALTER TABLE "legal"."document_section_note" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "legal"."document_section_revision" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_id" "uuid" NOT NULL,
    "section_version" integer NOT NULL,
    "body_markdown" "text" NOT NULL,
    "change_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revision_number" integer DEFAULT 1,
    "created_by" "uuid",
    "published_at" timestamp with time zone,
    "is_published" boolean DEFAULT false
);


ALTER TABLE "legal"."document_section_revision" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."companies" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_name",
    "company_slug",
    "company_status",
    "primary_industry_id",
    "contact_email",
    "contact_phone",
    "website_url",
    "logo_url",
    "company_size_band",
    "archived_at",
    "created_at",
    "updated_at"
   FROM "core"."companies";


ALTER VIEW "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ref"."industries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "industry_key" "text" NOT NULL,
    "industry_label" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "industries_industry_label_ck" CHECK (("length"("btrim"("industry_label")) > 0))
);


ALTER TABLE "ref"."industries" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."companies_with_industry" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."company_name",
    "c"."company_slug",
    "c"."company_status",
    "c"."primary_industry_id",
    "c"."contact_email",
    "c"."contact_phone",
    "c"."website_url",
    "c"."logo_url",
    "c"."company_size_band",
    "c"."archived_at",
    "c"."created_at",
    "c"."updated_at",
    "i"."industry_label"
   FROM ("core"."companies" "c"
     LEFT JOIN "ref"."industries" "i" ON (("i"."id" = "c"."primary_industry_id")));


ALTER VIEW "public"."companies_with_industry" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_asset_providers_v" WITH ("security_invoker"='true') AS
 SELECT "ap"."id" AS "asset_provider_id",
    "ap"."company_id",
    "c"."company_slug",
    "at"."asset_type_key",
    "at"."asset_type_label",
    "ap"."provider_key",
    "ap"."provider_label",
    "ap"."is_active",
    "ap"."sort_order",
    "ap"."created_at",
    "ap"."updated_at"
   FROM (("core"."asset_provider" "ap"
     JOIN "core"."companies" "c" ON (("c"."id" = "ap"."company_id")))
     JOIN "core"."asset_type" "at" ON (("at"."id" = "ap"."asset_type_id")));


ALTER VIEW "public"."company_asset_providers_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_asset_status_v" WITH ("security_invoker"='true') AS
 SELECT "id" AS "asset_status_id",
    "status_key",
    "status_label",
    "status_group",
    "is_assignable",
    "is_active",
    "sort_order"
   FROM "core"."asset_status"
  WHERE ("is_active" = true);


ALTER VIEW "public"."company_asset_status_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_roster_view" WITH ("security_invoker"='true') AS
 SELECT "rv"."roster_member_id",
    "rv"."company_id",
    "rv"."profile_id",
    "rv"."full_name",
    "rv"."email",
    "rv"."phone",
    "rv"."worker_type",
    "rv"."job_title",
    "rv"."employment_status",
    "rv"."market_code",
    "rv"."reports_to_name",
    "rv"."hire_date",
    "rv"."invite_status",
    "rv"."compliance_summary",
    "rv"."fx_id",
    "rv"."dswid",
    "pf"."date_of_birth",
    "pf"."address_line_1",
    "pf"."address_line_2",
    "pf"."city",
    "pf"."state_region",
    "pf"."postal_code",
    "dl"."license_number",
    "dl"."issuing_state",
    "dl"."issue_date" AS "license_issue_date",
    "dl"."expiration_date" AS "license_expiration_date",
    "rv"."person_id",
    "rv"."reports_to_roster_id",
    "rv"."separation_date",
    "rv"."onboarding_completed_at",
    "rv"."created_at",
    "rv"."notes"
   FROM (("core"."company_roster_view" "rv"
     LEFT JOIN "core"."profile_private_fact" "pf" ON (("pf"."profile_id" = "rv"."profile_id")))
     LEFT JOIN LATERAL ( SELECT "l"."license_number",
            "l"."issuing_state",
            "l"."issue_date",
            "l"."expiration_date"
           FROM "core"."profile_driver_license" "l"
          WHERE ("l"."profile_id" = "rv"."profile_id")
          ORDER BY "l"."created_at" DESC
         LIMIT 1) "dl" ON (true));


ALTER VIEW "public"."company_roster_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "date_of_birth" "date",
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."person" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_assets_v" WITH ("security_invoker"='true') AS
 SELECT "a"."id" AS "asset_id",
    "a"."company_id",
    "c"."company_slug",
    "c"."company_name",
    "at"."asset_type_key",
    "at"."asset_type_label",
    "s"."status_key",
    "s"."status_label",
    "s"."status_group",
    "s"."sort_order" AS "status_sort_order",
    "s"."is_assignable",
    "a"."asset_identifier",
    "a"."display_name",
    "a"."asset_provider_id",
    COALESCE("ap"."provider_label", "a"."provider") AS "provider",
    "a"."secondary_identifier",
    "a"."notes",
    "a"."assignment_muted",
    "a"."assigned_person_id",
    "p"."full_name" AS "assigned_person_name",
    "a"."assigned_roster_member_id",
    "r"."full_name" AS "assigned_roster_member_name",
    "a"."assigned_at",
    "a"."released_at",
    "a"."created_at",
    "a"."updated_at"
   FROM (((((("core"."asset" "a"
     JOIN "core"."companies" "c" ON (("c"."id" = "a"."company_id")))
     JOIN "core"."asset_type" "at" ON (("at"."id" = "a"."asset_type_id")))
     JOIN "core"."asset_status" "s" ON (("s"."id" = "a"."asset_status_id")))
     LEFT JOIN "core"."asset_provider" "ap" ON (("ap"."id" = "a"."asset_provider_id")))
     LEFT JOIN "public"."person" "p" ON (("p"."id" = "a"."assigned_person_id")))
     LEFT JOIN "public"."company_roster_view" "r" ON ((("r"."roster_member_id" = "a"."assigned_roster_member_id") AND ("r"."company_id" = "a"."company_id"))));


ALTER VIEW "public"."company_assets_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_candidate_checklist_config_v" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."company_id",
    "c"."item_type_id",
    "c"."display_label",
    "c"."is_required",
    "c"."is_enabled",
    "c"."sort_order",
    "c"."created_at",
    "c"."updated_at",
    "i"."item_key",
    "i"."default_label",
    "i"."description",
    "i"."default_required",
    "i"."is_active" AS "item_is_active"
   FROM ("core"."company_candidate_checklist_config" "c"
     JOIN "core"."candidate_checklist_item_type" "i" ON (("i"."id" = "c"."item_type_id")));


ALTER VIEW "public"."company_candidate_checklist_config_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_candidate_checklist_readiness_v" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."company_id",
    "c"."item_type_id",
    "c"."display_label",
    "c"."is_required",
    "c"."is_enabled",
    "c"."sort_order",
    "c"."readiness_weight",
    "c"."created_at",
    "c"."updated_at",
    "t"."item_key",
    "t"."default_label",
    "t"."description",
    "t"."default_required",
    "t"."is_active" AS "item_is_active"
   FROM ("core"."company_candidate_checklist_config" "c"
     JOIN "core"."candidate_checklist_item_type" "t" ON (("t"."id" = "c"."item_type_id")));


ALTER VIEW "public"."company_candidate_checklist_readiness_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_candidate_stage_config_v" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."company_id",
    "c"."stage_type_id",
    "c"."display_label",
    "c"."is_enabled",
    "c"."sort_order",
    "s"."stage_key",
    "s"."default_label",
    "s"."description",
    "s"."is_terminal",
    "s"."is_active",
    "s"."sort_order" AS "stage_sort_order"
   FROM ("core"."company_candidate_stage_config" "c"
     JOIN "core"."candidate_stage_type" "s" ON (("s"."id" = "c"."stage_type_id")));


ALTER VIEW "public"."company_candidate_stage_config_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_contract_config" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "contract_number",
    "terminal_identity",
    "service_area",
    "effective_start_date",
    "effective_end_date",
    "status",
    "created_at",
    "updated_at"
   FROM "core"."company_contract_config";


ALTER VIEW "public"."company_contract_config" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_industries" WITH ("security_invoker"='true') AS
 SELECT "id",
    "industry_label"
   FROM "ref"."industries"
  ORDER BY "industry_label";


ALTER VIEW "public"."company_industries" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_memberships" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "profile_id",
    "membership_status",
    "relationship_type",
    "title",
    "invited_at",
    "accepted_at",
    "started_at",
    "ended_at",
    "default_company_home",
    "notes",
    "created_at",
    "updated_at"
   FROM "core"."company_memberships";


ALTER VIEW "public"."company_memberships" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_payroll_adjustment_event_v" WITH ("security_invoker"='true') AS
 SELECT "e"."id" AS "adjustment_event_id",
    "e"."company_id",
    "c"."company_slug",
    "e"."adjustment_key",
    "e"."adjustment_label",
    "e"."adjustment_scope",
    "e"."start_date",
    "e"."end_date",
    "e"."amount",
    "e"."amount_mode",
    "e"."applies_to_daily_pay",
    "e"."applies_to_threshold_pay",
    "e"."notes",
    "e"."is_active",
    "e"."created_at",
    "e"."updated_at",
    ("count"("t"."id"))::integer AS "target_count"
   FROM (("core"."payroll_adjustment_event" "e"
     JOIN "core"."companies" "c" ON (("c"."id" = "e"."company_id")))
     LEFT JOIN "core"."payroll_adjustment_target" "t" ON (("t"."adjustment_event_id" = "e"."id")))
  GROUP BY "e"."id", "e"."company_id", "c"."company_slug", "e"."adjustment_key", "e"."adjustment_label", "e"."adjustment_scope", "e"."start_date", "e"."end_date", "e"."amount", "e"."amount_mode", "e"."applies_to_daily_pay", "e"."applies_to_threshold_pay", "e"."notes", "e"."is_active", "e"."created_at", "e"."updated_at";


ALTER VIEW "public"."company_payroll_adjustment_event_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_payroll_adjustment_target_v" WITH ("security_invoker"='true') AS
 SELECT "t"."id" AS "adjustment_target_id",
    "t"."adjustment_event_id",
    "e"."company_id",
    "c"."company_slug",
    "t"."roster_member_id",
    "r"."full_name",
    "r"."employment_status",
    "r"."worker_type",
    "t"."created_at"
   FROM ((("core"."payroll_adjustment_target" "t"
     JOIN "core"."payroll_adjustment_event" "e" ON (("e"."id" = "t"."adjustment_event_id")))
     JOIN "core"."companies" "c" ON (("c"."id" = "e"."company_id")))
     LEFT JOIN "public"."company_roster_view" "r" ON ((("r"."company_id" = "e"."company_id") AND ("r"."roster_member_id" = "t"."roster_member_id"))));


ALTER VIEW "public"."company_payroll_adjustment_target_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_roster_event_view" WITH ("security_invoker"='true') AS
 SELECT "e"."id",
    "e"."company_id",
    "e"."roster_id",
    "e"."event_category",
    "e"."event_type",
    "e"."event_detail",
    "e"."event_metadata",
    "e"."occurred_at",
    "e"."created_by_profile_id",
    "e"."created_at",
    "r"."full_name",
    "r"."worker_type",
    "r"."job_title",
    "r"."employment_status",
    "r"."market_code"
   FROM ("core"."company_roster_event" "e"
     JOIN "core"."company_roster" "r" ON (("r"."id" = "e"."roster_id")));


ALTER VIEW "public"."company_roster_event_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_roster_operations_fact_v" WITH ("security_invoker"='true') AS
 SELECT "roster_id",
    "scanner_serial",
    "dot_exp",
    "qual_cert_exp",
    "daily_pay_effective_date",
    "fuel_card",
    "pin_id_no",
    "updated_at",
    "daily_pay_rate",
    "fx_id",
    "dswid",
    "dsw_driver_name"
   FROM "core"."company_roster_operations_fact";


ALTER VIEW "public"."company_roster_operations_fact_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_roster_trainee_pay_override_v" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "roster_id",
    "trainee_daily_pay_rate",
    "effective_start",
    "effective_end",
    "is_active",
    "created_at",
    "updated_at"
   FROM "core"."company_roster_trainee_pay_override";


ALTER VIEW "public"."company_roster_trainee_pay_override_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_terminal" (
    "terminal_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "terminal_code" "text" NOT NULL,
    "terminal_name" "text" NOT NULL,
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "state_region" "text",
    "postal_code" "text"
);


ALTER TABLE "public"."company_terminal" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."driver_activity_event_type_v" WITH ("security_invoker"='true') AS
 SELECT "event_type",
    "event_family",
    "event_owner",
    "description",
    "is_driver_action",
    "is_system_action",
    "is_active",
    "created_at"
   FROM "core"."driver_activity_event_type";


ALTER VIEW "public"."driver_activity_event_type_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."driver_activity_event_v" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "profile_id",
    "person_id",
    "roster_member_id",
    "service_date",
    "event_type",
    "occurred_at",
    "device_occurred_at",
    "source",
    "event_payload",
    "created_at"
   FROM "core"."driver_activity_event";


ALTER VIEW "public"."driver_activity_event_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."driver_activity_signal_v" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "profile_id",
    "person_id",
    "roster_member_id",
    "service_date",
    "signal_type",
    "occurred_at",
    "confidence",
    "source",
    "source_activity_event_id",
    "source_breadcrumb_id",
    "signal_payload",
    "created_at"
   FROM "core"."driver_activity_signal";


ALTER VIEW "public"."driver_activity_signal_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."driver_breadcrumb_point_v" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "profile_id",
    "person_id",
    "roster_member_id",
    "service_date",
    "captured_at",
    "device_captured_at",
    "latitude",
    "longitude",
    "accuracy_meters",
    "source",
    "tracking_context",
    "source_activity_event_id",
    "breadcrumb_payload",
    "created_at"
   FROM "core"."driver_breadcrumb_point";


ALTER VIEW "public"."driver_breadcrumb_point_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."driver_time_off_request" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_member_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "requested_by_auth_user_id" "uuid",
    "requested_dates" "date"[] NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "day_count" integer NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "request_note" "text",
    "reviewed_by_auth_user_id" "uuid",
    "reviewed_at" timestamp with time zone,
    "manager_note" "text",
    "schedule_override_id" "uuid",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "driver_time_off_request_day_count_chk" CHECK ((("day_count" >= 1) AND ("day_count" <= 15))),
    CONSTRAINT "driver_time_off_request_status_chk" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'DENIED'::"text", 'WITHDRAWN'::"text"])))
);


ALTER TABLE "public"."driver_time_off_request" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hiring_invite_token" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pc_org_id" "uuid" NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_by" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "roster_id" "uuid",
    "company_id" "uuid"
);


ALTER TABLE "public"."hiring_invite_token" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."legal_document_section_v" WITH ("security_invoker"='true') AS
 SELECT "id",
    "document_id",
    "section_number",
    "section_key",
    "title",
    "summary",
    "body_markdown",
    "section_version",
    "status",
    "created_at",
    "updated_at",
    "workflow_status",
    "published_revision_id",
    "current_revision_id"
   FROM "legal"."document_section";


ALTER VIEW "public"."legal_document_section_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."legal_document_v" WITH ("security_invoker"='true') AS
 SELECT "id",
    "document_key",
    "title",
    "version_major",
    "version_minor",
    "version_patch",
    "status",
    "updated_at"
   FROM "legal"."document";


ALTER VIEW "public"."legal_document_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_session" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "pc_org_id" "uuid" NOT NULL,
    "invite_token" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "roster_id" "uuid",
    "company_id" "uuid"
);


ALTER TABLE "public"."onboarding_session" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_step" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "step_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "step_order" integer NOT NULL
);


ALTER TABLE "public"."onboarding_step" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_step_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "step_key" "text" NOT NULL,
    "completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."onboarding_step_progress" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."operations_automation_run_v" WITH ("security_invoker"='true') AS
 SELECT "r"."id",
    "r"."company_id",
    "c"."company_slug",
    "r"."automation_type",
    "r"."started_at",
    "r"."completed_at",
    "r"."duration_ms",
    "r"."download_ms",
    "r"."ingest_ms",
    "r"."status",
    "r"."source_filename",
    "r"."batch_id",
    "r"."inserted_rows",
    "r"."route_count",
    "r"."summary_rows",
    "r"."matched_rows",
    "r"."unmatched_rows",
    "r"."error_message",
    "r"."created_at"
   FROM ("core"."operations_automation_run" "r"
     JOIN "core"."companies" "c" ON (("c"."id" = "r"."company_id")));


ALTER VIEW "public"."operations_automation_run_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."payroll_activity_fact_v" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "service_date",
    "week_end_date",
    "roster_member_id",
    "person_name",
    "activity_role",
    "attendance_status",
    "route_baseline_id",
    "route_name",
    "wa_number",
    "vehicle_text",
    "actual_delivery_stops",
    "actual_delivery_packages",
    "actual_pickup_stops",
    "actual_pickup_packages",
    "threshold_stops",
    "threshold_rate",
    "threshold_overage",
    "daily_pay_rate",
    "daily_pay_eligible",
    "source_kind",
    "source_ref_id",
    "review_flags",
    "metadata_json",
    "created_at",
    "updated_at",
    "daily_pay_effective_date",
    "threshold_pay_amount"
   FROM "core"."payroll_activity_fact";


ALTER VIEW "public"."payroll_activity_fact_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."roster_candidate_checklist_fact_v" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "roster_id",
    "item_type_id",
    "is_complete",
    "completed_at",
    "completed_by_profile_id",
    "note",
    "updated_at",
    "created_at"
   FROM "core"."roster_candidate_checklist_fact";


ALTER VIEW "public"."roster_candidate_checklist_fact_v" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."roster_candidate_stage_v" WITH ("security_invoker"='true') AS
 SELECT "f"."id",
    "f"."company_id",
    "f"."roster_id",
    "f"."stage_type_id",
    "f"."note",
    "f"."updated_at",
    "f"."created_at",
    "s"."stage_key",
    "s"."default_label",
    "s"."is_terminal",
    "s"."sort_order" AS "stage_sort_order"
   FROM ("core"."roster_candidate_stage" "f"
     JOIN "core"."candidate_stage_type" "s" ON (("s"."id" = "f"."stage_type_id")));


ALTER VIEW "public"."roster_candidate_stage_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."route_baseline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "route_name" "text" NOT NULL,
    "current_wa_num" "text",
    "route_location" "text",
    "route_type" "text" DEFAULT 'CORE'::"text" NOT NULL,
    "threshold_stops" integer,
    "threshold_rate" numeric(10,2),
    "runs_s" boolean DEFAULT false NOT NULL,
    "runs_u" boolean DEFAULT false NOT NULL,
    "runs_m" boolean DEFAULT false NOT NULL,
    "runs_t" boolean DEFAULT false NOT NULL,
    "runs_w" boolean DEFAULT false NOT NULL,
    "runs_h" boolean DEFAULT false NOT NULL,
    "runs_f" boolean DEFAULT false NOT NULL,
    "rotation_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "effective_start" "date" NOT NULL,
    "effective_end" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "terminal_id" "uuid"
);


ALTER TABLE "public"."route_baseline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_baseline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "roster_member_id" "uuid" NOT NULL,
    "preset_id" "uuid" NOT NULL,
    "rotation_mode" "text" DEFAULT 'NONE'::"text" NOT NULL,
    "anchor_date" "date" NOT NULL,
    "default_route_s" "text",
    "default_route_u" "text",
    "default_route_m" "text",
    "default_route_t" "text",
    "default_route_w" "text",
    "default_route_h" "text",
    "default_route_f" "text",
    "effective_start" "date" NOT NULL,
    "effective_end" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rotation_works_s" boolean DEFAULT false NOT NULL,
    "rotation_works_u" boolean DEFAULT false NOT NULL,
    "rotation_works_m" boolean DEFAULT false NOT NULL,
    "rotation_works_t" boolean DEFAULT false NOT NULL,
    "rotation_works_w" boolean DEFAULT false NOT NULL,
    "rotation_works_h" boolean DEFAULT false NOT NULL,
    "rotation_works_f" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."schedule_baseline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_day_fact" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "terminal_id" "uuid" NOT NULL,
    "service_date" "date" NOT NULL,
    "roster_member_id" "uuid" NOT NULL,
    "planned_on" boolean NOT NULL,
    "route_name" "text",
    "source_kind" "text" NOT NULL,
    "preset_id" "uuid",
    "rotation_mode" "text",
    "anchor_date" "date",
    "baseline_id" "uuid",
    "override_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schedule_day_fact" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_override" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "terminal_id" "uuid" NOT NULL,
    "roster_member_id" "uuid" NOT NULL,
    "override_type" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "route_name_override" "text",
    "source_request_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "manager_note" "text"
);


ALTER TABLE "public"."schedule_override" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_preset" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "preset_code" "text" NOT NULL,
    "works_s" boolean DEFAULT false NOT NULL,
    "works_u" boolean DEFAULT false NOT NULL,
    "works_m" boolean DEFAULT false NOT NULL,
    "works_t" boolean DEFAULT false NOT NULL,
    "works_w" boolean DEFAULT false NOT NULL,
    "works_h" boolean DEFAULT false NOT NULL,
    "works_f" boolean DEFAULT false NOT NULL,
    "uses_rotation" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schedule_preset" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."schedule_day_fact_view" WITH ("security_invoker"='true') AS
 SELECT "sdf"."id",
    "sdf"."company_id",
    "sdf"."terminal_id",
    "sdf"."service_date",
    "sdf"."roster_member_id",
    "crv"."full_name",
    "crv"."worker_type",
    "crv"."employment_status",
    "crv"."market_code",
    "crv"."reports_to_name",
    "sdf"."planned_on",
    "sdf"."route_name",
    "sdf"."source_kind",
    "sdf"."preset_id",
    "sp"."preset_code",
    "sdf"."rotation_mode",
    "sdf"."anchor_date",
    "sdf"."baseline_id",
    "sdf"."override_id",
    "so"."override_type",
    "so"."start_date" AS "override_start_date",
    "so"."end_date" AS "override_end_date",
    "so"."route_name_override",
    "sdf"."created_at"
   FROM ((("public"."schedule_day_fact" "sdf"
     LEFT JOIN "public"."company_roster_view" "crv" ON (("crv"."roster_member_id" = "sdf"."roster_member_id")))
     LEFT JOIN "public"."schedule_preset" "sp" ON (("sp"."id" = "sdf"."preset_id")))
     LEFT JOIN "public"."schedule_override" "so" ON (("so"."id" = "sdf"."override_id")));


ALTER VIEW "public"."schedule_day_fact_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_request" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "terminal_id" "uuid" NOT NULL,
    "roster_member_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "note" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid"
);


ALTER TABLE "public"."schedule_request" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_request_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "actor_person_id" "uuid" NOT NULL,
    "activity_type" "text" NOT NULL,
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schedule_request_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_request_cover_offer" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "cover_roster_member_id" "uuid" NOT NULL,
    "offer_status" "text" DEFAULT 'OFFERED'::"text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schedule_request_cover_offer" OWNER TO "postgres";


ALTER TABLE ONLY "billing"."customer"
    ADD CONSTRAINT "billing_customer_company_provider_uniq" UNIQUE ("company_id", "provider");



ALTER TABLE ONLY "billing"."customer"
    ADD CONSTRAINT "customer_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."payment"
    ADD CONSTRAINT "payment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."subscription"
    ADD CONSTRAINT "subscription_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "commercial"."profile"
    ADD CONSTRAINT "commercial_profile_company_uniq" UNIQUE ("company_id");



ALTER TABLE ONLY "commercial"."operator_tier"
    ADD CONSTRAINT "operator_tier_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "commercial"."operator_tier"
    ADD CONSTRAINT "operator_tier_tier_key_key" UNIQUE ("tier_key");



ALTER TABLE ONLY "commercial"."profile"
    ADD CONSTRAINT "profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."asset_assignment"
    ADD CONSTRAINT "asset_assignment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."asset_audit"
    ADD CONSTRAINT "asset_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."asset"
    ADD CONSTRAINT "asset_company_identifier_uk" UNIQUE ("company_id", "asset_identifier");



ALTER TABLE ONLY "core"."asset_event"
    ADD CONSTRAINT "asset_event_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."asset"
    ADD CONSTRAINT "asset_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."asset_provider"
    ADD CONSTRAINT "asset_provider_company_type_key_uk" UNIQUE ("company_id", "asset_type_id", "provider_key");



ALTER TABLE ONLY "core"."asset_provider"
    ADD CONSTRAINT "asset_provider_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."asset_status"
    ADD CONSTRAINT "asset_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."asset_status"
    ADD CONSTRAINT "asset_status_status_key_key" UNIQUE ("status_key");



ALTER TABLE ONLY "core"."asset_type"
    ADD CONSTRAINT "asset_type_asset_type_key_key" UNIQUE ("asset_type_key");



ALTER TABLE ONLY "core"."asset_type"
    ADD CONSTRAINT "asset_type_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."automation_credential"
    ADD CONSTRAINT "automation_credential_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."automation_profile"
    ADD CONSTRAINT "automation_profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."candidate_checklist_item_type"
    ADD CONSTRAINT "candidate_checklist_item_type_item_key_key" UNIQUE ("item_key");



ALTER TABLE ONLY "core"."candidate_checklist_item_type"
    ADD CONSTRAINT "candidate_checklist_item_type_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."candidate_stage_type"
    ADD CONSTRAINT "candidate_stage_type_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."candidate_stage_type"
    ADD CONSTRAINT "candidate_stage_type_stage_key_key" UNIQUE ("stage_key");



ALTER TABLE ONLY "core"."companies"
    ADD CONSTRAINT "companies_company_slug_uk" UNIQUE ("company_slug");



ALTER TABLE ONLY "core"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_candidate_checklist_config"
    ADD CONSTRAINT "company_candidate_checklist_config_company_id_item_type_id_key" UNIQUE ("company_id", "item_type_id");



ALTER TABLE ONLY "core"."company_candidate_checklist_config"
    ADD CONSTRAINT "company_candidate_checklist_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_candidate_stage_config"
    ADD CONSTRAINT "company_candidate_stage_config_company_id_stage_type_id_key" UNIQUE ("company_id", "stage_type_id");



ALTER TABLE ONLY "core"."company_candidate_stage_config"
    ADD CONSTRAINT "company_candidate_stage_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_contract_config"
    ADD CONSTRAINT "company_contract_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_invites"
    ADD CONSTRAINT "company_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_memberships"
    ADD CONSTRAINT "company_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_onboardings"
    ADD CONSTRAINT "company_onboardings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_operations_config"
    ADD CONSTRAINT "company_operations_config_pkey" PRIMARY KEY ("company_id");



ALTER TABLE ONLY "core"."company_person_compensation"
    ADD CONSTRAINT "company_person_compensation_company_id_roster_member_id_eff_key" UNIQUE ("company_id", "roster_member_id", "effective_start_date");



ALTER TABLE ONLY "core"."company_person_compensation"
    ADD CONSTRAINT "company_person_compensation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_roster_compliance"
    ADD CONSTRAINT "company_roster_compliance_company_id_roster_member_id_docum_key" UNIQUE ("company_id", "roster_member_id", "document_type_id");



ALTER TABLE ONLY "core"."company_roster_compliance"
    ADD CONSTRAINT "company_roster_compliance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_roster_document_file"
    ADD CONSTRAINT "company_roster_document_file_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_roster_dsw_alias"
    ADD CONSTRAINT "company_roster_dsw_alias_company_id_alias_text_key" UNIQUE ("company_id", "alias_text");



ALTER TABLE ONLY "core"."company_roster_dsw_alias"
    ADD CONSTRAINT "company_roster_dsw_alias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_roster_event"
    ADD CONSTRAINT "company_roster_event_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_roster_identifier"
    ADD CONSTRAINT "company_roster_identifier_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_roster_operations_fact"
    ADD CONSTRAINT "company_roster_operations_fact_pkey" PRIMARY KEY ("roster_id");



ALTER TABLE ONLY "core"."company_roster"
    ADD CONSTRAINT "company_roster_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_roster_trainee_pay_override"
    ADD CONSTRAINT "company_roster_trainee_pay_override_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_user_grant"
    ADD CONSTRAINT "company_user_grant_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."company_user_grant"
    ADD CONSTRAINT "company_user_grant_unique" UNIQUE ("company_id", "profile_id", "grant_key");



ALTER TABLE ONLY "core"."compliance_document_type"
    ADD CONSTRAINT "compliance_document_type_document_type_key_key" UNIQUE ("document_type_key");



ALTER TABLE ONLY "core"."compliance_document_type"
    ADD CONSTRAINT "compliance_document_type_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."data_rebuild_log"
    ADD CONSTRAINT "data_rebuild_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."dispatch_day"
    ADD CONSTRAINT "dispatch_day_company_id_dispatch_date_key" UNIQUE ("company_id", "dispatch_date");



ALTER TABLE ONLY "core"."dispatch_day"
    ADD CONSTRAINT "dispatch_day_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."dispatch_event"
    ADD CONSTRAINT "dispatch_event_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."dispatch_event_type"
    ADD CONSTRAINT "dispatch_event_type_company_id_event_code_key" UNIQUE ("company_id", "event_code");



ALTER TABLE ONLY "core"."dispatch_event_type"
    ADD CONSTRAINT "dispatch_event_type_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."driver_activity_event"
    ADD CONSTRAINT "driver_activity_event_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."driver_activity_event_type"
    ADD CONSTRAINT "driver_activity_event_type_pkey" PRIMARY KEY ("event_type");



ALTER TABLE ONLY "core"."driver_activity_signal"
    ADD CONSTRAINT "driver_activity_signal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."driver_breadcrumb_point"
    ADD CONSTRAINT "driver_breadcrumb_point_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_automation_run"
    ADD CONSTRAINT "operations_automation_run_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_automation_schedule_config"
    ADD CONSTRAINT "operations_automation_schedule_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_automation_schedule_config"
    ADD CONSTRAINT "operations_automation_schedule_type_unique" UNIQUE ("company_id", "automation_type");



ALTER TABLE ONLY "core"."operations_collection_artifact"
    ADD CONSTRAINT "operations_collection_artifact_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_collection_artifact"
    ADD CONSTRAINT "operations_collection_artifact_storage_unique" UNIQUE ("storage_bucket", "storage_path");



ALTER TABLE ONLY "core"."operations_collection_order"
    ADD CONSTRAINT "operations_collection_order_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_collection_request"
    ADD CONSTRAINT "operations_collection_request_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_mileage_audit_review"
    ADD CONSTRAINT "operations_mileage_audit_review_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_mileage_audit_review"
    ADD CONSTRAINT "operations_mileage_audit_review_raw_row_id_key" UNIQUE ("raw_row_id");



ALTER TABLE ONLY "core"."operations_mileage_correction_log"
    ADD CONSTRAINT "operations_mileage_correction_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_report_batch"
    ADD CONSTRAINT "operations_report_batch_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_report_family"
    ADD CONSTRAINT "operations_report_family_pkey" PRIMARY KEY ("report_family_key");



ALTER TABLE ONLY "core"."operations_report_raw_row"
    ADD CONSTRAINT "operations_report_raw_row_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."operations_report_shape"
    ADD CONSTRAINT "operations_report_shape_pkey" PRIMARY KEY ("report_shape_key");



ALTER TABLE ONLY "core"."operations_report_summary_row"
    ADD CONSTRAINT "operations_report_summary_row_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."payroll_activity_fact"
    ADD CONSTRAINT "payroll_activity_fact_company_id_service_date_roster_member_key" UNIQUE ("company_id", "service_date", "roster_member_id", "activity_role", "route_baseline_id", "source_kind", "source_ref_id");



ALTER TABLE ONLY "core"."payroll_activity_fact"
    ADD CONSTRAINT "payroll_activity_fact_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."payroll_adjustment_event"
    ADD CONSTRAINT "payroll_adjustment_event_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."payroll_adjustment_target"
    ADD CONSTRAINT "payroll_adjustment_target_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."payroll_adjustment_target"
    ADD CONSTRAINT "payroll_adjustment_target_uk" UNIQUE ("adjustment_event_id", "roster_member_id");



ALTER TABLE ONLY "core"."profile_document"
    ADD CONSTRAINT "profile_document_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."profile_driver_license"
    ADD CONSTRAINT "profile_driver_license_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."profile_private_fact"
    ADD CONSTRAINT "profile_private_fact_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "core"."profiles"
    ADD CONSTRAINT "profiles_auth_user_id_uk" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "core"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."roster_candidate_checklist_fact"
    ADD CONSTRAINT "roster_candidate_checklist_fa_company_id_roster_id_item_typ_key" UNIQUE ("company_id", "roster_id", "item_type_id");



ALTER TABLE ONLY "core"."roster_candidate_checklist_fact"
    ADD CONSTRAINT "roster_candidate_checklist_fact_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."roster_candidate_stage"
    ADD CONSTRAINT "roster_candidate_stage_company_id_roster_id_key" UNIQUE ("company_id", "roster_id");



ALTER TABLE ONLY "core"."roster_candidate_stage"
    ADD CONSTRAINT "roster_candidate_stage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."roster_compliance_requirement"
    ADD CONSTRAINT "roster_compliance_requirement_company_id_document_type_id_key" UNIQUE ("company_id", "document_type_id");



ALTER TABLE ONLY "core"."roster_compliance_requirement"
    ADD CONSTRAINT "roster_compliance_requirement_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."roster_compliance_status"
    ADD CONSTRAINT "roster_compliance_status_company_id_roster_id_document_type_key" UNIQUE ("company_id", "roster_id", "document_type_id");



ALTER TABLE ONLY "core"."roster_compliance_status"
    ADD CONSTRAINT "roster_compliance_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "core"."walk_on_driver"
    ADD CONSTRAINT "walk_on_driver_company_name_uq" UNIQUE ("company_id", "normalized_name");



ALTER TABLE ONLY "core"."walk_on_driver"
    ADD CONSTRAINT "walk_on_driver_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "legal"."document_acceptance"
    ADD CONSTRAINT "document_acceptance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "legal"."document"
    ADD CONSTRAINT "document_document_key_key" UNIQUE ("document_key");



ALTER TABLE ONLY "legal"."document"
    ADD CONSTRAINT "document_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "legal"."document_section"
    ADD CONSTRAINT "document_section_document_id_section_key_key" UNIQUE ("document_id", "section_key");



ALTER TABLE ONLY "legal"."document_section"
    ADD CONSTRAINT "document_section_document_id_section_number_key" UNIQUE ("document_id", "section_number");



ALTER TABLE ONLY "legal"."document_section_note"
    ADD CONSTRAINT "document_section_note_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "legal"."document_section"
    ADD CONSTRAINT "document_section_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "legal"."document_section_revision"
    ADD CONSTRAINT "document_section_revision_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_terminal"
    ADD CONSTRAINT "company_terminal_pkey" PRIMARY KEY ("terminal_id");



ALTER TABLE ONLY "public"."driver_time_off_request"
    ADD CONSTRAINT "driver_time_off_request_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hiring_invite_token"
    ADD CONSTRAINT "hiring_invite_token_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hiring_invite_token"
    ADD CONSTRAINT "hiring_invite_token_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."onboarding_session"
    ADD CONSTRAINT "onboarding_session_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_step"
    ADD CONSTRAINT "onboarding_step_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_session_step_unique" UNIQUE ("session_id", "step_key");



ALTER TABLE ONLY "public"."onboarding_step"
    ADD CONSTRAINT "onboarding_step_step_key_key" UNIQUE ("step_key");



ALTER TABLE ONLY "public"."person"
    ADD CONSTRAINT "person_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."route_baseline"
    ADD CONSTRAINT "route_baseline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_baseline"
    ADD CONSTRAINT "schedule_baseline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_day_fact"
    ADD CONSTRAINT "schedule_day_fact_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_override"
    ADD CONSTRAINT "schedule_override_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_preset"
    ADD CONSTRAINT "schedule_preset_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_request_activity"
    ADD CONSTRAINT "schedule_request_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_request_cover_offer"
    ADD CONSTRAINT "schedule_request_cover_offer_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_request"
    ADD CONSTRAINT "schedule_request_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ref"."industries"
    ADD CONSTRAINT "industries_industry_key_uk" UNIQUE ("industry_key");



ALTER TABLE ONLY "ref"."industries"
    ADD CONSTRAINT "industries_pkey" PRIMARY KEY ("id");



CREATE INDEX "billing_customer_company_idx" ON "billing"."customer" USING "btree" ("company_id");



CREATE UNIQUE INDEX "billing_payment_checkout_session_uniq" ON "billing"."payment" USING "btree" ("provider", "provider_checkout_session_id") WHERE ("provider_checkout_session_id" IS NOT NULL);



CREATE INDEX "billing_payment_company_idx" ON "billing"."payment" USING "btree" ("company_id");



CREATE INDEX "billing_payment_customer_idx" ON "billing"."payment" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "billing_payment_event_uniq" ON "billing"."payment" USING "btree" ("provider", "provider_event_id") WHERE ("provider_event_id" IS NOT NULL);



CREATE UNIQUE INDEX "billing_payment_intent_uniq" ON "billing"."payment" USING "btree" ("provider", "provider_payment_intent_id") WHERE ("provider_payment_intent_id" IS NOT NULL);



CREATE INDEX "billing_payment_status_idx" ON "billing"."payment" USING "btree" ("payment_status");



CREATE INDEX "billing_subscription_company_idx" ON "billing"."subscription" USING "btree" ("company_id");



CREATE INDEX "billing_subscription_provider_id_idx" ON "billing"."subscription" USING "btree" ("provider_subscription_id");



CREATE INDEX "asset_assigned_person_id_idx" ON "core"."asset" USING "btree" ("assigned_person_id");



CREATE INDEX "asset_assignment_asset_id_idx" ON "core"."asset_assignment" USING "btree" ("asset_id");



CREATE INDEX "asset_assignment_company_id_idx" ON "core"."asset_assignment" USING "btree" ("company_id");



CREATE UNIQUE INDEX "asset_assignment_one_open_per_asset_uk" ON "core"."asset_assignment" USING "btree" ("asset_id") WHERE ("released_at" IS NULL);



CREATE INDEX "asset_assignment_person_id_idx" ON "core"."asset_assignment" USING "btree" ("person_id");



CREATE INDEX "asset_audit_asset_id_idx" ON "core"."asset_audit" USING "btree" ("asset_id");



CREATE INDEX "asset_audit_company_id_idx" ON "core"."asset_audit" USING "btree" ("company_id");



CREATE INDEX "asset_audit_person_id_idx" ON "core"."asset_audit" USING "btree" ("person_id");



CREATE INDEX "asset_company_id_idx" ON "core"."asset" USING "btree" ("company_id");



CREATE INDEX "asset_event_asset_id_idx" ON "core"."asset_event" USING "btree" ("asset_id");



CREATE INDEX "asset_event_company_id_idx" ON "core"."asset_event" USING "btree" ("company_id");



CREATE INDEX "asset_event_event_key_idx" ON "core"."asset_event" USING "btree" ("event_key");



CREATE INDEX "asset_event_person_id_idx" ON "core"."asset_event" USING "btree" ("person_id");



CREATE INDEX "asset_status_id_idx" ON "core"."asset" USING "btree" ("asset_status_id");



CREATE INDEX "asset_type_id_idx" ON "core"."asset" USING "btree" ("asset_type_id");



CREATE UNIQUE INDEX "automation_credential_profile_uidx" ON "core"."automation_credential" USING "btree" ("profile_id");



CREATE INDEX "companies_company_status_idx" ON "core"."companies" USING "btree" ("company_status");



CREATE INDEX "companies_primary_industry_id_idx" ON "core"."companies" USING "btree" ("primary_industry_id");



CREATE INDEX "company_invites_company_id_idx" ON "core"."company_invites" USING "btree" ("company_id");



CREATE INDEX "company_invites_company_status_idx" ON "core"."company_invites" USING "btree" ("company_id", "invite_status");



CREATE INDEX "company_invites_email_idx" ON "core"."company_invites" USING "btree" ("lower"("email"));



CREATE INDEX "company_invites_uploaded_batch_key_idx" ON "core"."company_invites" USING "btree" ("uploaded_batch_key") WHERE ("uploaded_batch_key" IS NOT NULL);



CREATE INDEX "company_memberships_company_id_idx" ON "core"."company_memberships" USING "btree" ("company_id");



CREATE INDEX "company_memberships_company_status_idx" ON "core"."company_memberships" USING "btree" ("company_id", "membership_status");



CREATE UNIQUE INDEX "company_memberships_open_uk" ON "core"."company_memberships" USING "btree" ("company_id", "profile_id") WHERE ("membership_status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'inactive'::"text"]));



CREATE INDEX "company_memberships_profile_id_idx" ON "core"."company_memberships" USING "btree" ("profile_id");



CREATE INDEX "company_memberships_profile_status_idx" ON "core"."company_memberships" USING "btree" ("profile_id", "membership_status");



CREATE INDEX "company_onboardings_company_id_idx" ON "core"."company_onboardings" USING "btree" ("company_id");



CREATE INDEX "company_onboardings_company_status_idx" ON "core"."company_onboardings" USING "btree" ("company_id", "onboarding_status");



CREATE UNIQUE INDEX "company_onboardings_open_uk" ON "core"."company_onboardings" USING "btree" ("company_id", "profile_id") WHERE ("onboarding_status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text"]));



CREATE INDEX "company_onboardings_profile_id_idx" ON "core"."company_onboardings" USING "btree" ("profile_id");



CREATE INDEX "company_onboardings_profile_status_idx" ON "core"."company_onboardings" USING "btree" ("profile_id", "onboarding_status");



CREATE UNIQUE INDEX "company_roster_company_email_unique_idx" ON "core"."company_roster" USING "btree" ("company_id", "lower"(TRIM(BOTH FROM "email"))) WHERE (("email" IS NOT NULL) AND (TRIM(BOTH FROM "email") <> ''::"text"));



CREATE INDEX "company_roster_dsw_alias_lookup_idx" ON "core"."company_roster_dsw_alias" USING "btree" ("company_id", "upper"(TRIM(BOTH FROM "alias_text")));



CREATE INDEX "company_roster_dsw_alias_roster_idx" ON "core"."company_roster_dsw_alias" USING "btree" ("roster_id");



CREATE INDEX "company_roster_operations_fact_dswid_idx" ON "core"."company_roster_operations_fact" USING "btree" ("dswid") WHERE (("dswid" IS NOT NULL) AND ("btrim"("dswid") <> ''::"text"));



CREATE UNIQUE INDEX "company_roster_operations_fact_fx_id_company_guard" ON "core"."company_roster_operations_fact" USING "btree" ("fx_id") WHERE (("fx_id" IS NOT NULL) AND ("btrim"("fx_id") <> ''::"text"));



CREATE UNIQUE INDEX "company_roster_trainee_pay_override_one_active_uq" ON "core"."company_roster_trainee_pay_override" USING "btree" ("company_id", "roster_id") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "compliance_document_type_key_unique" ON "core"."compliance_document_type" USING "btree" ("document_type_key");



CREATE INDEX "dispatch_day_company_date_idx" ON "core"."dispatch_day" USING "btree" ("company_id", "dispatch_date");



CREATE INDEX "dispatch_event_day_created_idx" ON "core"."dispatch_event" USING "btree" ("dispatch_day_id", "created_at");



CREATE UNIQUE INDEX "dispatch_event_type_system_code_uidx" ON "core"."dispatch_event_type" USING "btree" ("event_code") WHERE ("company_id" IS NULL);



CREATE INDEX "driver_activity_event_company_date_idx" ON "core"."driver_activity_event" USING "btree" ("company_id", "service_date", "occurred_at");



CREATE INDEX "driver_activity_event_roster_date_idx" ON "core"."driver_activity_event" USING "btree" ("roster_member_id", "service_date", "occurred_at");



CREATE INDEX "driver_activity_signal_company_date_idx" ON "core"."driver_activity_signal" USING "btree" ("company_id", "service_date", "occurred_at");



CREATE INDEX "driver_activity_signal_roster_date_idx" ON "core"."driver_activity_signal" USING "btree" ("roster_member_id", "service_date", "occurred_at");



CREATE INDEX "driver_breadcrumb_company_date_idx" ON "core"."driver_breadcrumb_point" USING "btree" ("company_id", "service_date", "captured_at");



CREATE INDEX "driver_breadcrumb_roster_date_idx" ON "core"."driver_breadcrumb_point" USING "btree" ("roster_member_id", "service_date", "captured_at");



CREATE INDEX "idx_company_candidate_checklist_config_company" ON "core"."company_candidate_checklist_config" USING "btree" ("company_id");



CREATE INDEX "idx_company_candidate_stage_config_company" ON "core"."company_candidate_stage_config" USING "btree" ("company_id");



CREATE INDEX "idx_company_person_compensation_company_roster" ON "core"."company_person_compensation" USING "btree" ("company_id", "roster_member_id");



CREATE INDEX "idx_company_roster_compliance_company_roster" ON "core"."company_roster_compliance" USING "btree" ("company_id", "roster_member_id");



CREATE INDEX "idx_company_roster_compliance_status" ON "core"."company_roster_compliance" USING "btree" ("company_id", "status");



CREATE INDEX "idx_company_roster_document_file_code" ON "core"."company_roster_document_file" USING "btree" ("company_id", "document_code");



CREATE INDEX "idx_company_roster_document_file_member" ON "core"."company_roster_document_file" USING "btree" ("company_id", "roster_member_id");



CREATE INDEX "idx_company_roster_event_category" ON "core"."company_roster_event" USING "btree" ("event_category", "event_type");



CREATE INDEX "idx_company_roster_event_company" ON "core"."company_roster_event" USING "btree" ("company_id", "occurred_at" DESC);



CREATE INDEX "idx_company_roster_event_roster" ON "core"."company_roster_event" USING "btree" ("roster_id", "occurred_at" DESC);



CREATE INDEX "idx_company_user_grant_company" ON "core"."company_user_grant" USING "btree" ("company_id");



CREATE INDEX "idx_company_user_grant_profile" ON "core"."company_user_grant" USING "btree" ("profile_id");



CREATE INDEX "idx_profile_document_profile" ON "core"."profile_document" USING "btree" ("profile_id");



CREATE INDEX "idx_profile_document_type" ON "core"."profile_document" USING "btree" ("document_type_id");



CREATE INDEX "idx_roster_candidate_checklist_fact_company" ON "core"."roster_candidate_checklist_fact" USING "btree" ("company_id");



CREATE INDEX "idx_roster_candidate_checklist_fact_roster" ON "core"."roster_candidate_checklist_fact" USING "btree" ("roster_id");



CREATE INDEX "idx_roster_candidate_stage_company" ON "core"."roster_candidate_stage" USING "btree" ("company_id");



CREATE INDEX "idx_roster_candidate_stage_roster" ON "core"."roster_candidate_stage" USING "btree" ("roster_id");



CREATE INDEX "idx_roster_company" ON "core"."company_roster" USING "btree" ("company_id");



CREATE INDEX "idx_roster_compliance_status_company" ON "core"."roster_compliance_status" USING "btree" ("company_id");



CREATE INDEX "idx_roster_compliance_status_roster" ON "core"."roster_compliance_status" USING "btree" ("roster_id");



CREATE INDEX "idx_roster_identifier" ON "core"."company_roster_identifier" USING "btree" ("roster_id");



CREATE INDEX "idx_roster_profile" ON "core"."company_roster" USING "btree" ("profile_id");



CREATE INDEX "operations_automation_run_artifact_idx" ON "core"."operations_automation_run" USING "btree" ("company_id", "automation_type", "artifact_status", "started_at" DESC);



CREATE INDEX "operations_automation_run_company_started_idx" ON "core"."operations_automation_run" USING "btree" ("company_id", "started_at" DESC);



CREATE INDEX "operations_collection_artifact_ingest_idx" ON "core"."operations_collection_artifact" USING "btree" ("company_id", "service_date", "artifact_status", "report_family_key");



CREATE INDEX "operations_collection_artifact_request_idx" ON "core"."operations_collection_artifact" USING "btree" ("collection_request_id", "artifact_status");



CREATE INDEX "operations_collection_request_claim_idx" ON "core"."operations_collection_request" USING "btree" ("request_status", "priority", "created_at") WHERE ("request_status" = 'QUEUED'::"text");



CREATE INDEX "operations_collection_request_company_status_idx" ON "core"."operations_collection_request" USING "btree" ("company_id", "request_status", "priority", "created_at");



CREATE INDEX "operations_mileage_audit_review_action_idx" ON "core"."operations_mileage_audit_review" USING "btree" ("review_action");



CREATE INDEX "operations_mileage_audit_review_company_idx" ON "core"."operations_mileage_audit_review" USING "btree" ("company_id");



CREATE INDEX "operations_mileage_correction_log_company_idx" ON "core"."operations_mileage_correction_log" USING "btree" ("company_id", "service_date" DESC);



CREATE INDEX "operations_mileage_correction_log_raw_row_idx" ON "core"."operations_mileage_correction_log" USING "btree" ("raw_row_id");



CREATE UNIQUE INDEX "operations_mileage_correction_log_raw_row_unique" ON "core"."operations_mileage_correction_log" USING "btree" ("raw_row_id");



CREATE INDEX "operations_report_batch_company_date_idx" ON "core"."operations_report_batch" USING "btree" ("company_id", "service_date", "report_family_key", "report_frame");



CREATE INDEX "operations_report_raw_row_batch_idx" ON "core"."operations_report_raw_row" USING "btree" ("batch_id", "source_row_index");



CREATE INDEX "operations_report_raw_row_company_route_idx" ON "core"."operations_report_raw_row" USING "btree" ("company_id", "source_wa_number", "source_driver_name");



CREATE INDEX "operations_report_summary_row_batch_idx" ON "core"."operations_report_summary_row" USING "btree" ("batch_id", "source_row_index");



CREATE INDEX "operations_report_summary_row_company_date_idx" ON "core"."operations_report_summary_row" USING "btree" ("company_id", "service_date", "report_family_key", "summary_scope");



CREATE INDEX "payroll_activity_fact_company_date_idx" ON "core"."payroll_activity_fact" USING "btree" ("company_id", "service_date");



CREATE INDEX "payroll_activity_fact_company_week_idx" ON "core"."payroll_activity_fact" USING "btree" ("company_id", "week_end_date");



CREATE INDEX "profile_driver_license_profile_idx" ON "core"."profile_driver_license" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "profiles_email_lower_uk" ON "core"."profiles" USING "btree" ("lower"("email"));



CREATE INDEX "profiles_last_active_at_idx" ON "core"."profiles" USING "btree" ("last_active_at");



CREATE INDEX "profiles_platform_owner_idx" ON "core"."profiles" USING "btree" ("is_platform_owner") WHERE ("is_platform_owner" = true);



CREATE INDEX "profiles_profile_status_idx" ON "core"."profiles" USING "btree" ("profile_status");



CREATE INDEX "idx_document_acceptance_document" ON "legal"."document_acceptance" USING "btree" ("document_id");



CREATE INDEX "idx_document_section_note_section" ON "legal"."document_section_note" USING "btree" ("section_id");



CREATE UNIQUE INDEX "company_terminal_unique" ON "public"."company_terminal" USING "btree" ("company_id", "terminal_code");



CREATE INDEX "driver_time_off_request_company_status_idx" ON "public"."driver_time_off_request" USING "btree" ("company_id", "status", "start_date");



CREATE INDEX "driver_time_off_request_profile_idx" ON "public"."driver_time_off_request" USING "btree" ("company_id", "profile_id", "start_date");



CREATE INDEX "driver_time_off_request_roster_idx" ON "public"."driver_time_off_request" USING "btree" ("company_id", "roster_member_id", "start_date");



CREATE INDEX "idx_hiring_invite_token_candidate" ON "public"."hiring_invite_token" USING "btree" ("candidate_id");



CREATE INDEX "idx_hiring_invite_token_company" ON "public"."hiring_invite_token" USING "btree" ("company_id");



CREATE INDEX "idx_hiring_invite_token_roster" ON "public"."hiring_invite_token" USING "btree" ("roster_id");



CREATE INDEX "idx_hiring_invite_token_token" ON "public"."hiring_invite_token" USING "btree" ("token");



CREATE INDEX "idx_invite_status" ON "public"."hiring_invite_token" USING "btree" ("status");



CREATE INDEX "idx_onboarding_candidate" ON "public"."onboarding_session" USING "btree" ("candidate_id");



CREATE INDEX "idx_onboarding_session_company" ON "public"."onboarding_session" USING "btree" ("company_id");



CREATE INDEX "idx_onboarding_session_roster" ON "public"."onboarding_session" USING "btree" ("roster_id");



CREATE INDEX "idx_onboarding_step_progress_session" ON "public"."onboarding_step_progress" USING "btree" ("session_id");



CREATE INDEX "idx_onboarding_token" ON "public"."onboarding_session" USING "btree" ("invite_token");



CREATE INDEX "idx_schedule_baseline_active" ON "public"."schedule_baseline" USING "btree" ("company_id", "is_active");



CREATE INDEX "idx_schedule_baseline_company" ON "public"."schedule_baseline" USING "btree" ("company_id");



CREATE INDEX "idx_schedule_baseline_roster" ON "public"."schedule_baseline" USING "btree" ("roster_member_id");



CREATE INDEX "idx_schedule_day_fact_company" ON "public"."schedule_day_fact" USING "btree" ("company_id");



CREATE INDEX "idx_schedule_day_fact_date" ON "public"."schedule_day_fact" USING "btree" ("service_date");



CREATE INDEX "idx_schedule_day_fact_lookup" ON "public"."schedule_day_fact" USING "btree" ("company_id", "service_date");



CREATE INDEX "idx_schedule_day_fact_roster" ON "public"."schedule_day_fact" USING "btree" ("roster_member_id");



CREATE INDEX "idx_schedule_override_active" ON "public"."schedule_override" USING "btree" ("company_id", "is_active");



CREATE INDEX "idx_schedule_override_dates" ON "public"."schedule_override" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_schedule_override_roster" ON "public"."schedule_override" USING "btree" ("roster_member_id");



CREATE UNIQUE INDEX "idx_schedule_preset_code" ON "public"."schedule_preset" USING "btree" ("company_id", "preset_code");



CREATE INDEX "idx_schedule_preset_company" ON "public"."schedule_preset" USING "btree" ("company_id");



CREATE INDEX "route_baseline_company_idx" ON "public"."route_baseline" USING "btree" ("company_id");



CREATE INDEX "route_baseline_company_route_idx" ON "public"."route_baseline" USING "btree" ("company_id", "route_name");



CREATE INDEX "route_baseline_effective_idx" ON "public"."route_baseline" USING "btree" ("company_id", "effective_start", "effective_end");



CREATE UNIQUE INDEX "route_baseline_one_active_idx" ON "public"."route_baseline" USING "btree" ("company_id", "terminal_id", "route_name") WHERE ("effective_end" IS NULL);



CREATE INDEX "industries_is_active_idx" ON "ref"."industries" USING "btree" ("is_active", "sort_order", "industry_label");



CREATE OR REPLACE TRIGGER "billing_customer_touch_updated_at" BEFORE UPDATE ON "billing"."customer" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "billing_payment_touch_updated_at" BEFORE UPDATE ON "billing"."payment" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "billing_subscription_touch_updated_at" BEFORE UPDATE ON "billing"."subscription" FOR EACH ROW EXECUTE FUNCTION "billing"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "commercial_profile_touch_updated_at" BEFORE UPDATE ON "commercial"."profile" FOR EACH ROW EXECUTE FUNCTION "commercial"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "operator_tier_touch_updated_at" BEFORE UPDATE ON "commercial"."operator_tier" FOR EACH ROW EXECUTE FUNCTION "commercial"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_on_companies" BEFORE UPDATE ON "core"."companies" FOR EACH ROW EXECUTE FUNCTION "core"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_on_company_invites" BEFORE UPDATE ON "core"."company_invites" FOR EACH ROW EXECUTE FUNCTION "core"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_on_company_memberships" BEFORE UPDATE ON "core"."company_memberships" FOR EACH ROW EXECUTE FUNCTION "core"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_on_company_onboardings" BEFORE UPDATE ON "core"."company_onboardings" FOR EACH ROW EXECUTE FUNCTION "core"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_on_profiles" BEFORE UPDATE ON "core"."profiles" FOR EACH ROW EXECUTE FUNCTION "core"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_document_section_revision" BEFORE UPDATE OF "body_markdown" ON "legal"."document_section" FOR EACH ROW EXECUTE FUNCTION "legal"."bump_document_version"();



CREATE OR REPLACE TRIGGER "set_updated_at_on_industries" BEFORE UPDATE ON "ref"."industries" FOR EACH ROW EXECUTE FUNCTION "core"."set_updated_at"();



ALTER TABLE ONLY "billing"."customer"
    ADD CONSTRAINT "customer_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."payment"
    ADD CONSTRAINT "payment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."payment"
    ADD CONSTRAINT "payment_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "billing"."customer"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."subscription"
    ADD CONSTRAINT "subscription_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."subscription"
    ADD CONSTRAINT "subscription_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "billing"."customer"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "commercial"."profile"
    ADD CONSTRAINT "profile_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."asset"
    ADD CONSTRAINT "asset_asset_provider_id_fkey" FOREIGN KEY ("asset_provider_id") REFERENCES "core"."asset_provider"("id");



ALTER TABLE ONLY "core"."asset"
    ADD CONSTRAINT "asset_asset_status_id_fkey" FOREIGN KEY ("asset_status_id") REFERENCES "core"."asset_status"("id");



ALTER TABLE ONLY "core"."asset"
    ADD CONSTRAINT "asset_asset_type_id_fkey" FOREIGN KEY ("asset_type_id") REFERENCES "core"."asset_type"("id");



ALTER TABLE ONLY "core"."asset"
    ADD CONSTRAINT "asset_assigned_person_fk" FOREIGN KEY ("assigned_person_id") REFERENCES "public"."person"("id");



ALTER TABLE ONLY "core"."asset_assignment"
    ADD CONSTRAINT "asset_assignment_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "core"."asset"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."asset_assignment"
    ADD CONSTRAINT "asset_assignment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id");



ALTER TABLE ONLY "core"."asset_assignment"
    ADD CONSTRAINT "asset_assignment_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id");



ALTER TABLE ONLY "core"."asset_audit"
    ADD CONSTRAINT "asset_audit_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "core"."asset"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."asset_audit"
    ADD CONSTRAINT "asset_audit_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id");



ALTER TABLE ONLY "core"."asset_audit"
    ADD CONSTRAINT "asset_audit_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id");



ALTER TABLE ONLY "core"."asset_audit"
    ADD CONSTRAINT "asset_audit_verified_by_person_id_fkey" FOREIGN KEY ("verified_by_person_id") REFERENCES "public"."person"("id");



ALTER TABLE ONLY "core"."asset"
    ADD CONSTRAINT "asset_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id");



ALTER TABLE ONLY "core"."asset_event"
    ADD CONSTRAINT "asset_event_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "core"."asset"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."asset_event"
    ADD CONSTRAINT "asset_event_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id");



ALTER TABLE ONLY "core"."asset_event"
    ADD CONSTRAINT "asset_event_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "core"."asset_status"("id");



ALTER TABLE ONLY "core"."asset_event"
    ADD CONSTRAINT "asset_event_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id");



ALTER TABLE ONLY "core"."asset_event"
    ADD CONSTRAINT "asset_event_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "core"."asset_status"("id");



ALTER TABLE ONLY "core"."asset_provider"
    ADD CONSTRAINT "asset_provider_asset_type_id_fkey" FOREIGN KEY ("asset_type_id") REFERENCES "core"."asset_type"("id");



ALTER TABLE ONLY "core"."asset_provider"
    ADD CONSTRAINT "asset_provider_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id");



ALTER TABLE ONLY "core"."automation_credential"
    ADD CONSTRAINT "automation_credential_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."automation_profile"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."companies"
    ADD CONSTRAINT "companies_primary_industry_id_fkey" FOREIGN KEY ("primary_industry_id") REFERENCES "ref"."industries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."company_candidate_checklist_config"
    ADD CONSTRAINT "company_candidate_checklist_config_item_type_id_fkey" FOREIGN KEY ("item_type_id") REFERENCES "core"."candidate_checklist_item_type"("id");



ALTER TABLE ONLY "core"."company_candidate_stage_config"
    ADD CONSTRAINT "company_candidate_stage_config_stage_type_id_fkey" FOREIGN KEY ("stage_type_id") REFERENCES "core"."candidate_stage_type"("id");



ALTER TABLE ONLY "core"."company_contract_config"
    ADD CONSTRAINT "company_contract_config_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id");



ALTER TABLE ONLY "core"."company_invites"
    ADD CONSTRAINT "company_invites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_invites"
    ADD CONSTRAINT "company_invites_linked_profile_id_fkey" FOREIGN KEY ("linked_profile_id") REFERENCES "core"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."company_memberships"
    ADD CONSTRAINT "company_memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_memberships"
    ADD CONSTRAINT "company_memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_onboardings"
    ADD CONSTRAINT "company_onboardings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_onboardings"
    ADD CONSTRAINT "company_onboardings_initiated_by_profile_id_fkey" FOREIGN KEY ("initiated_by_profile_id") REFERENCES "core"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."company_onboardings"
    ADD CONSTRAINT "company_onboardings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_onboardings"
    ADD CONSTRAINT "company_onboardings_target_membership_id_fkey" FOREIGN KEY ("target_membership_id") REFERENCES "core"."company_memberships"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."company_operations_config"
    ADD CONSTRAINT "company_operations_config_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_person_compensation"
    ADD CONSTRAINT "company_person_compensation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_person_compensation"
    ADD CONSTRAINT "company_person_compensation_roster_member_id_fkey" FOREIGN KEY ("roster_member_id") REFERENCES "core"."company_roster"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster"
    ADD CONSTRAINT "company_roster_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_compliance"
    ADD CONSTRAINT "company_roster_compliance_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_compliance"
    ADD CONSTRAINT "company_roster_compliance_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "core"."compliance_document_type"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "core"."company_roster_compliance"
    ADD CONSTRAINT "company_roster_compliance_roster_member_id_fkey" FOREIGN KEY ("roster_member_id") REFERENCES "core"."company_roster"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_document_file"
    ADD CONSTRAINT "company_roster_document_file_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_document_file"
    ADD CONSTRAINT "company_roster_document_file_compliance_document_id_fkey" FOREIGN KEY ("compliance_document_id") REFERENCES "core"."company_roster_compliance"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."company_roster_document_file"
    ADD CONSTRAINT "company_roster_document_file_roster_member_id_fkey" FOREIGN KEY ("roster_member_id") REFERENCES "core"."company_roster"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_dsw_alias"
    ADD CONSTRAINT "company_roster_dsw_alias_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_dsw_alias"
    ADD CONSTRAINT "company_roster_dsw_alias_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."company_roster_dsw_alias"
    ADD CONSTRAINT "company_roster_dsw_alias_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "core"."company_roster"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_event"
    ADD CONSTRAINT "company_roster_event_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_event"
    ADD CONSTRAINT "company_roster_event_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "core"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."company_roster_event"
    ADD CONSTRAINT "company_roster_event_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "core"."company_roster"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_identifier"
    ADD CONSTRAINT "company_roster_identifier_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "core"."company_roster"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_operations_fact"
    ADD CONSTRAINT "company_roster_operations_fact_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "core"."company_roster"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster"
    ADD CONSTRAINT "company_roster_person_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id");



ALTER TABLE ONLY "core"."company_roster"
    ADD CONSTRAINT "company_roster_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."company_roster"
    ADD CONSTRAINT "company_roster_reports_to_roster_id_fkey" FOREIGN KEY ("reports_to_roster_id") REFERENCES "core"."company_roster"("id");



ALTER TABLE ONLY "core"."company_roster_trainee_pay_override"
    ADD CONSTRAINT "company_roster_trainee_pay_override_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_roster_trainee_pay_override"
    ADD CONSTRAINT "company_roster_trainee_pay_override_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "core"."company_roster"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_user_grant"
    ADD CONSTRAINT "company_user_grant_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."company_user_grant"
    ADD CONSTRAINT "company_user_grant_granted_by_profile_id_fkey" FOREIGN KEY ("granted_by_profile_id") REFERENCES "core"."profiles"("id");



ALTER TABLE ONLY "core"."company_user_grant"
    ADD CONSTRAINT "company_user_grant_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."dispatch_day"
    ADD CONSTRAINT "dispatch_day_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."dispatch_event"
    ADD CONSTRAINT "dispatch_event_dispatch_day_id_fkey" FOREIGN KEY ("dispatch_day_id") REFERENCES "core"."dispatch_day"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."dispatch_event"
    ADD CONSTRAINT "dispatch_event_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "core"."dispatch_event_type"("id");



ALTER TABLE ONLY "core"."dispatch_event"
    ADD CONSTRAINT "dispatch_event_person_roster_member_id_fkey" FOREIGN KEY ("person_roster_member_id") REFERENCES "core"."company_roster"("id");



ALTER TABLE ONLY "core"."dispatch_event_type"
    ADD CONSTRAINT "dispatch_event_type_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."driver_activity_event"
    ADD CONSTRAINT "driver_activity_event_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."driver_activity_event"
    ADD CONSTRAINT "driver_activity_event_event_type_fkey" FOREIGN KEY ("event_type") REFERENCES "core"."driver_activity_event_type"("event_type");



ALTER TABLE ONLY "core"."driver_activity_event"
    ADD CONSTRAINT "driver_activity_event_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."driver_activity_event"
    ADD CONSTRAINT "driver_activity_event_roster_member_id_fkey" FOREIGN KEY ("roster_member_id") REFERENCES "core"."company_roster"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."driver_activity_signal"
    ADD CONSTRAINT "driver_activity_signal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."driver_activity_signal"
    ADD CONSTRAINT "driver_activity_signal_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."driver_activity_signal"
    ADD CONSTRAINT "driver_activity_signal_roster_member_id_fkey" FOREIGN KEY ("roster_member_id") REFERENCES "core"."company_roster"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."driver_activity_signal"
    ADD CONSTRAINT "driver_activity_signal_source_activity_event_id_fkey" FOREIGN KEY ("source_activity_event_id") REFERENCES "core"."driver_activity_event"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."driver_activity_signal"
    ADD CONSTRAINT "driver_activity_signal_source_breadcrumb_id_fkey" FOREIGN KEY ("source_breadcrumb_id") REFERENCES "core"."driver_breadcrumb_point"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."driver_breadcrumb_point"
    ADD CONSTRAINT "driver_breadcrumb_point_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."driver_breadcrumb_point"
    ADD CONSTRAINT "driver_breadcrumb_point_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."driver_breadcrumb_point"
    ADD CONSTRAINT "driver_breadcrumb_point_roster_member_id_fkey" FOREIGN KEY ("roster_member_id") REFERENCES "core"."company_roster"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."driver_breadcrumb_point"
    ADD CONSTRAINT "driver_breadcrumb_point_source_activity_event_id_fkey" FOREIGN KEY ("source_activity_event_id") REFERENCES "core"."driver_activity_event"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."operations_automation_run"
    ADD CONSTRAINT "operations_automation_run_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_automation_schedule_config"
    ADD CONSTRAINT "operations_automation_schedule_config_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_collection_artifact"
    ADD CONSTRAINT "operations_collection_artifact_collection_request_id_fkey" FOREIGN KEY ("collection_request_id") REFERENCES "core"."operations_collection_request"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_collection_artifact"
    ADD CONSTRAINT "operations_collection_artifact_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_collection_artifact"
    ADD CONSTRAINT "operations_collection_artifact_report_batch_id_fkey" FOREIGN KEY ("report_batch_id") REFERENCES "core"."operations_report_batch"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."operations_collection_artifact"
    ADD CONSTRAINT "operations_collection_artifact_report_family_key_fkey" FOREIGN KEY ("report_family_key") REFERENCES "core"."operations_report_family"("report_family_key");



ALTER TABLE ONLY "core"."operations_collection_artifact"
    ADD CONSTRAINT "operations_collection_artifact_report_shape_key_fkey" FOREIGN KEY ("report_shape_key") REFERENCES "core"."operations_report_shape"("report_shape_key");



ALTER TABLE ONLY "core"."operations_collection_order"
    ADD CONSTRAINT "operations_collection_order_automation_run_id_fkey" FOREIGN KEY ("automation_run_id") REFERENCES "core"."operations_automation_run"("id");



ALTER TABLE ONLY "core"."operations_collection_order"
    ADD CONSTRAINT "operations_collection_order_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_collection_request"
    ADD CONSTRAINT "operations_collection_request_automation_run_id_fkey" FOREIGN KEY ("automation_run_id") REFERENCES "core"."operations_automation_run"("id");



ALTER TABLE ONLY "core"."operations_collection_request"
    ADD CONSTRAINT "operations_collection_request_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_mileage_audit_review"
    ADD CONSTRAINT "operations_mileage_audit_review_raw_row_id_fkey" FOREIGN KEY ("raw_row_id") REFERENCES "core"."operations_report_raw_row"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_report_batch"
    ADD CONSTRAINT "operations_report_batch_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_report_batch"
    ADD CONSTRAINT "operations_report_batch_report_family_key_fkey" FOREIGN KEY ("report_family_key") REFERENCES "core"."operations_report_family"("report_family_key");



ALTER TABLE ONLY "core"."operations_report_batch"
    ADD CONSTRAINT "operations_report_batch_report_shape_key_fkey" FOREIGN KEY ("report_shape_key") REFERENCES "core"."operations_report_shape"("report_shape_key");



ALTER TABLE ONLY "core"."operations_report_batch"
    ADD CONSTRAINT "operations_report_batch_uploaded_by_profile_id_fkey" FOREIGN KEY ("uploaded_by_profile_id") REFERENCES "core"."profiles"("id");



ALTER TABLE ONLY "core"."operations_report_raw_row"
    ADD CONSTRAINT "operations_report_raw_row_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "core"."operations_report_batch"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_report_raw_row"
    ADD CONSTRAINT "operations_report_raw_row_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_report_raw_row"
    ADD CONSTRAINT "operations_report_raw_row_matched_roster_member_id_fkey" FOREIGN KEY ("matched_roster_member_id") REFERENCES "core"."company_roster"("id");



ALTER TABLE ONLY "core"."operations_report_shape"
    ADD CONSTRAINT "operations_report_shape_report_family_key_fkey" FOREIGN KEY ("report_family_key") REFERENCES "core"."operations_report_family"("report_family_key");



ALTER TABLE ONLY "core"."operations_report_summary_row"
    ADD CONSTRAINT "operations_report_summary_row_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "core"."operations_report_batch"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_report_summary_row"
    ADD CONSTRAINT "operations_report_summary_row_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."operations_report_summary_row"
    ADD CONSTRAINT "operations_report_summary_row_report_family_key_fkey" FOREIGN KEY ("report_family_key") REFERENCES "core"."operations_report_family"("report_family_key");



ALTER TABLE ONLY "core"."payroll_adjustment_event"
    ADD CONSTRAINT "payroll_adjustment_event_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id");



ALTER TABLE ONLY "core"."payroll_adjustment_target"
    ADD CONSTRAINT "payroll_adjustment_target_adjustment_event_id_fkey" FOREIGN KEY ("adjustment_event_id") REFERENCES "core"."payroll_adjustment_event"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."profile_document"
    ADD CONSTRAINT "profile_document_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "core"."compliance_document_type"("id");



ALTER TABLE ONLY "core"."profile_driver_license"
    ADD CONSTRAINT "profile_driver_license_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."profile_private_fact"
    ADD CONSTRAINT "profile_private_fact_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "core"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."profiles"
    ADD CONSTRAINT "profiles_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."roster_candidate_checklist_fact"
    ADD CONSTRAINT "roster_candidate_checklist_fact_item_type_id_fkey" FOREIGN KEY ("item_type_id") REFERENCES "core"."candidate_checklist_item_type"("id");



ALTER TABLE ONLY "core"."roster_candidate_stage"
    ADD CONSTRAINT "roster_candidate_stage_stage_type_id_fkey" FOREIGN KEY ("stage_type_id") REFERENCES "core"."candidate_stage_type"("id");



ALTER TABLE ONLY "core"."roster_compliance_requirement"
    ADD CONSTRAINT "roster_compliance_requirement_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "core"."compliance_document_type"("id");



ALTER TABLE ONLY "core"."roster_compliance_status"
    ADD CONSTRAINT "roster_compliance_status_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "core"."profile_document"("id");



ALTER TABLE ONLY "core"."roster_compliance_status"
    ADD CONSTRAINT "roster_compliance_status_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "core"."compliance_document_type"("id");



ALTER TABLE ONLY "core"."walk_on_driver"
    ADD CONSTRAINT "walk_on_driver_candidate_roster_id_fkey" FOREIGN KEY ("candidate_roster_id") REFERENCES "core"."company_roster"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "core"."walk_on_driver"
    ADD CONSTRAINT "walk_on_driver_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "core"."walk_on_driver"
    ADD CONSTRAINT "walk_on_driver_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "core"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "legal"."document_acceptance"
    ADD CONSTRAINT "document_acceptance_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal"."document"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "legal"."document_acceptance"
    ADD CONSTRAINT "document_acceptance_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "legal"."document_section_revision"("id");



ALTER TABLE ONLY "legal"."document_section"
    ADD CONSTRAINT "document_section_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal"."document"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "legal"."document_section_note"
    ADD CONSTRAINT "document_section_note_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "legal"."document_section"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "legal"."document_section_revision"
    ADD CONSTRAINT "document_section_revision_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "legal"."document_section"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_terminal"
    ADD CONSTRAINT "company_terminal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_step_progress"
    ADD CONSTRAINT "onboarding_step_progress_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."onboarding_session"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."route_baseline"
    ADD CONSTRAINT "route_baseline_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."route_baseline"
    ADD CONSTRAINT "route_baseline_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "public"."company_terminal"("terminal_id");



ALTER TABLE ONLY "public"."schedule_baseline"
    ADD CONSTRAINT "schedule_baseline_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "public"."schedule_preset"("id");



ALTER TABLE ONLY "public"."schedule_baseline"
    ADD CONSTRAINT "schedule_baseline_roster_member_id_fkey" FOREIGN KEY ("roster_member_id") REFERENCES "core"."company_roster"("id");



ALTER TABLE ONLY "public"."schedule_request_activity"
    ADD CONSTRAINT "schedule_request_activity_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."schedule_request"("id");



ALTER TABLE ONLY "public"."schedule_request_cover_offer"
    ADD CONSTRAINT "schedule_request_cover_offer_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."schedule_request"("id");



CREATE POLICY "billing_customer_insert" ON "billing"."customer" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "billing_customer_select" ON "billing"."customer" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "billing_customer_update" ON "billing"."customer" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "billing_subscription_insert" ON "billing"."subscription" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "billing_subscription_select" ON "billing"."subscription" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "billing_subscription_update" ON "billing"."subscription" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "billing"."customer" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."payment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."subscription" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commercial_profile_insert" ON "commercial"."profile" FOR INSERT WITH CHECK (true);



CREATE POLICY "commercial_profile_select" ON "commercial"."profile" FOR SELECT USING (true);



CREATE POLICY "commercial_profile_update" ON "commercial"."profile" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "commercial"."operator_tier" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operator_tier_select" ON "commercial"."operator_tier" FOR SELECT USING (true);



ALTER TABLE "commercial"."profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."asset" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."asset_assignment" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_assignment_insert_admin" ON "core"."asset_assignment" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "asset_assignment_select_access" ON "core"."asset_assignment" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "asset_assignment_update_admin" ON "core"."asset_assignment" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."asset_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_audit_insert_admin" ON "core"."asset_audit" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "asset_audit_select_access" ON "core"."asset_audit" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "asset_delete_admin" ON "core"."asset" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."asset_event" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_event_insert_admin" ON "core"."asset_event" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "asset_event_select_access" ON "core"."asset_event" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "asset_insert_admin" ON "core"."asset" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."asset_provider" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_provider_insert_admin" ON "core"."asset_provider" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "asset_provider_select_access" ON "core"."asset_provider" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "asset_provider_update_admin" ON "core"."asset_provider" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "asset_select_access" ON "core"."asset" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



ALTER TABLE "core"."asset_status" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_status_select_authenticated" ON "core"."asset_status" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR "core"."is_platform_owner"()));



ALTER TABLE "core"."asset_type" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_type_select_authenticated" ON "core"."asset_type" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR "core"."is_platform_owner"()));



CREATE POLICY "asset_update_admin" ON "core"."asset" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."automation_credential" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."automation_profile" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_profile_select_access" ON "core"."automation_profile" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "automation_profile_update_admin" ON "core"."automation_profile" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."candidate_checklist_item_type" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "candidate_checklist_item_type_select_authenticated" ON "core"."candidate_checklist_item_type" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR "core"."is_platform_owner"()));



ALTER TABLE "core"."candidate_stage_type" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "candidate_stage_type_select_authenticated" ON "core"."candidate_stage_type" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR "core"."is_platform_owner"()));



ALTER TABLE "core"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_select_access" ON "core"."companies" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("id")));



CREATE POLICY "companies_update_admin" ON "core"."companies" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("id")));



ALTER TABLE "core"."company_candidate_checklist_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_candidate_checklist_config_delete_admin" ON "core"."company_candidate_checklist_config" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_candidate_checklist_config_insert_admin" ON "core"."company_candidate_checklist_config" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_candidate_checklist_config_select_access" ON "core"."company_candidate_checklist_config" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "company_candidate_checklist_config_update_admin" ON "core"."company_candidate_checklist_config" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."company_candidate_stage_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_candidate_stage_config_delete_admin" ON "core"."company_candidate_stage_config" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_candidate_stage_config_insert_admin" ON "core"."company_candidate_stage_config" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_candidate_stage_config_select_access" ON "core"."company_candidate_stage_config" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "company_candidate_stage_config_update_admin" ON "core"."company_candidate_stage_config" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."company_contract_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_contract_config_insert" ON "core"."company_contract_config" FOR INSERT TO "authenticated" WITH CHECK ("core"."can_admin_company"("company_id"));



CREATE POLICY "company_contract_config_select" ON "core"."company_contract_config" FOR SELECT TO "authenticated" USING ("core"."can_access_company"("company_id"));



CREATE POLICY "company_contract_config_update" ON "core"."company_contract_config" FOR UPDATE TO "authenticated" USING ("core"."can_admin_company"("company_id")) WITH CHECK ("core"."can_admin_company"("company_id"));



ALTER TABLE "core"."company_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_invites_insert_admin" ON "core"."company_invites" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_invites_select_access" ON "core"."company_invites" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "company_invites_update_admin" ON "core"."company_invites" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."company_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_memberships_delete_admin" ON "core"."company_memberships" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_memberships_insert_admin" ON "core"."company_memberships" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_memberships_select_access" ON "core"."company_memberships" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR "core"."can_access_company"("company_id")));



CREATE POLICY "company_memberships_update_admin" ON "core"."company_memberships" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."company_onboardings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_onboardings_insert_admin" ON "core"."company_onboardings" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_onboardings_select_access" ON "core"."company_onboardings" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR "core"."can_access_company"("company_id")));



CREATE POLICY "company_onboardings_update_admin" ON "core"."company_onboardings" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."company_operations_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."company_person_compensation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."company_roster" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."company_roster_compliance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_roster_delete_admin" ON "core"."company_roster" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."company_roster_document_file" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."company_roster_dsw_alias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."company_roster_event" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_roster_event_insert_admin" ON "core"."company_roster_event" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_roster_event_select_access" ON "core"."company_roster_event" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



ALTER TABLE "core"."company_roster_identifier" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_roster_identifier_delete_admin" ON "core"."company_roster_identifier" FOR DELETE TO "authenticated" USING ("core"."can_manage_roster_member"("roster_id"));



CREATE POLICY "company_roster_identifier_insert_admin" ON "core"."company_roster_identifier" FOR INSERT TO "authenticated" WITH CHECK ("core"."can_manage_roster_member"("roster_id"));



CREATE POLICY "company_roster_identifier_select_access" ON "core"."company_roster_identifier" FOR SELECT TO "authenticated" USING ("core"."can_access_roster_member"("roster_id"));



CREATE POLICY "company_roster_identifier_update_admin" ON "core"."company_roster_identifier" FOR UPDATE TO "authenticated" USING ("core"."can_manage_roster_member"("roster_id")) WITH CHECK ("core"."can_manage_roster_member"("roster_id"));



CREATE POLICY "company_roster_insert_admin" ON "core"."company_roster" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."company_roster_operations_fact" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_roster_operations_fact_insert" ON "core"."company_roster_operations_fact" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."id" = "company_roster_operations_fact"."roster_id") AND "core"."can_admin_company"("r"."company_id")))));



CREATE POLICY "company_roster_operations_fact_select" ON "core"."company_roster_operations_fact" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."id" = "company_roster_operations_fact"."roster_id") AND "core"."can_access_company"("r"."company_id")))));



CREATE POLICY "company_roster_operations_fact_update" ON "core"."company_roster_operations_fact" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."id" = "company_roster_operations_fact"."roster_id") AND "core"."can_admin_company"("r"."company_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."id" = "company_roster_operations_fact"."roster_id") AND "core"."can_admin_company"("r"."company_id")))));



CREATE POLICY "company_roster_select_access" ON "core"."company_roster" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id") OR ("profile_id" = "core"."current_profile_id"())));



ALTER TABLE "core"."company_roster_trainee_pay_override" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_roster_trainee_pay_override_insert_admin" ON "core"."company_roster_trainee_pay_override" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_roster_trainee_pay_override_select_access" ON "core"."company_roster_trainee_pay_override" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id") OR "core"."can_access_roster_member"("roster_id")));



CREATE POLICY "company_roster_trainee_pay_override_update_admin" ON "core"."company_roster_trainee_pay_override" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_roster_update_admin" ON "core"."company_roster" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."company_user_grant" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_user_grant_delete_admin" ON "core"."company_user_grant" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_user_grant_insert_admin" ON "core"."company_user_grant" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "company_user_grant_select_access" ON "core"."company_user_grant" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR "core"."can_access_company"("company_id")));



CREATE POLICY "company_user_grant_update_admin" ON "core"."company_user_grant" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."compliance_document_type" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."data_rebuild_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."dispatch_day" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dispatch_day_delete" ON "core"."dispatch_day" FOR DELETE TO "authenticated" USING ("core"."can_admin_company"("company_id"));



CREATE POLICY "dispatch_day_insert" ON "core"."dispatch_day" FOR INSERT TO "authenticated" WITH CHECK ("core"."can_admin_company"("company_id"));



CREATE POLICY "dispatch_day_select" ON "core"."dispatch_day" FOR SELECT TO "authenticated" USING ("core"."can_access_company"("company_id"));



CREATE POLICY "dispatch_day_update" ON "core"."dispatch_day" FOR UPDATE TO "authenticated" USING ("core"."can_admin_company"("company_id")) WITH CHECK ("core"."can_admin_company"("company_id"));



ALTER TABLE "core"."dispatch_event" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dispatch_event_delete" ON "core"."dispatch_event" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "core"."dispatch_day" "d"
  WHERE (("d"."id" = "dispatch_event"."dispatch_day_id") AND "core"."can_admin_company"("d"."company_id")))));



CREATE POLICY "dispatch_event_insert" ON "core"."dispatch_event" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "core"."dispatch_day" "d"
  WHERE (("d"."id" = "dispatch_event"."dispatch_day_id") AND "core"."can_admin_company"("d"."company_id")))));



CREATE POLICY "dispatch_event_select" ON "core"."dispatch_event" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "core"."dispatch_day" "d"
  WHERE (("d"."id" = "dispatch_event"."dispatch_day_id") AND "core"."can_access_company"("d"."company_id")))));



ALTER TABLE "core"."dispatch_event_type" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dispatch_event_update" ON "core"."dispatch_event" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "core"."dispatch_day" "d"
  WHERE (("d"."id" = "dispatch_event"."dispatch_day_id") AND "core"."can_admin_company"("d"."company_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "core"."dispatch_day" "d"
  WHERE (("d"."id" = "dispatch_event"."dispatch_day_id") AND "core"."can_admin_company"("d"."company_id")))));



ALTER TABLE "core"."driver_activity_event" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "driver_activity_event_select_access" ON "core"."driver_activity_event" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id") OR ("profile_id" = "core"."current_profile_id"()) OR (("roster_member_id" IS NOT NULL) AND "core"."can_access_roster_member"("roster_member_id"))));



ALTER TABLE "core"."driver_activity_event_type" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "driver_activity_event_type_select_authenticated" ON "core"."driver_activity_event_type" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR "core"."is_platform_owner"()));



ALTER TABLE "core"."driver_activity_signal" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "driver_activity_signal_select_access" ON "core"."driver_activity_signal" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id") OR ("profile_id" = "core"."current_profile_id"()) OR (("roster_member_id" IS NOT NULL) AND "core"."can_access_roster_member"("roster_member_id"))));



ALTER TABLE "core"."driver_breadcrumb_point" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "driver_breadcrumb_point_select_access" ON "core"."driver_breadcrumb_point" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id") OR ("profile_id" = "core"."current_profile_id"()) OR (("roster_member_id" IS NOT NULL) AND "core"."can_access_roster_member"("roster_member_id"))));



ALTER TABLE "core"."operations_automation_run" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operations_automation_run_select_access" ON "core"."operations_automation_run" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



ALTER TABLE "core"."operations_automation_schedule_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operations_automation_schedule_config_select_access" ON "core"."operations_automation_schedule_config" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "operations_automation_schedule_config_update_admin" ON "core"."operations_automation_schedule_config" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."operations_collection_artifact" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operations_collection_artifact_select_access" ON "core"."operations_collection_artifact" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



ALTER TABLE "core"."operations_collection_order" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."operations_collection_request" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operations_collection_request_insert_admin" ON "core"."operations_collection_request" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "operations_collection_request_select_access" ON "core"."operations_collection_request" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "operations_collection_request_update_admin" ON "core"."operations_collection_request" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."operations_legacy_dsw_import_stage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."operations_mileage_audit_review" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."operations_mileage_correction_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."operations_report_batch" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."operations_report_family" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."operations_report_raw_row" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."operations_report_shape" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."operations_report_summary_row" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."payroll_activity_fact" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_activity_fact_select_access" ON "core"."payroll_activity_fact" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id") OR (("roster_member_id" IS NOT NULL) AND "core"."can_access_roster_member"("roster_member_id"))));



ALTER TABLE "core"."payroll_adjustment_event" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_adjustment_event_insert_admin" ON "core"."payroll_adjustment_event" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



CREATE POLICY "payroll_adjustment_event_select_access" ON "core"."payroll_adjustment_event" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id")));



CREATE POLICY "payroll_adjustment_event_update_admin" ON "core"."payroll_adjustment_event" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id")));



ALTER TABLE "core"."payroll_adjustment_target" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_adjustment_target_insert_admin" ON "core"."payroll_adjustment_target" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_manage_roster_member"("roster_member_id") OR (EXISTS ( SELECT 1
   FROM "core"."payroll_adjustment_event" "e"
  WHERE (("e"."id" = "payroll_adjustment_target"."adjustment_event_id") AND "core"."can_admin_company"("e"."company_id"))))));



CREATE POLICY "payroll_adjustment_target_select_access" ON "core"."payroll_adjustment_target" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_roster_member"("roster_member_id") OR (EXISTS ( SELECT 1
   FROM "core"."payroll_adjustment_event" "e"
  WHERE (("e"."id" = "payroll_adjustment_target"."adjustment_event_id") AND "core"."can_access_company"("e"."company_id"))))));



CREATE POLICY "payroll_adjustment_target_update_admin" ON "core"."payroll_adjustment_target" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_manage_roster_member"("roster_member_id") OR (EXISTS ( SELECT 1
   FROM "core"."payroll_adjustment_event" "e"
  WHERE (("e"."id" = "payroll_adjustment_target"."adjustment_event_id") AND "core"."can_admin_company"("e"."company_id")))))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_manage_roster_member"("roster_member_id") OR (EXISTS ( SELECT 1
   FROM "core"."payroll_adjustment_event" "e"
  WHERE (("e"."id" = "payroll_adjustment_target"."adjustment_event_id") AND "core"."can_admin_company"("e"."company_id"))))));



CREATE POLICY "platform_owner_full_access_companies" ON "core"."companies" USING ("core"."is_platform_owner"()) WITH CHECK ("core"."is_platform_owner"());



CREATE POLICY "platform_owner_full_access_company_invites" ON "core"."company_invites" USING ("core"."is_platform_owner"()) WITH CHECK ("core"."is_platform_owner"());



CREATE POLICY "platform_owner_full_access_company_memberships" ON "core"."company_memberships" USING ("core"."is_platform_owner"()) WITH CHECK ("core"."is_platform_owner"());



CREATE POLICY "platform_owner_full_access_company_onboardings" ON "core"."company_onboardings" USING ("core"."is_platform_owner"()) WITH CHECK ("core"."is_platform_owner"());



CREATE POLICY "platform_owner_full_access_profiles" ON "core"."profiles" USING ("core"."is_platform_owner"()) WITH CHECK ("core"."is_platform_owner"());



ALTER TABLE "core"."profile_document" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."profile_driver_license" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_driver_license_delete_admin" ON "core"."profile_driver_license" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_driver_license"."profile_id") AND "core"."can_admin_company"("r"."company_id"))))));



CREATE POLICY "profile_driver_license_insert_admin" ON "core"."profile_driver_license" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_driver_license"."profile_id") AND "core"."can_admin_company"("r"."company_id"))))));



CREATE POLICY "profile_driver_license_select_access" ON "core"."profile_driver_license" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_driver_license"."profile_id") AND "core"."can_access_company"("r"."company_id"))))));



CREATE POLICY "profile_driver_license_update_admin" ON "core"."profile_driver_license" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_driver_license"."profile_id") AND "core"."can_admin_company"("r"."company_id")))))) WITH CHECK (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_driver_license"."profile_id") AND "core"."can_admin_company"("r"."company_id"))))));



ALTER TABLE "core"."profile_private_fact" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_private_fact_delete_admin" ON "core"."profile_private_fact" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_private_fact"."profile_id") AND "core"."can_admin_company"("r"."company_id"))))));



CREATE POLICY "profile_private_fact_insert_admin" ON "core"."profile_private_fact" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_private_fact"."profile_id") AND "core"."can_admin_company"("r"."company_id"))))));



CREATE POLICY "profile_private_fact_select_access" ON "core"."profile_private_fact" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_private_fact"."profile_id") AND "core"."can_access_company"("r"."company_id"))))));



CREATE POLICY "profile_private_fact_update_admin" ON "core"."profile_private_fact" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_private_fact"."profile_id") AND "core"."can_admin_company"("r"."company_id")))))) WITH CHECK (("core"."is_platform_owner"() OR ("profile_id" = "core"."current_profile_id"()) OR (EXISTS ( SELECT 1
   FROM "core"."company_roster" "r"
  WHERE (("r"."profile_id" = "profile_private_fact"."profile_id") AND "core"."can_admin_company"("r"."company_id"))))));



ALTER TABLE "core"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_self_select" ON "core"."profiles" FOR SELECT TO "authenticated" USING (("auth_user_id" = "auth"."uid"()));



ALTER TABLE "core"."roster_candidate_checklist_fact" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roster_candidate_checklist_fact_delete_admin" ON "core"."roster_candidate_checklist_fact" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id") OR "core"."can_manage_roster_member"("roster_id")));



CREATE POLICY "roster_candidate_checklist_fact_insert_admin" ON "core"."roster_candidate_checklist_fact" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id") OR "core"."can_manage_roster_member"("roster_id")));



CREATE POLICY "roster_candidate_checklist_fact_select_access" ON "core"."roster_candidate_checklist_fact" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id") OR "core"."can_access_roster_member"("roster_id")));



CREATE POLICY "roster_candidate_checklist_fact_update_admin" ON "core"."roster_candidate_checklist_fact" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id") OR "core"."can_manage_roster_member"("roster_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id") OR "core"."can_manage_roster_member"("roster_id")));



ALTER TABLE "core"."roster_candidate_stage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roster_candidate_stage_delete_admin" ON "core"."roster_candidate_stage" FOR DELETE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id") OR "core"."can_manage_roster_member"("roster_id")));



CREATE POLICY "roster_candidate_stage_insert_admin" ON "core"."roster_candidate_stage" FOR INSERT TO "authenticated" WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id") OR "core"."can_manage_roster_member"("roster_id")));



CREATE POLICY "roster_candidate_stage_select_access" ON "core"."roster_candidate_stage" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_access_company"("company_id") OR "core"."can_access_roster_member"("roster_id")));



CREATE POLICY "roster_candidate_stage_update_admin" ON "core"."roster_candidate_stage" FOR UPDATE TO "authenticated" USING (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id") OR "core"."can_manage_roster_member"("roster_id"))) WITH CHECK (("core"."is_platform_owner"() OR "core"."can_admin_company"("company_id") OR "core"."can_manage_roster_member"("roster_id")));



ALTER TABLE "core"."roster_compliance_requirement" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."roster_compliance_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "core"."walk_on_driver" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "legal"."document" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "legal"."document_acceptance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "legal"."document_section" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "legal"."document_section_note" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "legal"."document_section_revision" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "legal_document_section_select_published" ON "legal"."document_section" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR ("status" = 'published'::"text")));



CREATE POLICY "legal_document_select_published" ON "legal"."document" FOR SELECT TO "authenticated" USING (("core"."is_platform_owner"() OR ("status" = 'published'::"text")));



ALTER TABLE "public"."company_terminal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_time_off_request" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "driver_time_off_request_insert_own_roster" ON "public"."driver_time_off_request" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."company_roster_view" "crv"
     JOIN "core"."profiles" "p" ON (("p"."id" = "crv"."profile_id")))
  WHERE (("p"."auth_user_id" = "auth"."uid"()) AND ("crv"."company_id" = "driver_time_off_request"."company_id") AND ("crv"."roster_member_id" = "driver_time_off_request"."roster_member_id")))));



CREATE POLICY "driver_time_off_request_select_company" ON "public"."driver_time_off_request" FOR SELECT TO "authenticated" USING ("core"."can_access_company"("company_id"));



CREATE POLICY "driver_time_off_request_select_own_roster" ON "public"."driver_time_off_request" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."company_roster_view" "crv"
     JOIN "core"."profiles" "p" ON (("p"."id" = "crv"."profile_id")))
  WHERE (("p"."auth_user_id" = "auth"."uid"()) AND ("crv"."company_id" = "driver_time_off_request"."company_id") AND ("crv"."roster_member_id" = "driver_time_off_request"."roster_member_id")))));



CREATE POLICY "driver_time_off_request_update_company" ON "public"."driver_time_off_request" FOR UPDATE TO "authenticated" USING ("core"."can_admin_company"("company_id")) WITH CHECK ("core"."can_admin_company"("company_id"));



ALTER TABLE "public"."hiring_invite_token" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_session" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "onboarding_session_delete" ON "public"."onboarding_session" FOR DELETE TO "authenticated" USING ("core"."can_admin_company"("company_id"));



CREATE POLICY "onboarding_session_insert" ON "public"."onboarding_session" FOR INSERT TO "authenticated" WITH CHECK ("core"."can_admin_company"("company_id"));



CREATE POLICY "onboarding_session_select" ON "public"."onboarding_session" FOR SELECT TO "authenticated" USING ("core"."can_access_company"("company_id"));



CREATE POLICY "onboarding_session_update" ON "public"."onboarding_session" FOR UPDATE TO "authenticated" USING ("core"."can_admin_company"("company_id")) WITH CHECK ("core"."can_admin_company"("company_id"));



ALTER TABLE "public"."onboarding_step" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_step_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "onboarding_step_select" ON "public"."onboarding_step" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."person" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."route_baseline" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "route_baseline_delete" ON "public"."route_baseline" FOR DELETE TO "authenticated" USING ("core"."can_admin_company"("company_id"));



CREATE POLICY "route_baseline_insert" ON "public"."route_baseline" FOR INSERT TO "authenticated" WITH CHECK ("core"."can_admin_company"("company_id"));



CREATE POLICY "route_baseline_select" ON "public"."route_baseline" FOR SELECT TO "authenticated" USING ("core"."can_access_company"("company_id"));



CREATE POLICY "route_baseline_update" ON "public"."route_baseline" FOR UPDATE TO "authenticated" USING ("core"."can_admin_company"("company_id")) WITH CHECK ("core"."can_admin_company"("company_id"));



ALTER TABLE "public"."schedule_baseline" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedule_baseline_delete" ON "public"."schedule_baseline" FOR DELETE TO "authenticated" USING ("core"."can_admin_company"("company_id"));



CREATE POLICY "schedule_baseline_insert" ON "public"."schedule_baseline" FOR INSERT TO "authenticated" WITH CHECK ("core"."can_admin_company"("company_id"));



CREATE POLICY "schedule_baseline_select" ON "public"."schedule_baseline" FOR SELECT TO "authenticated" USING ("core"."can_access_company"("company_id"));



CREATE POLICY "schedule_baseline_update" ON "public"."schedule_baseline" FOR UPDATE TO "authenticated" USING ("core"."can_admin_company"("company_id")) WITH CHECK ("core"."can_admin_company"("company_id"));



ALTER TABLE "public"."schedule_day_fact" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedule_day_fact_delete" ON "public"."schedule_day_fact" FOR DELETE TO "authenticated" USING ("core"."can_admin_company"("company_id"));



CREATE POLICY "schedule_day_fact_insert" ON "public"."schedule_day_fact" FOR INSERT TO "authenticated" WITH CHECK ("core"."can_admin_company"("company_id"));



CREATE POLICY "schedule_day_fact_select" ON "public"."schedule_day_fact" FOR SELECT TO "authenticated" USING ("core"."can_access_company"("company_id"));



CREATE POLICY "schedule_day_fact_update" ON "public"."schedule_day_fact" FOR UPDATE TO "authenticated" USING ("core"."can_admin_company"("company_id")) WITH CHECK ("core"."can_admin_company"("company_id"));



ALTER TABLE "public"."schedule_override" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedule_override_delete" ON "public"."schedule_override" FOR DELETE TO "authenticated" USING ("core"."can_admin_company"("company_id"));



CREATE POLICY "schedule_override_insert" ON "public"."schedule_override" FOR INSERT TO "authenticated" WITH CHECK ("core"."can_admin_company"("company_id"));



CREATE POLICY "schedule_override_select" ON "public"."schedule_override" FOR SELECT TO "authenticated" USING ("core"."can_access_company"("company_id"));



CREATE POLICY "schedule_override_update" ON "public"."schedule_override" FOR UPDATE TO "authenticated" USING ("core"."can_admin_company"("company_id")) WITH CHECK ("core"."can_admin_company"("company_id"));



ALTER TABLE "public"."schedule_preset" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedule_preset_delete" ON "public"."schedule_preset" FOR DELETE TO "authenticated" USING ("core"."can_admin_company"("company_id"));



CREATE POLICY "schedule_preset_insert" ON "public"."schedule_preset" FOR INSERT TO "authenticated" WITH CHECK ("core"."can_admin_company"("company_id"));



CREATE POLICY "schedule_preset_select" ON "public"."schedule_preset" FOR SELECT TO "authenticated" USING ("core"."can_access_company"("company_id"));



CREATE POLICY "schedule_preset_update" ON "public"."schedule_preset" FOR UPDATE TO "authenticated" USING ("core"."can_admin_company"("company_id")) WITH CHECK ("core"."can_admin_company"("company_id"));



ALTER TABLE "public"."schedule_request" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_request_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedule_request_activity_insert" ON "public"."schedule_request_activity" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."schedule_request" "r"
  WHERE (("r"."id" = "schedule_request_activity"."request_id") AND "core"."can_access_company"("r"."company_id")))));



CREATE POLICY "schedule_request_activity_select" ON "public"."schedule_request_activity" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."schedule_request" "r"
  WHERE (("r"."id" = "schedule_request_activity"."request_id") AND "core"."can_access_company"("r"."company_id")))));



ALTER TABLE "public"."schedule_request_cover_offer" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedule_request_cover_offer_insert" ON "public"."schedule_request_cover_offer" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."schedule_request" "r"
  WHERE (("r"."id" = "schedule_request_cover_offer"."request_id") AND "core"."can_access_company"("r"."company_id")))));



CREATE POLICY "schedule_request_cover_offer_select" ON "public"."schedule_request_cover_offer" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."schedule_request" "r"
  WHERE (("r"."id" = "schedule_request_cover_offer"."request_id") AND "core"."can_access_company"("r"."company_id")))));



CREATE POLICY "schedule_request_cover_offer_update" ON "public"."schedule_request_cover_offer" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."schedule_request" "r"
  WHERE (("r"."id" = "schedule_request_cover_offer"."request_id") AND "core"."can_access_company"("r"."company_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."schedule_request" "r"
  WHERE (("r"."id" = "schedule_request_cover_offer"."request_id") AND "core"."can_access_company"("r"."company_id")))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "billing" TO "authenticated";
GRANT USAGE ON SCHEMA "billing" TO "service_role";



GRANT USAGE ON SCHEMA "commercial" TO "authenticated";
GRANT USAGE ON SCHEMA "commercial" TO "service_role";



GRANT USAGE ON SCHEMA "core" TO "authenticated";



GRANT USAGE ON SCHEMA "legal" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "billing"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "commercial"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "core"."access_context"() TO "authenticated";



GRANT ALL ON FUNCTION "core"."can_access_company"("p_company_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "core"."can_admin_company"("p_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "core"."can_read_company_data"("p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "core"."can_read_company_data"("p_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "core"."current_profile"() TO "authenticated";



GRANT ALL ON FUNCTION "core"."current_profile_id"() TO "authenticated";



GRANT ALL ON FUNCTION "core"."ensure_access_context"() TO "authenticated";



GRANT ALL ON FUNCTION "core"."get_company_operations_config"("p_company_slug" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "core"."get_company_operations_history_internal"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "core"."get_company_operations_history_internal"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "core"."get_company_operations_history_years_internal"("p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "core"."get_company_operations_history_years_internal"("p_company_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "core"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "core"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "core"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "core"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "core"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "core"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "core"."update_company_operations_config"("p_company_slug" "text", "p_route_sort_key" "text", "p_route_sort_direction" "text") TO "authenticated";



GRANT ALL ON FUNCTION "core"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") TO "authenticated";



GRANT ALL ON FUNCTION "core"."update_company_roster_note"("p_company_slug" "text", "p_roster_id" "uuid", "p_note" "text") TO "authenticated";

























































































































































REVOKE ALL ON FUNCTION "public"."access_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."access_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."access_context"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_operations_mileage_heal"("p_company_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date", "p_corrected_by_profile_id" "uuid", "p_min_sample_size" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_operations_mileage_heal"("p_company_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date", "p_corrected_by_profile_id" "uuid", "p_min_sample_size" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_operations_mileage_heal"("p_company_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date", "p_corrected_by_profile_id" "uuid", "p_min_sample_size" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_roster_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_roster_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_roster_member_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."candidate_checklist_set_item"("p_company_slug" "text", "p_roster_id" "uuid", "p_item_key" "text", "p_is_complete" boolean, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."candidate_checklist_set_item"("p_company_slug" "text", "p_roster_id" "uuid", "p_item_key" "text", "p_is_complete" boolean, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."candidate_checklist_set_item"("p_company_slug" "text", "p_roster_id" "uuid", "p_item_key" "text", "p_is_complete" boolean, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."candidate_stage_set"("p_company_slug" "text", "p_roster_id" "uuid", "p_stage_key" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."candidate_stage_set"("p_company_slug" "text", "p_roster_id" "uuid", "p_stage_key" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."candidate_stage_set"("p_company_slug" "text", "p_roster_id" "uuid", "p_stage_key" "text", "p_note" "text") TO "service_role";



GRANT SELECT ON TABLE "core"."companies" TO "authenticated";
GRANT SELECT ON TABLE "core"."companies" TO "service_role";



GRANT SELECT ON TABLE "core"."operations_collection_request" TO "authenticated";
GRANT SELECT ON TABLE "core"."operations_collection_request" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."operations_collection_request_v" TO "anon";
GRANT ALL ON TABLE "public"."operations_collection_request_v" TO "authenticated";
GRANT ALL ON TABLE "public"."operations_collection_request_v" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_operations_collection_request"("p_runner_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_operations_collection_request"("p_runner_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_effective_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_effective_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_effective_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_onboarding_session"("p_session_id" "uuid", "p_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_onboarding_session"("p_session_id" "uuid", "p_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_onboarding_session"("p_session_id" "uuid", "p_auth_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_company_candidate_from_overlay"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_note" "text", "p_date_of_birth" "date", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_start_date" "date", "p_end_date" "date", "p_fx_id" "text", "p_dswid" "text", "p_dot_expiration_date" "date", "p_qual_cert_expiration_date" "date", "p_daily_pay_rate" numeric, "p_invite_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_company_candidate_from_overlay"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_note" "text", "p_date_of_birth" "date", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_start_date" "date", "p_end_date" "date", "p_fx_id" "text", "p_dswid" "text", "p_dot_expiration_date" "date", "p_qual_cert_expiration_date" "date", "p_daily_pay_rate" numeric, "p_invite_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_company_candidate_from_overlay"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_note" "text", "p_date_of_birth" "date", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_start_date" "date", "p_end_date" "date", "p_fx_id" "text", "p_dswid" "text", "p_dot_expiration_date" "date", "p_qual_cert_expiration_date" "date", "p_daily_pay_rate" numeric, "p_invite_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_company_payroll_adjustment"("p_company_slug" "text", "p_adjustment_key" "text", "p_adjustment_label" "text", "p_adjustment_scope" "text", "p_start_date" "date", "p_end_date" "date", "p_amount" numeric, "p_amount_mode" "text", "p_notes" "text", "p_roster_member_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_company_payroll_adjustment"("p_company_slug" "text", "p_adjustment_key" "text", "p_adjustment_label" "text", "p_adjustment_scope" "text", "p_start_date" "date", "p_end_date" "date", "p_amount" numeric, "p_amount_mode" "text", "p_notes" "text", "p_roster_member_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_company_payroll_adjustment"("p_company_slug" "text", "p_adjustment_key" "text", "p_adjustment_label" "text", "p_adjustment_scope" "text", "p_start_date" "date", "p_end_date" "date", "p_amount" numeric, "p_amount_mode" "text", "p_notes" "text", "p_roster_member_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_operations_collection_request"("p_company_slug" "text", "p_request_type" "text", "p_service_date" "date", "p_service_date_start" "date", "p_service_date_end" "date", "p_requested_reports" "text"[], "p_request_payload" "jsonb", "p_priority" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_operations_collection_request"("p_company_slug" "text", "p_request_type" "text", "p_service_date" "date", "p_service_date_start" "date", "p_service_date_end" "date", "p_requested_reports" "text"[], "p_request_payload" "jsonb", "p_priority" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_operations_collection_request"("p_company_slug" "text", "p_request_type" "text", "p_service_date" "date", "p_service_date_start" "date", "p_service_date_end" "date", "p_requested_reports" "text"[], "p_request_payload" "jsonb", "p_priority" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_roster_dsw_alias"("p_company_id" "uuid", "p_roster_id" "uuid", "p_alias_text" "text", "p_created_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_roster_dsw_alias"("p_company_id" "uuid", "p_roster_id" "uuid", "p_alias_text" "text", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_roster_dsw_alias"("p_company_id" "uuid", "p_roster_id" "uuid", "p_alias_text" "text", "p_created_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_walk_on_roster_candidate"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_walk_on_roster_candidate"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_walk_on_roster_candidate"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_profile_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_profile_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_profile_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_event_types"("p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_event_types"("p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_event_types"("p_company_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_get_or_create_day"("p_company_id" "uuid", "p_dispatch_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_get_or_create_day"("p_company_id" "uuid", "p_dispatch_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_get_or_create_day"("p_company_id" "uuid", "p_dispatch_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_lock_day"("p_company_id" "uuid", "p_dispatch_date" "date", "p_snapshot_json" "jsonb", "p_locked_by_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_lock_day"("p_company_id" "uuid", "p_dispatch_date" "date", "p_snapshot_json" "jsonb", "p_locked_by_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_lock_day"("p_company_id" "uuid", "p_dispatch_date" "date", "p_snapshot_json" "jsonb", "p_locked_by_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_record_event"("p_company_id" "uuid", "p_dispatch_date" "date", "p_event_code" "text", "p_event_label" "text", "p_event_category" "text", "p_route_key" "text", "p_route_label" "text", "p_seat" "text", "p_person_roster_member_id" "uuid", "p_person_name" "text", "p_from_route_key" "text", "p_from_route_label" "text", "p_to_route_key" "text", "p_to_route_label" "text", "p_note" "text", "p_event_payload" "jsonb", "p_created_by_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_record_event"("p_company_id" "uuid", "p_dispatch_date" "date", "p_event_code" "text", "p_event_label" "text", "p_event_category" "text", "p_route_key" "text", "p_route_label" "text", "p_seat" "text", "p_person_roster_member_id" "uuid", "p_person_name" "text", "p_from_route_key" "text", "p_from_route_label" "text", "p_to_route_key" "text", "p_to_route_label" "text", "p_note" "text", "p_event_payload" "jsonb", "p_created_by_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_record_event"("p_company_id" "uuid", "p_dispatch_date" "date", "p_event_code" "text", "p_event_label" "text", "p_event_category" "text", "p_route_key" "text", "p_route_label" "text", "p_seat" "text", "p_person_roster_member_id" "uuid", "p_person_name" "text", "p_from_route_key" "text", "p_from_route_label" "text", "p_to_route_key" "text", "p_to_route_label" "text", "p_note" "text", "p_event_payload" "jsonb", "p_created_by_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_access_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_access_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_access_context"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text", "p_batch_id" "uuid", "p_inserted_rows" integer, "p_matched_rows" integer, "p_unmatched_rows" integer, "p_error_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text", "p_batch_id" "uuid", "p_inserted_rows" integer, "p_matched_rows" integer, "p_unmatched_rows" integer, "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text", "p_batch_id" "uuid", "p_inserted_rows" integer, "p_matched_rows" integer, "p_unmatched_rows" integer, "p_error_message" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text", "p_batch_id" "uuid", "p_inserted_rows" integer, "p_matched_rows" integer, "p_unmatched_rows" integer, "p_error_message" "text", "p_route_count" integer, "p_summary_rows" integer, "p_download_ms" integer, "p_ingest_ms" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text", "p_batch_id" "uuid", "p_inserted_rows" integer, "p_matched_rows" integer, "p_unmatched_rows" integer, "p_error_message" "text", "p_route_count" integer, "p_summary_rows" integer, "p_download_ms" integer, "p_ingest_ms" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finish_operations_automation_run"("p_run_id" "uuid", "p_status" "text", "p_source_filename" "text", "p_batch_id" "uuid", "p_inserted_rows" integer, "p_matched_rows" integer, "p_unmatched_rows" integer, "p_error_message" "text", "p_route_count" integer, "p_summary_rows" integer, "p_download_ms" integer, "p_ingest_ms" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_active_company_contract_config"("p_company_slug" "text", "p_service_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_company_contract_config"("p_company_slug" "text", "p_service_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_company_contract_config"("p_company_slug" "text", "p_service_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_automation_credential"("p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_automation_credential"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_automation_credential"("p_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_automation_credential_for_verify"("p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_automation_credential_for_verify"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_automation_credential_for_verify"("p_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_company_access_config"("p_company_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_company_access_config"("p_company_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_access_config"("p_company_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_company_operations_config"("p_company_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_company_operations_config"("p_company_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_operations_config"("p_company_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_company_operations_history"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_company_operations_history"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_operations_history"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_company_operations_history_years"("p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_company_operations_history_years"("p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_operations_history_years"("p_company_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_daily_operations_calendar"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_operations_calendar"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_operations_calendar"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_daily_operations_summary"("p_company_id" "uuid", "p_service_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_operations_summary"("p_company_id" "uuid", "p_service_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_operations_summary"("p_company_id" "uuid", "p_service_date" "date") TO "service_role";



GRANT SELECT ON TABLE "core"."operations_automation_schedule_config" TO "authenticated";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."operations_automation_schedule_config_v" TO "anon";
GRANT ALL ON TABLE "public"."operations_automation_schedule_config_v" TO "authenticated";
GRANT ALL ON TABLE "public"."operations_automation_schedule_config_v" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_automation_schedule_config"("p_company_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_automation_schedule_config"("p_company_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_automation_schedule_config"("p_company_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_dro_plan_rows"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_dro_plan_rows"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_dro_plan_rows"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_dsw_current_rows"("p_company_id" "uuid", "p_service_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_dsw_current_rows"("p_company_id" "uuid", "p_service_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_dsw_current_rows"("p_company_id" "uuid", "p_service_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_dsw_service_snapshot"("p_company_id" "uuid", "p_service_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_dsw_service_snapshot"("p_company_id" "uuid", "p_service_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_dsw_service_snapshot"("p_company_id" "uuid", "p_service_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_fcc_current_rows"("p_company_id" "uuid", "p_service_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_fcc_current_rows"("p_company_id" "uuid", "p_service_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_fcc_current_rows"("p_company_id" "uuid", "p_service_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_intelligence_route_history"("p_company_id" "uuid", "p_service_dates" "date"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_intelligence_route_history"("p_company_id" "uuid", "p_service_dates" "date"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_intelligence_route_history"("p_company_id" "uuid", "p_service_dates" "date"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_mileage_audit"("p_company_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_mileage_audit"("p_company_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_mileage_audit"("p_company_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_operations_planning_snapshot"("p_company_id" "uuid", "p_service_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_operations_planning_snapshot"("p_company_id" "uuid", "p_service_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_planning_snapshot"("p_company_id" "uuid", "p_service_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_planning_trends"("p_company_id" "uuid", "p_service_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_planning_trends"("p_company_id" "uuid", "p_service_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_planning_trends"("p_company_id" "uuid", "p_service_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_prior_day_dsw_summary"("p_company_id" "uuid", "p_service_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_prior_day_dsw_summary"("p_company_id" "uuid", "p_service_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_prior_day_dsw_summary"("p_company_id" "uuid", "p_service_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_prior_day_summary"("p_company_id" "uuid", "p_service_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_prior_day_summary"("p_company_id" "uuid", "p_service_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_prior_day_summary"("p_company_id" "uuid", "p_service_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_operations_report_batch_feed"("p_company_id" "uuid", "p_report_family_key" "text", "p_service_dates" "date"[], "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_operations_report_batch_feed"("p_company_id" "uuid", "p_report_family_key" "text", "p_service_dates" "date"[], "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operations_report_batch_feed"("p_company_id" "uuid", "p_report_family_key" "text", "p_service_dates" "date"[], "p_limit" integer) TO "service_role";



GRANT SELECT ON TABLE "core"."automation_profile" TO "authenticated";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."automation_profile_v" TO "anon";
GRANT ALL ON TABLE "public"."automation_profile_v" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_profile_v" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_automation_profile"("p_company_id" "uuid", "p_provider_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_automation_profile"("p_company_id" "uuid", "p_provider_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_automation_profile"("p_company_id" "uuid", "p_provider_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_payroll_time_tracking_dsw_rows"("p_company_id" "uuid", "p_week_start" "date", "p_week_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_payroll_time_tracking_dsw_rows"("p_company_id" "uuid", "p_week_start" "date", "p_week_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payroll_time_tracking_dsw_rows"("p_company_id" "uuid", "p_week_start" "date", "p_week_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hiring_upsert_candidate"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hiring_upsert_candidate"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hiring_upsert_candidate"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_company_roster_rows"("p_company_slug" "text", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_company_roster_rows"("p_company_slug" "text", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_company_roster_rows"("p_company_slug" "text", "p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb", "p_summary_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb", "p_summary_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_operations_dsw_finalized_day"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_headers" "text"[], "p_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb", "p_summary_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."legal_update_document_section"("p_section_id" "uuid", "p_body" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."legal_update_document_section"("p_section_id" "uuid", "p_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."legal_update_document_section"("p_section_id" "uuid", "p_body" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_industries"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_industries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_industries"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_payroll_dsw_unmatched"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_payroll_dsw_unmatched"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_payroll_dsw_unmatched"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_roster_invite_sent"("p_company_id" "uuid", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_token_id" "uuid", "p_email_provider_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_roster_invite_sent"("p_company_id" "uuid", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_token_id" "uuid", "p_email_provider_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_roster_invite_sent"("p_company_id" "uuid", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_token_id" "uuid", "p_email_provider_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."operations_report_history"("p_company_id" "uuid", "p_report_family_key" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."paint_schedule_day_fact_for_company"("p_company_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."paint_schedule_day_fact_for_company"("p_company_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."paint_schedule_day_fact_for_company"("p_company_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."paint_schedule_day_fact_for_roster_member"("p_company_id" "uuid", "p_roster_member_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."paint_schedule_day_fact_for_roster_member"("p_company_id" "uuid", "p_roster_member_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."paint_schedule_day_fact_for_roster_member"("p_company_id" "uuid", "p_roster_member_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."payroll_dsw_bridge_key"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."payroll_dsw_bridge_key"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."payroll_dsw_bridge_key"("p_value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rebuild_payroll_activity_fact"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_automation_credential_verification"("p_profile_id" "uuid", "p_result" "text", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_automation_credential_verification"("p_profile_id" "uuid", "p_result" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_automation_credential_verification"("p_profile_id" "uuid", "p_result" "text", "p_status" "text") TO "service_role";



GRANT SELECT ON TABLE "core"."operations_collection_artifact" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "core"."operations_collection_artifact" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."operations_collection_artifact_v" TO "anon";
GRANT ALL ON TABLE "public"."operations_collection_artifact_v" TO "authenticated";
GRANT ALL ON TABLE "public"."operations_collection_artifact_v" TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_operations_collection_artifact"("p_collection_request_id" "uuid", "p_company_id" "uuid", "p_service_date" "date", "p_artifact_kind" "text", "p_report_family_key" "text", "p_report_shape_key" "text", "p_report_frame" "text", "p_artifact_status" "text", "p_storage_bucket" "text", "p_storage_path" "text", "p_original_filename" "text", "p_normalized_filename" "text", "p_content_type" "text", "p_size_bytes" bigint, "p_source_hash" "text", "p_runner_key" "text", "p_runner_artifact_json" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_operations_collection_artifact"("p_collection_request_id" "uuid", "p_company_id" "uuid", "p_service_date" "date", "p_artifact_kind" "text", "p_report_family_key" "text", "p_report_shape_key" "text", "p_report_frame" "text", "p_artifact_status" "text", "p_storage_bucket" "text", "p_storage_path" "text", "p_original_filename" "text", "p_normalized_filename" "text", "p_content_type" "text", "p_size_bytes" bigint, "p_source_hash" "text", "p_runner_key" "text", "p_runner_artifact_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_operations_collection_artifact"("p_collection_request_id" "uuid", "p_company_id" "uuid", "p_service_date" "date", "p_artifact_kind" "text", "p_report_family_key" "text", "p_report_shape_key" "text", "p_report_frame" "text", "p_artifact_status" "text", "p_storage_bucket" "text", "p_storage_path" "text", "p_original_filename" "text", "p_normalized_filename" "text", "p_content_type" "text", "p_size_bytes" bigint, "p_source_hash" "text", "p_runner_key" "text", "p_runner_artifact_json" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_release_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_release_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_company_asset"("p_company_slug" "text", "p_asset_id" "uuid", "p_release_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_schedule_projection"("p_company_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_schedule_projection"("p_company_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_schedule_projection"("p_company_id" "uuid", "p_start_date" "date", "p_horizon_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_raw_row_ids" "uuid"[], "p_reviewed_by_profile_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_raw_row_ids" "uuid"[], "p_reviewed_by_profile_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_raw_row_ids" "uuid"[], "p_reviewed_by_profile_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_review_items" "jsonb", "p_reviewed_by_profile_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_review_items" "jsonb", "p_reviewed_by_profile_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_operations_mileage_audit"("p_company_id" "uuid", "p_action" "text", "p_review_items" "jsonb", "p_reviewed_by_profile_id" "uuid", "p_max_reasonable_miles" numeric, "p_before_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."roster_set_employment_status"("p_company_slug" "text", "p_roster_id" "uuid", "p_status" "text", "p_effective_date" "date", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."roster_set_employment_status"("p_company_slug" "text", "p_roster_id" "uuid", "p_status" "text", "p_effective_date" "date", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."roster_set_employment_status"("p_company_slug" "text", "p_roster_id" "uuid", "p_status" "text", "p_effective_date" "date", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."roster_upsert_person"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_employment_status" "text", "p_market_code" "text", "p_compliance_summary" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."roster_upsert_person"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_employment_status" "text", "p_market_code" "text", "p_compliance_summary" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."roster_upsert_person"("p_company_slug" "text", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_employment_status" "text", "p_market_code" "text", "p_compliance_summary" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_automation_credential"("p_profile_id" "uuid", "p_username" "text", "p_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_automation_credential"("p_profile_id" "uuid", "p_username" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_automation_credential"("p_profile_id" "uuid", "p_username" "text", "p_password" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_operations_automation_schedule_config"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_operations_automation_schedule_config"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_operations_automation_schedule_config"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_operations_automation_schedule_config_with_window"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text", "p_start_time" time without time zone, "p_end_time" time without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_operations_automation_schedule_config_with_window"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_operations_automation_schedule_config_with_window"("p_company_slug" "text", "p_automation_type" "text", "p_is_enabled" boolean, "p_cadence_minutes" integer, "p_window_preset" "text", "p_start_time" time without time zone, "p_end_time" time without time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_profile_setup"("p_auth_user_id" "uuid", "p_email" "text", "p_first_name" "text", "p_last_name" "text", "p_display_name" "text", "p_mobile_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_profile_setup"("p_auth_user_id" "uuid", "p_email" "text", "p_first_name" "text", "p_last_name" "text", "p_display_name" "text", "p_mobile_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_profile_setup"("p_auth_user_id" "uuid", "p_email" "text", "p_first_name" "text", "p_last_name" "text", "p_display_name" "text", "p_mobile_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."schedule_sweep_month"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_ops_mode" "text", "p_modified_start_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."schedule_sweep_month"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_ops_mode" "text", "p_modified_start_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_sweep_month"("p_company_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_ops_mode" "text", "p_modified_start_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_company_roster_invite"("p_company_slug" "text", "p_roster_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_trainee_daily_pay_rate" numeric, "p_effective_start" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_trainee_daily_pay_rate" numeric, "p_effective_start" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_roster_trainee_pay_override"("p_company_slug" "text", "p_roster_id" "uuid", "p_trainee_daily_pay_rate" numeric, "p_effective_start" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage_operations_dro_report"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage_operations_dro_report"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_operations_dro_report"("p_company_id" "uuid", "p_service_date" "date", "p_report_frame" "text", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage_operations_dsw_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage_operations_dsw_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_operations_dsw_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage_operations_dsw_summary_rows"("p_batch_id" "uuid", "p_company_id" "uuid", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage_operations_dsw_summary_rows"("p_batch_id" "uuid", "p_company_id" "uuid", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_operations_dsw_summary_rows"("p_batch_id" "uuid", "p_company_id" "uuid", "p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage_operations_fcc_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage_operations_fcc_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_operations_fcc_report"("p_company_id" "uuid", "p_service_date" "date", "p_source_filename" "text", "p_source_hash" "text", "p_detected_sheet_name" "text", "p_detected_header_row" integer, "p_detected_headers" "text"[], "p_row_count" integer, "p_route_row_count" integer, "p_participant_row_count" integer, "p_skipped_row_count" integer, "p_uploaded_by_profile_id" "uuid", "p_metadata_json" "jsonb", "p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_operations_automation_run"("p_company_id" "uuid", "p_automation_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_operations_automation_run"("p_company_id" "uuid", "p_automation_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_operations_automation_run"("p_company_id" "uuid", "p_automation_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."supersede_operations_report_batch"("p_new_batch_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."supersede_operations_report_batch"("p_new_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."supersede_operations_report_batch"("p_new_batch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_notes" "text", "p_assignment_muted" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_notes" "text", "p_assignment_muted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_notes" "text", "p_assignment_muted" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_company_operations_config"("p_company_slug" "text", "p_route_sort_key" "text", "p_route_sort_direction" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_company_operations_config"("p_company_slug" "text", "p_route_sort_key" "text", "p_route_sort_direction" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_company_operations_config"("p_company_slug" "text", "p_route_sort_key" "text", "p_route_sort_direction" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_company_profile_grants"("p_company_slug" "text", "p_profile_id" "uuid", "p_grant_keys" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_company_profile_grants"("p_company_slug" "text", "p_profile_id" "uuid", "p_grant_keys" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_company_profile_grants"("p_company_slug" "text", "p_profile_id" "uuid", "p_grant_keys" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_hire_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_hire_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_company_roster_details"("p_company_slug" "text", "p_roster_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_worker_type" "text", "p_market_code" "text", "p_notes" "text", "p_date_of_birth" "date", "p_hire_date" "date", "p_address_line_1" "text", "p_address_line_2" "text", "p_city" "text", "p_state_region" "text", "p_postal_code" "text", "p_license_number" "text", "p_issuing_state" "text", "p_license_issue_date" "date", "p_license_expiration_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_company_roster_note"("p_company_slug" "text", "p_roster_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_company_roster_note"("p_company_slug" "text", "p_roster_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_company_roster_note"("p_company_slug" "text", "p_roster_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_company_roster_operations"("p_company_slug" "text", "p_roster_id" "uuid", "p_fx_id" "text", "p_dswid" "text", "p_scanner_serial" "text", "p_dot_exp" "date", "p_qual_cert_exp" "date", "p_daily_pay_effective_date" "date", "p_daily_pay_rate" numeric, "p_fuel_card" "text", "p_pin_id_no" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_company_roster_operations"("p_company_slug" "text", "p_roster_id" "uuid", "p_fx_id" "text", "p_dswid" "text", "p_scanner_serial" "text", "p_dot_exp" "date", "p_qual_cert_exp" "date", "p_daily_pay_effective_date" "date", "p_daily_pay_rate" numeric, "p_fuel_card" "text", "p_pin_id_no" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_company_roster_operations"("p_company_slug" "text", "p_roster_id" "uuid", "p_fx_id" "text", "p_dswid" "text", "p_scanner_serial" "text", "p_dot_exp" "date", "p_qual_cert_exp" "date", "p_daily_pay_effective_date" "date", "p_daily_pay_rate" numeric, "p_fuel_card" "text", "p_pin_id_no" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_operations_collection_artifact_status"("p_artifact_id" "uuid", "p_artifact_status" "text", "p_ingest_metadata_json" "jsonb", "p_report_batch_id" "uuid", "p_error_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_operations_collection_artifact_status"("p_artifact_id" "uuid", "p_artifact_status" "text", "p_ingest_metadata_json" "jsonb", "p_report_batch_id" "uuid", "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_operations_collection_artifact_status"("p_artifact_id" "uuid", "p_artifact_status" "text", "p_ingest_metadata_json" "jsonb", "p_report_batch_id" "uuid", "p_error_message" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_operations_collection_request_status"("p_request_id" "uuid", "p_request_status" "text", "p_error_message" "text", "p_automation_run_id" "uuid", "p_report_batch_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_operations_collection_request_status"("p_request_id" "uuid", "p_request_status" "text", "p_error_message" "text", "p_automation_run_id" "uuid", "p_report_batch_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_operations_collection_request_status"("p_request_id" "uuid", "p_request_status" "text", "p_error_message" "text", "p_automation_run_id" "uuid", "p_report_batch_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_asset_type_key" "text", "p_asset_identifier" "text", "p_asset_status_key" "text", "p_asset_provider_id" "uuid", "p_secondary_identifier" "text", "p_notes" "text", "p_assignment_muted" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_asset_type_key" "text", "p_asset_identifier" "text", "p_asset_status_key" "text", "p_asset_provider_id" "uuid", "p_secondary_identifier" "text", "p_notes" "text", "p_assignment_muted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_company_asset_admin"("p_company_slug" "text", "p_asset_id" "uuid", "p_asset_type_key" "text", "p_asset_identifier" "text", "p_asset_status_key" "text", "p_asset_provider_id" "uuid", "p_secondary_identifier" "text", "p_notes" "text", "p_assignment_muted" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_walk_on_driver"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date", "p_created_by_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_walk_on_driver"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date", "p_created_by_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_walk_on_driver"("p_company_slug" "text", "p_full_name" "text", "p_seen_date" "date", "p_created_by_profile_id" "uuid") TO "service_role";












GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."customer" TO "authenticated";
GRANT ALL ON TABLE "billing"."customer" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."subscription" TO "authenticated";
GRANT ALL ON TABLE "billing"."subscription" TO "service_role";



GRANT SELECT ON TABLE "billing"."customer_subscription_v" TO "authenticated";
GRANT ALL ON TABLE "billing"."customer_subscription_v" TO "service_role";



GRANT ALL ON TABLE "billing"."payment" TO "service_role";



GRANT SELECT ON TABLE "commercial"."operator_tier" TO "authenticated";
GRANT SELECT ON TABLE "commercial"."operator_tier" TO "service_role";



GRANT ALL ON TABLE "commercial"."profile" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "commercial"."profile" TO "authenticated";



GRANT SELECT ON TABLE "core"."asset" TO "authenticated";



GRANT SELECT ON TABLE "core"."asset_assignment" TO "authenticated";



GRANT SELECT ON TABLE "core"."asset_audit" TO "authenticated";



GRANT SELECT ON TABLE "core"."asset_event" TO "authenticated";



GRANT SELECT ON TABLE "core"."asset_provider" TO "authenticated";



GRANT SELECT ON TABLE "core"."asset_status" TO "authenticated";



GRANT SELECT ON TABLE "core"."asset_type" TO "authenticated";



GRANT SELECT ON TABLE "core"."candidate_checklist_item_type" TO "authenticated";



GRANT SELECT ON TABLE "core"."candidate_stage_type" TO "authenticated";



GRANT SELECT ON TABLE "core"."company_candidate_checklist_config" TO "authenticated";



GRANT SELECT ON TABLE "core"."company_candidate_stage_config" TO "authenticated";



GRANT SELECT,INSERT,UPDATE ON TABLE "core"."company_contract_config" TO "authenticated";



GRANT SELECT ON TABLE "core"."company_memberships" TO "authenticated";



GRANT SELECT,INSERT,UPDATE ON TABLE "core"."company_operations_config" TO "authenticated";



GRANT SELECT,INSERT,UPDATE ON TABLE "core"."company_person_compensation" TO "authenticated";



GRANT SELECT,INSERT,UPDATE ON TABLE "core"."company_roster" TO "authenticated";



GRANT SELECT ON TABLE "core"."company_roster_event" TO "authenticated";



GRANT SELECT ON TABLE "core"."company_roster_identifier" TO "authenticated";



GRANT SELECT,INSERT,UPDATE ON TABLE "core"."company_roster_operations_fact" TO "authenticated";



GRANT SELECT ON TABLE "core"."company_roster_trainee_pay_override" TO "authenticated";



GRANT SELECT ON TABLE "core"."company_roster_view" TO "authenticated";



GRANT SELECT ON TABLE "core"."driver_activity_event" TO "authenticated";



GRANT SELECT ON TABLE "core"."driver_activity_event_type" TO "authenticated";



GRANT SELECT ON TABLE "core"."driver_activity_signal" TO "authenticated";



GRANT SELECT ON TABLE "core"."driver_breadcrumb_point" TO "authenticated";



GRANT SELECT ON TABLE "core"."operations_automation_run" TO "authenticated";



GRANT SELECT ON TABLE "core"."payroll_activity_fact" TO "authenticated";



GRANT SELECT ON TABLE "core"."payroll_adjustment_event" TO "authenticated";



GRANT SELECT ON TABLE "core"."payroll_adjustment_target" TO "authenticated";



GRANT SELECT,INSERT,UPDATE ON TABLE "core"."profile_driver_license" TO "authenticated";



GRANT SELECT,INSERT,UPDATE ON TABLE "core"."profile_private_fact" TO "authenticated";



GRANT SELECT ON TABLE "core"."profiles" TO "authenticated";



GRANT SELECT ON TABLE "core"."roster_candidate_checklist_fact" TO "authenticated";



GRANT SELECT ON TABLE "core"."roster_candidate_stage" TO "authenticated";









GRANT SELECT ON TABLE "legal"."document" TO "authenticated";
GRANT SELECT ON TABLE "legal"."document" TO "service_role";



GRANT SELECT ON TABLE "legal"."document_section" TO "authenticated";
GRANT SELECT ON TABLE "legal"."document_section" TO "service_role";



GRANT SELECT ON TABLE "legal"."document_section_note" TO "service_role";



GRANT SELECT ON TABLE "legal"."document_section_revision" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT SELECT ON TABLE "ref"."industries" TO "authenticated";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."companies_with_industry" TO "anon";
GRANT ALL ON TABLE "public"."companies_with_industry" TO "authenticated";
GRANT ALL ON TABLE "public"."companies_with_industry" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_asset_providers_v" TO "anon";
GRANT ALL ON TABLE "public"."company_asset_providers_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_asset_providers_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_asset_status_v" TO "anon";
GRANT ALL ON TABLE "public"."company_asset_status_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_asset_status_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_roster_view" TO "anon";
GRANT ALL ON TABLE "public"."company_roster_view" TO "authenticated";
GRANT ALL ON TABLE "public"."company_roster_view" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."person" TO "anon";
GRANT ALL ON TABLE "public"."person" TO "authenticated";
GRANT ALL ON TABLE "public"."person" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_assets_v" TO "anon";
GRANT ALL ON TABLE "public"."company_assets_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_assets_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_candidate_checklist_config_v" TO "anon";
GRANT ALL ON TABLE "public"."company_candidate_checklist_config_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_candidate_checklist_config_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_candidate_checklist_readiness_v" TO "anon";
GRANT ALL ON TABLE "public"."company_candidate_checklist_readiness_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_candidate_checklist_readiness_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_candidate_stage_config_v" TO "anon";
GRANT ALL ON TABLE "public"."company_candidate_stage_config_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_candidate_stage_config_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_contract_config" TO "anon";
GRANT ALL ON TABLE "public"."company_contract_config" TO "authenticated";
GRANT ALL ON TABLE "public"."company_contract_config" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_industries" TO "anon";
GRANT ALL ON TABLE "public"."company_industries" TO "authenticated";
GRANT ALL ON TABLE "public"."company_industries" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_memberships" TO "anon";
GRANT ALL ON TABLE "public"."company_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."company_memberships" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_payroll_adjustment_event_v" TO "anon";
GRANT ALL ON TABLE "public"."company_payroll_adjustment_event_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_payroll_adjustment_event_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_payroll_adjustment_target_v" TO "anon";
GRANT ALL ON TABLE "public"."company_payroll_adjustment_target_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_payroll_adjustment_target_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_roster_event_view" TO "anon";
GRANT ALL ON TABLE "public"."company_roster_event_view" TO "authenticated";
GRANT ALL ON TABLE "public"."company_roster_event_view" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_roster_operations_fact_v" TO "anon";
GRANT ALL ON TABLE "public"."company_roster_operations_fact_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_roster_operations_fact_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_roster_trainee_pay_override_v" TO "anon";
GRANT ALL ON TABLE "public"."company_roster_trainee_pay_override_v" TO "authenticated";
GRANT ALL ON TABLE "public"."company_roster_trainee_pay_override_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."company_terminal" TO "anon";
GRANT ALL ON TABLE "public"."company_terminal" TO "authenticated";
GRANT ALL ON TABLE "public"."company_terminal" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."driver_activity_event_type_v" TO "anon";
GRANT ALL ON TABLE "public"."driver_activity_event_type_v" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_activity_event_type_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."driver_activity_event_v" TO "anon";
GRANT ALL ON TABLE "public"."driver_activity_event_v" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_activity_event_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."driver_activity_signal_v" TO "anon";
GRANT ALL ON TABLE "public"."driver_activity_signal_v" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_activity_signal_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."driver_breadcrumb_point_v" TO "anon";
GRANT ALL ON TABLE "public"."driver_breadcrumb_point_v" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_breadcrumb_point_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."driver_time_off_request" TO "anon";
GRANT ALL ON TABLE "public"."driver_time_off_request" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_time_off_request" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."hiring_invite_token" TO "anon";
GRANT ALL ON TABLE "public"."hiring_invite_token" TO "authenticated";
GRANT ALL ON TABLE "public"."hiring_invite_token" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."legal_document_section_v" TO "anon";
GRANT ALL ON TABLE "public"."legal_document_section_v" TO "authenticated";
GRANT ALL ON TABLE "public"."legal_document_section_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."legal_document_v" TO "anon";
GRANT ALL ON TABLE "public"."legal_document_v" TO "authenticated";
GRANT ALL ON TABLE "public"."legal_document_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."onboarding_session" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_session" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_session" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."onboarding_step" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_step" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_step" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."onboarding_step_progress" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_step_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_step_progress" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."operations_automation_run_v" TO "anon";
GRANT ALL ON TABLE "public"."operations_automation_run_v" TO "authenticated";
GRANT ALL ON TABLE "public"."operations_automation_run_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."payroll_activity_fact_v" TO "anon";
GRANT ALL ON TABLE "public"."payroll_activity_fact_v" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_activity_fact_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."roster_candidate_checklist_fact_v" TO "anon";
GRANT ALL ON TABLE "public"."roster_candidate_checklist_fact_v" TO "authenticated";
GRANT ALL ON TABLE "public"."roster_candidate_checklist_fact_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."roster_candidate_stage_v" TO "anon";
GRANT ALL ON TABLE "public"."roster_candidate_stage_v" TO "authenticated";
GRANT ALL ON TABLE "public"."roster_candidate_stage_v" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."route_baseline" TO "anon";
GRANT ALL ON TABLE "public"."route_baseline" TO "authenticated";
GRANT ALL ON TABLE "public"."route_baseline" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."schedule_baseline" TO "anon";
GRANT ALL ON TABLE "public"."schedule_baseline" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_baseline" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."schedule_day_fact" TO "anon";
GRANT ALL ON TABLE "public"."schedule_day_fact" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_day_fact" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."schedule_override" TO "anon";
GRANT ALL ON TABLE "public"."schedule_override" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_override" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."schedule_preset" TO "anon";
GRANT ALL ON TABLE "public"."schedule_preset" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_preset" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."schedule_day_fact_view" TO "anon";
GRANT ALL ON TABLE "public"."schedule_day_fact_view" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_day_fact_view" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."schedule_request" TO "anon";
GRANT ALL ON TABLE "public"."schedule_request" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_request" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."schedule_request_activity" TO "anon";
GRANT ALL ON TABLE "public"."schedule_request_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_request_activity" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."schedule_request_cover_offer" TO "anon";
GRANT ALL ON TABLE "public"."schedule_request_cover_offer" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_request_cover_offer" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "billing" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "billing" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "billing" GRANT ALL ON TABLES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

revoke select on table "public"."company_terminal" from "anon";

revoke select on table "public"."driver_time_off_request" from "anon";

revoke select on table "public"."hiring_invite_token" from "anon";

revoke select on table "public"."onboarding_session" from "anon";

revoke select on table "public"."onboarding_step" from "anon";

revoke select on table "public"."onboarding_step_progress" from "anon";

revoke select on table "public"."person" from "anon";

revoke select on table "public"."route_baseline" from "anon";

revoke select on table "public"."schedule_baseline" from "anon";

revoke select on table "public"."schedule_day_fact" from "anon";

revoke select on table "public"."schedule_override" from "anon";

revoke select on table "public"."schedule_preset" from "anon";

revoke select on table "public"."schedule_request" from "anon";

revoke select on table "public"."schedule_request_activity" from "anon";

revoke select on table "public"."schedule_request_cover_offer" from "anon";


