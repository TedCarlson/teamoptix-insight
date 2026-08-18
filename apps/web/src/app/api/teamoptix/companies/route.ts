import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getGovernedCompanies } from "@/features/teamoptix/command-center/commandCenter.server";

export const dynamic = "force-dynamic";

const productFoundation = [
  {
    product_key: "insight-pd-last-mile",
    product_name: "Insight - P&D Last Mile",
    product_short_name: "P&D Last Mile",
    product_status: "in_service",
  },
  {
    product_key: "insight-telecom-fulfillment",
    product_name: "Insight - Telecom Fulfillment",
    product_short_name: "Telecom Fulfillment",
    product_status: "in_review",
  },
  {
    product_key: "utility-locate-service",
    product_name: "Utility Locate Service",
    product_short_name: "Utility Locate",
    product_status: "planned",
  },
] as const;

function isMissingProductFoundation(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "PGRST202" ||
        error.message?.includes("platform_product_catalog") ||
        error.message?.includes("platform_product_companies"))
  );
}

export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: access } = await supabase.rpc("access_context");
  if (!access?.is_platform_owner) {
    return NextResponse.json({ error: "Platform owner access required" }, { status: 403 });
  }

  const productKey = new URL(request.url).searchParams.get("product")?.trim();

  if (!productKey) {
    const { data, error } = await supabase.rpc("platform_product_catalog");
    if (error) {
      if (isMissingProductFoundation(error)) {
        const governedCompanies = await getGovernedCompanies();
        return NextResponse.json({
          products: productFoundation.map((product) => ({
            ...product,
            company_count:
              product.product_key === "insight-pd-last-mile"
                ? governedCompanies.length
                : 0,
          })),
          foundation_pending: true,
        });
      }

      return NextResponse.json(
        { error: `Unable to load the product catalog: ${error.message}` },
        { status: 503 }
      );
    }

    return NextResponse.json({ products: data ?? [] });
  }

  const { data, error } = await supabase.rpc("platform_product_companies", {
    p_product_key: productKey,
  });

  if (error) {
    if (isMissingProductFoundation(error)) {
      if (productKey === "insight-pd-last-mile") {
        const companies = await getGovernedCompanies();
        return NextResponse.json({
          companies: companies.map((company) => ({
            id: company.id,
            company_name: company.company_name ?? company.company_slug,
            legal_name: null,
            company_slug: company.company_slug,
            company_status: company.company_status,
            provisioning_status: "claimed",
            participation_status: "active",
            location_count: 0,
          })),
          foundation_pending: true,
        });
      }

      return NextResponse.json({ companies: [], foundation_pending: true });
    }

    return NextResponse.json(
      { error: `Unable to load product companies: ${error.message}` },
      { status: 503 }
    );
  }

  return NextResponse.json({ companies: data ?? [] });
}
