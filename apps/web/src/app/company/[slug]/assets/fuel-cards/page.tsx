import { getSupabaseServerClient } from "@/lib/supabase/server";
import CompanyAssetsPageShell from "@/features/company/assets/CompanyAssetsPageShell";
import CompanyAssetsTable from "@/features/company/assets/CompanyAssetsTable";
import type { CompanyAssetRow } from "@/features/company/assets/asset.types";
import { loadAssetsWithAssignedRosterPins } from "@/features/company/assets/server/assignedRosterPins";

function cleanSearch(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[,%]/g, " ").trim();
}

export default async function FuelCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const q = cleanSearch(resolvedSearchParams?.q);
  const supabase = await getSupabaseServerClient();

  const query = supabase
    .from("company_assets_v")
    .select("*")
    .eq("company_slug", slug)
    .eq("asset_type_key", "FUEL_CARD")
    .order("status_sort_order", { ascending: true })
    .order("assigned_roster_member_name", { ascending: true, nullsFirst: false })
    .order("asset_identifier", { ascending: true });

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load fuel card assets: ${error.message}`);
  }
  const rows = await loadAssetsWithAssignedRosterPins(
    supabase,
    (data ?? []) as CompanyAssetRow[],
  );

  return (
    <CompanyAssetsPageShell
      title="Fuel Cards"
      description="Fuel card inventory, assignment, custody, return, and recovery tracking."
    >
      <CompanyAssetsTable
        eyebrow="Fuel card assets"
        title="Fuel Card Inventory"
        emptyLabel="No fuel card assets have been seeded yet."
        rows={rows}
        searchQuery={q}
        assetLabel="Fuel Card"
      />
    </CompanyAssetsPageShell>
  );
}
