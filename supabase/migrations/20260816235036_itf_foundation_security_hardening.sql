-- Post-application hardening for the ITF company/location foundation.
--
-- The application reads products and product-scoped companies through the
-- authenticated, platform-owner-only RPC boundary. Donor lineage is not part
-- of the direct Data API contract.

create index if not exists company_product_location_location_company_idx
  on core.company_product_location (company_location_id, company_id);

revoke all on table core.company_external_reference from public, anon;
revoke select on table core.company_external_reference from authenticated;

revoke all on table core.company_location_external_reference from public, anon;
revoke select on table core.company_location_external_reference from authenticated;

-- Avoid overlapping permissive SELECT policies. The remaining access policy
-- already includes platform owners and company-authorized users. Mutations
-- remain server/migration controlled because authenticated has SELECT only.
drop policy if exists insight_products_all_platform_owner
  on ref.insight_products;

drop policy if exists company_product_all_platform_owner
  on core.company_product;

drop policy if exists company_location_all_platform_owner
  on core.company_location;

drop policy if exists company_product_location_all_platform_owner
  on core.company_product_location;
