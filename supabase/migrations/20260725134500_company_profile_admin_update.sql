alter table core.companies
  add column if not exists authorized_operator_name text;

alter table core.companies
  add constraint companies_authorized_operator_name_ck
  check (
    authorized_operator_name is null
    or length(btrim(authorized_operator_name)) > 0
  );

create or replace view public.companies_with_industry
with (security_invoker = true)
as
select
  c.id,
  c.company_name,
  c.company_slug,
  c.company_status,
  c.primary_industry_id,
  c.contact_email,
  c.contact_phone,
  c.website_url,
  c.logo_url,
  c.company_size_band,
  c.archived_at,
  c.created_at,
  c.updated_at,
  i.industry_label,
  c.authorized_operator_name
from core.companies c
left join ref.industries i on i.id = c.primary_industry_id;

create or replace function core.update_company_profile(
  p_company_slug text,
  p_authorized_operator_name text,
  p_contact_email text,
  p_contact_phone text,
  p_website_url text,
  p_company_size_band text
)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_company core.companies%rowtype;
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then
    return jsonb_build_object('error', 'Company not found.');
  end if;

  if not core.can_admin_company(v_company_id) then
    return jsonb_build_object('error', 'Forbidden.');
  end if;

  if nullif(btrim(coalesce(p_authorized_operator_name, '')), '') is null then
    return jsonb_build_object('error', 'Authorized Operator full name is required.');
  end if;

  if nullif(btrim(coalesce(p_contact_email, '')), '') is null then
    return jsonb_build_object('error', 'Contact email is required.');
  end if;

  update core.companies
  set authorized_operator_name = btrim(p_authorized_operator_name),
      contact_email = lower(btrim(p_contact_email)),
      contact_phone = nullif(btrim(coalesce(p_contact_phone, '')), ''),
      website_url = nullif(btrim(coalesce(p_website_url, '')), ''),
      company_size_band = nullif(btrim(coalesce(p_company_size_band, '')), ''),
      updated_at = now()
  where id = v_company_id
  returning * into v_company;

  return jsonb_build_object(
    'company',
    jsonb_build_object(
      'id', v_company.id,
      'company_name', v_company.company_name,
      'company_slug', v_company.company_slug,
      'company_status', v_company.company_status,
      'authorized_operator_name', v_company.authorized_operator_name,
      'contact_email', v_company.contact_email,
      'contact_phone', v_company.contact_phone,
      'website_url', v_company.website_url,
      'company_size_band', v_company.company_size_band,
      'created_at', v_company.created_at
    )
  );
end;
$$;

create or replace function public.update_company_profile(
  p_company_slug text,
  p_authorized_operator_name text,
  p_contact_email text,
  p_contact_phone text,
  p_website_url text,
  p_company_size_band text
)
returns jsonb
language sql
security definer
set search_path = core, public
as $$
  select core.update_company_profile(
    p_company_slug,
    p_authorized_operator_name,
    p_contact_email,
    p_contact_phone,
    p_website_url,
    p_company_size_band
  );
$$;

revoke all on function public.update_company_profile(text, text, text, text, text, text) from public;
grant execute on function public.update_company_profile(text, text, text, text, text, text)
  to authenticated, service_role;

comment on column core.companies.authorized_operator_name is
  'Company profile fact naming the Authorized Operator; leadership assignment separately links the operator app profile.';
