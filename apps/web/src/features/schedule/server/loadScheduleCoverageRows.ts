import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleCoverageRow } from "@/features/schedule/lib/scheduleCoverageSummary";

type QueryError = {
  code?: string | null;
  message: string;
};

const PAGE_SIZE = 500;

export async function loadScheduleCoverageRows({
  supabase,
  companyId,
  startDate,
  endDate,
}: {
  supabase: SupabaseClient;
  companyId: string;
  startDate: string;
  endDate: string;
}): Promise<{ data: ScheduleCoverageRow[] | null; error: QueryError | null }> {
  const rows: ScheduleCoverageRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await supabase
      .from("schedule_day_fact_view")
      .select(
        "service_date, roster_member_id, full_name, worker_type, employment_status, planned_on, route_name, override_type",
      )
      .eq("company_id", companyId)
      .gte("service_date", startDate)
      .lte("service_date", endDate)
      .order("service_date")
      .order("roster_member_id")
      .order("route_name")
      .range(from, from + PAGE_SIZE - 1);

    if (result.error) return { data: null, error: result.error };

    const page = (result.data ?? []) as ScheduleCoverageRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { data: rows, error: null };
}
