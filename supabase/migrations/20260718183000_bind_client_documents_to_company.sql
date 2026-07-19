begin;

create or replace function public.legal_link_client_document_company(
  p_document_id uuid,
  p_customer_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, legal, core
as $$
declare
  v_company_name text;
begin
  select company_name
  into v_company_name
  from core.companies
  where id = p_customer_company_id;

  if not found then
    raise exception 'Customer company not found.';
  end if;

  update legal.document
  set
    customer_company_id = p_customer_company_id,
    customer_legal_name = v_company_name,
    updated_at = now()
  where id = p_document_id
    and document_scope = 'CLIENT_DOCUMENT';

  if not found then
    raise exception 'Client document not found.';
  end if;
end;
$$;

revoke all on function public.legal_link_client_document_company(uuid, uuid) from public;
grant execute on function public.legal_link_client_document_company(uuid, uuid) to service_role;

commit;
