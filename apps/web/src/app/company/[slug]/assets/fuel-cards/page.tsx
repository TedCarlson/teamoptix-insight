import { getSupabaseServerClient } from "@/lib/supabase/server";
import CompanyAssetsPageShell from "@/features/company/assets/CompanyAssetsPageShell";
import CompanyAssetsTable from "@/features/company/assets/CompanyAssetsTable";
import type { CompanyAssetRow } from "@/features/company/assets/asset.types";

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

  let query = supabase
    .from("company_assets_v")
    .select("*")
    .eq("company_slug", slug)
    .eq("asset_type_key", "FUEL_CARD")
    .order("status_sort_order", { ascending: true })
    .order("assigned_roster_member_name", { ascending: true, nullsFirst: false })
    .order("asset_identifier", { ascending: true });

  if (q) {
    query = query.or(
      [
        `asset_identifier.ilike.%${q}%`,
        `display_name.ilike.%${q}%`,
        `provider.ilike.%${q}%`,
        `secondary_identifier.ilike.%${q}%`,
        `notes.ilike.%${q}%`,
        `status_label.ilike.%${q}%`,
        `assigned_roster_member_name.ilike.%${q}%`,
      ].join(",")
    );
  }

  const { data } = await query;

  return (
    <CompanyAssetsPageShell
      title="Fuel Cards"
      description="Fuel card inventory, assignment, custody, return, and recovery tracking."
    >
      <CompanyAssetsTable
        eyebrow="Fuel card assets"
        title="Fuel Card Inventory"
        emptyLabel="No fuel card assets have been seeded yet."
        rows={(data || []) as CompanyAssetRow[]}
        searchQuery={q}
        assetLabel="Fuel Card"
      />
    </CompanyAssetsPageShell>
  );
}
