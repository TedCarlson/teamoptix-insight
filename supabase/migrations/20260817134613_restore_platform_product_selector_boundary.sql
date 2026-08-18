-- The platform selector crosses the intentionally private ref schema, so it
-- must retain its guarded server boundary. The function itself requires a
-- fresh authenticated platform owner before returning any company rows.
alter function public.platform_product_companies(text) security definer;
