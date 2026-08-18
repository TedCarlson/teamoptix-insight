-- Close direct API discovery of raw company aliases. Platform owners consume
-- aliases through public.itf_company_catalogue(), which performs its own
-- authenticated platform-owner check.
revoke all on table core.company_external_alias from public, anon, authenticated;

-- This selector only reads RLS-protected tables already granted to the
-- authenticated role. Run it with caller privileges instead of elevated
-- function-owner privileges.
alter function public.platform_product_companies(text) security invoker;
