import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type CommercialTierEvidenceTier = {
  tier_key: string;
  display_name: string;
  min_routes: number | string | null;
  max_routes: number | string | null;
  implementation_fee: number | string | null;
  weekly_subscription: number | string | null;
  active: boolean;
  sort_order: number;
};

type OperationsHistoryRow = {
  service_date: string;
  is_weekday: boolean | null;
  is_weekend: boolean | null;
  route_count: number | string | null;
};

export type CommercialTierEvidence = {
  startDate: string;
  endDate: string;
  observedDays: number;
  average30: number | null;
  average60: number | null;
  average90: number | null;
  weekdayAverage: number | null;
  weekendAverage: number | null;
  peakRouteCount: number | null;
  sustainedRouteCount: number | null;
  recommendedTier: CommercialTierEvidenceTier | null;
  declaredTier: CommercialTierEvidenceTier | null;
  tierMatchesEvidence: boolean | null;
  loadError: string | null;
};

export type CommercialTierEvidenceInput = {
  supabase: SupabaseClient;
  companyId: string;
  declaredTierKey: string | null | undefined;
  operatorTiers?: CommercialTierEvidenceTier[];
};

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function averageRouteCount(rows: OperationsHistoryRow[]) {
  const values = rows
    .map((row) => numberOrNull(row.route_count))
    .filter((value): value is number => value !== null);

  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxRouteCount(rows: OperationsHistoryRow[]) {
  const values = rows
    .map((row) => numberOrNull(row.route_count))
    .filter((value): value is number => value !== null);

  if (!values.length) {
    return null;
  }

  return Math.max(...values);
}

function isoDateDaysAgo(daysAgo: number) {
  const date = new Date();

  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);

  return date.toISOString().slice(0, 10);
}

function rowsSince(rows: OperationsHistoryRow[], startDate: string) {
  return rows.filter((row) => row.service_date >= startDate);
}

function tierCoversRouteCount(
  tier: CommercialTierEvidenceTier,
  routeCount: number
) {
  const minRoutes = numberOrNull(tier.min_routes);
  const maxRoutes = numberOrNull(tier.max_routes);

  if (minRoutes !== null && routeCount < minRoutes) {
    return false;
  }

  if (maxRoutes !== null && routeCount > maxRoutes) {
    return false;
  }

  return true;
}

function findRecommendedTier(
  tiers: CommercialTierEvidenceTier[],
  routeCount: number | null
) {
  if (routeCount === null) {
    return null;
  }

  return (
    tiers
      .filter((tier) => tier.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .find((tier) => tierCoversRouteCount(tier, routeCount)) ??
    null
  );
}

function buildEvidence(input: {
  rows: OperationsHistoryRow[];
  tiers: CommercialTierEvidenceTier[];
  declaredTierKey: string | null | undefined;
  startDate: string;
  endDate: string;
  loadError: string | null;
}): CommercialTierEvidence {
  const rows = [...input.rows].sort((a, b) =>
    a.service_date.localeCompare(b.service_date)
  );

  const start30 = isoDateDaysAgo(29);
  const start60 = isoDateDaysAgo(59);

  const rows30 = rowsSince(rows, start30);
  const rows60 = rowsSince(rows, start60);
  const rows90 = rowsSince(rows, input.startDate);

  const average30 = averageRouteCount(rows30);
  const average60 = averageRouteCount(rows60);
  const average90 = averageRouteCount(rows90);
  const peakRouteCount = maxRouteCount(rows90);

  const sustainedAverage = [average30, average60, average90]
    .filter((value): value is number => value !== null)
    .reduce<number | null>(
      (max, value) => (max === null || value > max ? value : max),
      null
    );

  const sustainedRouteCount =
    sustainedAverage === null ? null : Math.ceil(sustainedAverage);

  const recommendedTier = findRecommendedTier(
    input.tiers,
    sustainedRouteCount
  );

  const declaredTier =
    input.tiers.find(
      (tier) => tier.tier_key === input.declaredTierKey
    ) ?? null;

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    observedDays: rows90.length,
    average30,
    average60,
    average90,
    weekdayAverage: averageRouteCount(
      rows90.filter((row) => row.is_weekday)
    ),
    weekendAverage: averageRouteCount(
      rows90.filter((row) => row.is_weekend)
    ),
    peakRouteCount,
    sustainedRouteCount,
    recommendedTier,
    declaredTier,
    tierMatchesEvidence:
      sustainedRouteCount === null || !declaredTier
        ? null
        : tierCoversRouteCount(declaredTier, sustainedRouteCount),
    loadError: input.loadError,
  };
}

export async function getCommercialTierEvidence(
  input: CommercialTierEvidenceInput
): Promise<CommercialTierEvidence> {
  const startDate = isoDateDaysAgo(89);
  const endDate = isoDateDaysAgo(0);

  const tiers =
    input.operatorTiers ??
    ((
      await input.supabase
        .schema("commercial")
        .from("operator_tier")
        .select("*")
        .eq("active", true)
        .order("sort_order")
    ).data as CommercialTierEvidenceTier[] | null) ??
    [];

  const { data, error } = await input.supabase.rpc(
    "get_company_operations_history",
    {
      p_company_id: input.companyId,
      p_start_date: startDate,
      p_end_date: endDate,
    }
  );

  return buildEvidence({
    rows: Array.isArray(data) ? (data as OperationsHistoryRow[]) : [],
    tiers,
    declaredTierKey: input.declaredTierKey,
    startDate,
    endDate,
    loadError: error?.message ?? null,
  });
}

export function formatCommercialRouteRange(
  tier: CommercialTierEvidenceTier | null
) {
  if (!tier) {
    return "—";
  }

  const minRoutes = numberOrNull(tier.min_routes);
  const maxRoutes = numberOrNull(tier.max_routes);

  if (minRoutes !== null && maxRoutes !== null) {
    return `${minRoutes}-${maxRoutes} routes`;
  }

  if (minRoutes !== null) {
    return `${minRoutes}+ routes`;
  }

  if (maxRoutes !== null) {
    return `Up to ${maxRoutes} routes`;
  }

  return "Custom";
}
