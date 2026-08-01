-- Keep exact-arity callers of the roster details RPC on the company-owned
-- personal and driver-license fact warehouses. PostgreSQL otherwise prefers
-- this legacy signature over the newer overload with a defaulted final flag.

create or replace function core.update_company_roster_details(
  p_company_slug text,
  p_roster_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_worker_type text,
  p_market_code text,
  p_notes text,
  p_date_of_birth date,
  p_hire_date date,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_state_region text,
  p_postal_code text,
  p_license_number text,
  p_issuing_state text,
  p_license_issue_date date,
  p_license_expiration_date date
) returns jsonb
language sql
security definer
set search_path to core, public
as $$
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
    p_license_expiration_date,
    true
  );
$$;

create or replace function public.update_company_roster_details(
  p_company_slug text,
  p_roster_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_worker_type text,
  p_market_code text,
  p_notes text,
  p_date_of_birth date,
  p_hire_date date,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_state_region text,
  p_postal_code text,
  p_license_number text,
  p_issuing_state text,
  p_license_issue_date date,
  p_license_expiration_date date
) returns jsonb
language sql
security definer
set search_path to core, public
as $$
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
    p_license_expiration_date,
    true
  );
$$;

revoke all on function public.update_company_roster_details(
  text, uuid, text, text, text, text, text, text, date, date,
  text, text, text, text, text, text, text, date, date
) from public, anon;

grant execute on function public.update_company_roster_details(
  text, uuid, text, text, text, text, text, text, date, date,
  text, text, text, text, text, text, text, date, date
) to authenticated, service_role;
