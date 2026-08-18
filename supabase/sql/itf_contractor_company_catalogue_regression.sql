-- Run after 20260817132730_itf_contractor_company_catalogue.sql.
-- Read-only assertions for the local/branch company-catalogue event.

do $$
declare
  v_company_count integer;
  v_reference_count integer;
  v_relationship_count integer;
  v_location_count integer;
begin
  select count(*)
  into v_company_count
  from core.companies company
  join core.company_product company_product
    on company_product.company_id = company.id
  join ref.insight_products product
    on product.id = company_product.product_id
  where product.product_key = 'insight-telecom-fulfillment'
    and company.company_slug <> 'integrated-tech-group';

  if v_company_count <> 20 then
    raise exception 'Expected 20 ITF contractor companies; found %.', v_company_count;
  end if;

  select count(*)
  into v_reference_count
  from core.company_external_reference reference
  join core.companies company on company.id = reference.company_id
  where reference.source_system = 'itg-insight'
    and reference.source_entity_type = 'contractor'
    and company.company_slug in (
      'br-underground', 'cable-warriors', 'conex', 'general-cable',
      'grand-trade', 'hightek-contracting', 'j-l-unlimited', 'jcomm',
      'leon-cable', 'mold-cable', 'north-cable-usa', 'regiistek', 'sigma',
      'smart-cable-tech', 'st-victor-services', 'star-communications',
      'terokar', 'video-installation-pros', 'wifirenet', 'wyri'
    );

  if v_reference_count <> 20 then
    raise exception 'Expected 20 donor contractor references; found %.', v_reference_count;
  end if;

  select count(*)
  into v_relationship_count
  from core.company_relationship relationship
  join core.companies principal on principal.id = relationship.principal_company_id
  join core.companies provider on provider.id = relationship.provider_company_id
  where principal.company_slug = 'integrated-tech-group'
    and relationship.relationship_kind = 'subcontractor'
    and relationship.relationship_status in ('proposed', 'active', 'suspended')
    and provider.company_slug in (
      'br-underground', 'cable-warriors', 'conex', 'general-cable',
      'grand-trade', 'hightek-contracting', 'j-l-unlimited', 'jcomm',
      'leon-cable', 'mold-cable', 'north-cable-usa', 'regiistek', 'sigma',
      'smart-cable-tech', 'st-victor-services', 'star-communications',
      'terokar', 'video-installation-pros', 'wifirenet', 'wyri'
    );

  if v_relationship_count <> 20 then
    raise exception 'Expected 20 ITG contractor relationships; found %.', v_relationship_count;
  end if;

  select count(*)
  into v_location_count
  from core.company_location location
  join core.companies company on company.id = location.company_id
  where company.company_slug in (
    'br-underground', 'cable-warriors', 'conex', 'general-cable',
    'grand-trade', 'hightek-contracting', 'j-l-unlimited', 'jcomm',
    'leon-cable', 'mold-cable', 'north-cable-usa', 'regiistek', 'sigma',
    'smart-cable-tech', 'st-victor-services', 'star-communications',
    'terokar', 'video-installation-pros', 'wifirenet', 'wyri'
  );

  if v_location_count <> 0 then
    raise exception 'Company-catalogue event must not create contractor locations; found %.', v_location_count;
  end if;
end;
$$;
