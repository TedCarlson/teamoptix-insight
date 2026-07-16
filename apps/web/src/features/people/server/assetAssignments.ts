import type { SupabaseClient } from "@supabase/supabase-js";

export type RosterAssetValues = {
  scanner_serial: string | null;
  fuel_card: string | null;
  pin_id_no: string | null;
};

const EMPTY_ASSET_VALUES: RosterAssetValues = {
  scanner_serial: null,
  fuel_card: null,
  pin_id_no: null,
};

export async function loadRosterAssetValues(
  supabase: SupabaseClient,
  companySlug: string,
  rosterIds: string[]
): Promise<Map<string, RosterAssetValues>> {
  const result = new Map<string, RosterAssetValues>();

  if (!rosterIds.length) {
    return result;
  }

  const { data, error } = await supabase
    .from("company_assets_v")
    .select("assigned_roster_member_id, asset_type_key, asset_identifier")
    .eq("company_slug", companySlug)
    .in("assigned_roster_member_id", rosterIds);

  if (error) {
    throw new Error(error.message);
  }

  for (const asset of data ?? []) {
    const rosterId = typeof asset.assigned_roster_member_id === "string" ? asset.assigned_roster_member_id : null;
    if (!rosterId) continue;

    const current = result.get(rosterId) ?? { ...EMPTY_ASSET_VALUES };
    const assetTypeKey = typeof asset.asset_type_key === "string" ? asset.asset_type_key.toUpperCase() : "";
    const assetIdentifier = typeof asset.asset_identifier === "string" ? asset.asset_identifier.trim() : "";

    if (assetTypeKey === "SCANNER") {
      current.scanner_serial = assetIdentifier || null;
    } else if (assetTypeKey === "FUEL_CARD") {
      current.fuel_card = assetIdentifier || null;
    } else if (assetTypeKey === "PIN") {
      current.pin_id_no = assetIdentifier || null;
    }

    result.set(rosterId, current);
  }

  return result;
}
