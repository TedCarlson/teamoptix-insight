type SupabaseClientLike = any;

export type ExpressRouteEvidence = {
  route_key: string;
  package_count: number;
  complete_package_count: number;
  attempted_package_count: number;
  open_package_count: number;
  tracking_identity_missing_count: number;
  stop_link_missing_count: number;
  stop_link_ambiguous_count: number;
  reference_match_available: boolean;
};

export type ExpressEvidenceSnapshot = {
  routes: ExpressRouteEvidence[];
  totals: Omit<ExpressRouteEvidence, "route_key">;
  evidence_snapshot_generated_at: string | null;
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latest(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

export async function loadExpressEvidence(params: {
  companyId: string;
  serviceDate: string;
  manifestClient: SupabaseClientLike;
  statusClient?: SupabaseClientLike;
}): Promise<ExpressEvidenceSnapshot> {
  const result = await params.manifestClient
    .from("operations_manifest_express_route_signal_v")
    .select(
      "route_key,package_count,complete_package_count,attempted_package_count,canonical_open_package_count,tracking_identity_missing_count,stop_link_missing_count,stop_link_ambiguous_count,reference_match_available,evidence_snapshot_generated_at"
    )
    .eq("company_id", params.companyId)
    .eq("service_date", params.serviceDate);

  if (result.error) throw new Error(result.error.message);

  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  const routes = rows.map<ExpressRouteEvidence>((row) => ({
    route_key: String(row.route_key ?? "").trim(),
    package_count: number(row.package_count),
    complete_package_count: number(row.complete_package_count),
    attempted_package_count: number(row.attempted_package_count),
    open_package_count: number(row.canonical_open_package_count),
    tracking_identity_missing_count: number(row.tracking_identity_missing_count),
    stop_link_missing_count: number(row.stop_link_missing_count),
    stop_link_ambiguous_count: number(row.stop_link_ambiguous_count),
    reference_match_available: row.reference_match_available !== false,
  }));
  const totals = routes.reduce<Omit<ExpressRouteEvidence, "route_key">>(
    (aggregate, route) => ({
      package_count: aggregate.package_count + route.package_count,
      complete_package_count:
        aggregate.complete_package_count + route.complete_package_count,
      attempted_package_count:
        aggregate.attempted_package_count + route.attempted_package_count,
      open_package_count: aggregate.open_package_count + route.open_package_count,
      tracking_identity_missing_count:
        aggregate.tracking_identity_missing_count +
        route.tracking_identity_missing_count,
      stop_link_missing_count:
        aggregate.stop_link_missing_count + route.stop_link_missing_count,
      stop_link_ambiguous_count:
        aggregate.stop_link_ambiguous_count + route.stop_link_ambiguous_count,
      reference_match_available:
        aggregate.reference_match_available && route.reference_match_available,
    }),
    {
      package_count: 0,
      complete_package_count: 0,
      attempted_package_count: 0,
      open_package_count: 0,
      tracking_identity_missing_count: 0,
      stop_link_missing_count: 0,
      stop_link_ambiguous_count: 0,
      reference_match_available: routes.length > 0,
    }
  );

  return {
    routes,
    totals,
    evidence_snapshot_generated_at: latest(
      rows.map((row) => String(row.evidence_snapshot_generated_at ?? "") || null)
    ),
  };
}
