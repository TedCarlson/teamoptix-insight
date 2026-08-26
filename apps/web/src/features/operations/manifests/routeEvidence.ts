export function manifestDetailRequestUrl(params: {
  slug: string;
  serviceDate: string;
  routeKey: string;
}) {
  const query = new URLSearchParams({
    serviceDate: params.serviceDate,
    routeKey: params.routeKey,
  });
  return `/api/company/${params.slug}/operations/route-health?${query.toString()}`;
}

export function preferredManifestRouteKey(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const raw = String(candidate ?? "").trim();
    if (!raw) continue;
    const withoutPrefix = raw.replace(/^WA\s+/i, "").trim();
    if (withoutPrefix) return withoutPrefix;
  }
  return "";
}
