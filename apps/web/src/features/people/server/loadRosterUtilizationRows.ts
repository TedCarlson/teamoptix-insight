import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyDriverProgram,
  deriveDriverUtilizationCategory,
} from "@/features/people/lib/driverWorkforceType";

type QueryError = {
  code?: string | null;
  message: string;
};

type BaselineRow = {
  id: string;
  roster_member_id: string;
  preset_id: string | null;
};

type PresetRow = {
  id: string;
  preset_code: string | null;
  works_s: boolean | null;
  works_u: boolean | null;
  works_m: boolean | null;
  works_t: boolean | null;
  works_w: boolean | null;
  works_h: boolean | null;
  works_f: boolean | null;
};

type RosterRow = Record<string, any> & {
  roster_member_id: string;
  full_name: string | null;
  worker_type?: string | null;
  employment_status: string | null;
  hire_date: string | null;
  driver_program?: string | null;
  driver_utilization_category?: string | null;
  scheduled_days_per_week?: number | null;
  driver_full_time_day_threshold?: number | null;
  route_utilization_ratio?: number | string | null;
};

type LoadResult = {
  data: RosterRow[] | null;
  error: QueryError | null;
  source: "utilization_view" | "compatibility_projection";
};

const DEFAULT_FULL_TIME_DAY_THRESHOLD = 5;

function isMissingRelation(error: QueryError | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function countPresetDays(preset: PresetRow | null) {
  if (!preset) return null;
  return [
    preset.works_s,
    preset.works_u,
    preset.works_m,
    preset.works_t,
    preset.works_w,
    preset.works_h,
    preset.works_f,
  ].filter(Boolean).length;
}

export function projectRosterUtilizationRows({
  rosterRows,
  baselineRows,
  presetRows,
  fullTimeDayThreshold = DEFAULT_FULL_TIME_DAY_THRESHOLD,
}: {
  rosterRows: RosterRow[];
  baselineRows: BaselineRow[];
  presetRows: PresetRow[];
  fullTimeDayThreshold?: number;
}) {
  const threshold =
    Number.isInteger(fullTimeDayThreshold) &&
    fullTimeDayThreshold >= 1 &&
    fullTimeDayThreshold <= 7
      ? fullTimeDayThreshold
      : DEFAULT_FULL_TIME_DAY_THRESHOLD;
  const baselineByRosterId = new Map<string, BaselineRow>();
  for (const baseline of baselineRows) {
    if (!baselineByRosterId.has(baseline.roster_member_id)) {
      baselineByRosterId.set(baseline.roster_member_id, baseline);
    }
  }
  const presetById = new Map(presetRows.map((preset) => [preset.id, preset]));

  return rosterRows.map((roster) => {
    const driverProgram = classifyDriverProgram(roster.worker_type);
    const baseline = baselineByRosterId.get(roster.roster_member_id) ?? null;
    const preset = baseline?.preset_id
      ? presetById.get(baseline.preset_id) ?? null
      : null;
    const scheduledDaysPerWeek = countPresetDays(preset);
    const category = driverProgram
      ? deriveDriverUtilizationCategory(scheduledDaysPerWeek, threshold)
      : null;

    return {
      ...roster,
      driver_program: driverProgram,
      schedule_baseline_id: baseline?.id ?? null,
      schedule_preset_id: preset?.id ?? null,
      schedule_preset_code: preset?.preset_code ?? null,
      scheduled_days_per_week: scheduledDaysPerWeek,
      driver_full_time_day_threshold: threshold,
      driver_utilization_category: category,
      route_utilization_ratio: driverProgram
        ? Math.min(1, (scheduledDaysPerWeek ?? 0) / threshold)
        : null,
    };
  });
}

/**
 * Reads the deployed utilization view when available. During a governed
 * migration rollout, projects the same contract from the existing roster and
 * schedule authorities so an older schema cannot take the roster offline.
 */
export async function loadRosterUtilizationRows({
  supabase,
  companyId,
  companySlug,
}: {
  supabase: SupabaseClient;
  companyId: string;
  companySlug: string;
}): Promise<LoadResult> {
  const utilizationResult = await supabase
    .from("company_roster_utilization_view")
    .select("*")
    .eq("company_id", companyId)
    .order("full_name");

  if (!utilizationResult.error) {
    return {
      data: (utilizationResult.data ?? []) as RosterRow[],
      error: null,
      source: "utilization_view",
    };
  }

  if (!isMissingRelation(utilizationResult.error)) {
    return {
      data: null,
      error: utilizationResult.error,
      source: "utilization_view",
    };
  }

  const rosterResult = await supabase
    .from("company_roster_view")
    .select("*")
    .eq("company_id", companyId)
    .order("full_name");

  if (rosterResult.error) {
    return {
      data: null,
      error: rosterResult.error,
      source: "compatibility_projection",
    };
  }

  const rosterRows = (rosterResult.data ?? []) as RosterRow[];
  const rosterIds = rosterRows
    .map((row) => row.roster_member_id)
    .filter(Boolean);

  if (rosterIds.length === 0) {
    return { data: [], error: null, source: "compatibility_projection" };
  }

  const [baselineResult, configResult] = await Promise.all([
    supabase
      .from("schedule_baseline")
      .select("id, roster_member_id, preset_id, effective_start, updated_at")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .is("effective_end", null)
      .in("roster_member_id", rosterIds)
      .order("effective_start", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabase.rpc("get_company_operations_config", {
      p_company_slug: companySlug,
    }),
  ]);

  if (baselineResult.error) {
    return {
      data: null,
      error: baselineResult.error,
      source: "compatibility_projection",
    };
  }

  const baselineRows = (baselineResult.data ?? []) as BaselineRow[];
  const presetIds = Array.from(
    new Set(
      baselineRows
        .map((row) => row.preset_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  let presetRows: PresetRow[] = [];

  if (presetIds.length > 0) {
    const presetResult = await supabase
      .from("schedule_preset")
      .select(
        "id, preset_code, works_s, works_u, works_m, works_t, works_w, works_h, works_f",
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("id", presetIds);

    if (presetResult.error) {
      return {
        data: null,
        error: presetResult.error,
        source: "compatibility_projection",
      };
    }
    presetRows = (presetResult.data ?? []) as PresetRow[];
  }

  const config =
    configResult.error || !configResult.data
      ? null
      : (configResult.data as Record<string, unknown>);
  const configuredThreshold = Number(config?.driver_full_time_day_threshold);

  return {
    data: projectRosterUtilizationRows({
      rosterRows,
      baselineRows,
      presetRows,
      fullTimeDayThreshold: configuredThreshold,
    }),
    error: null,
    source: "compatibility_projection",
  };
}
