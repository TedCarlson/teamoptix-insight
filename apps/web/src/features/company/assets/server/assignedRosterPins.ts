import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyAssetRow } from "../asset.types";

type RosterPinRow = {
  roster_id: string;
  pin_id_no: string | null;
};

export function mergeAssignedRosterPins(
  assets: CompanyAssetRow[],
  rosterPins: RosterPinRow[],
): CompanyAssetRow[] {
  const pinByRosterId = new Map(
    rosterPins.map((row) => [row.roster_id, row.pin_id_no]),
  );

  return assets.map((asset) => ({
    ...asset,
    assigned_roster_pin: asset.assigned_roster_member_id
      ? (pinByRosterId.get(asset.assigned_roster_member_id) ?? null)
      : null,
  }));
}

export async function loadAssetsWithAssignedRosterPins(
  supabase: SupabaseClient,
  assets: CompanyAssetRow[],
): Promise<CompanyAssetRow[]> {
  const rosterIds = Array.from(
    new Set(
      assets
        .map((asset) => asset.assigned_roster_member_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (!rosterIds.length) {
    return mergeAssignedRosterPins(assets, []);
  }

  const { data, error } = await supabase
    .from("company_roster_operations_fact_v")
    .select("roster_id, pin_id_no")
    .in("roster_id", rosterIds);

  if (error) {
    throw new Error(`Failed to load driver PINs: ${error.message}`);
  }

  return mergeAssignedRosterPins(assets, (data ?? []) as RosterPinRow[]);
}
