import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; rosterId: string }>;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found.", checklist: [] },
        { status: 404 }
      );
    }

    const { data: configRows, error: configError } = await supabase
      .from("company_candidate_checklist_readiness_v")
      .select("*")
      .eq("company_id", company.id)
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true });

    if (configError) {
      return NextResponse.json(
        { error: configError.message, checklist: [] },
        { status: 500 }
      );
    }

    const { data: factRows, error: factError } = await supabase
      .from("roster_candidate_checklist_fact_v")
      .select("*")
      .eq("company_id", company.id)
      .eq("roster_id", rosterId);

    if (factError) {
      return NextResponse.json(
        { error: factError.message, checklist: [] },
        { status: 500 }
      );
    }

    const factByItemTypeId = new Map(
      (factRows ?? []).map((fact) => [fact.item_type_id, fact])
    );

    const checklist = ((configRows ?? []) as any[]).map((row) => {
      const fact = factByItemTypeId.get(row.item_type_id);

      return {
        item_type_id: row.item_type_id ?? "",
        item_key: row.item_key ?? "",
        label: row.display_label ?? row.default_label ?? "Checklist item",
        description: row.description ?? null,
        is_required: Boolean(row.is_required),
        sort_order: row.sort_order ?? 100,
        is_complete: Boolean(fact?.is_complete),
        readiness_weight: Number(row.readiness_weight ?? 1),
        completed_at: fact?.completed_at ?? null,
        note: fact?.note ?? null,
      };
    });

    const required = checklist.filter((item) => item.is_required);
    const completedRequired = required.filter((item) => item.is_complete);
    const requiredWeightTotal = required.reduce(
      (sum, item) => sum + Number(item.readiness_weight ?? 1),
      0
    );
    const requiredWeightComplete = completedRequired.reduce(
      (sum, item) => sum + Number(item.readiness_weight ?? 1),
      0
    );

    return NextResponse.json({
      company_id: company.id,
      roster_id: rosterId,
      checklist,
      progress: {
        required_total: required.length,
        required_complete: completedRequired.length,
        required_weight_total: requiredWeightTotal,
        required_weight_complete: requiredWeightComplete,
        percent:
          requiredWeightTotal === 0
            ? 100
            : Math.round((requiredWeightComplete / requiredWeightTotal) * 100),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load candidate checklist.";

    return NextResponse.json(
      { error: message, checklist: [] },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const body = await req.json().catch(() => ({}));
    const itemKey = cleanText(body.item_key);
    const isComplete = Boolean(body.is_complete);
    const note = cleanText(body.note);

    if (!itemKey) {
      return NextResponse.json(
        { error: "item_key is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("candidate_checklist_set_item", {
      p_company_slug: slug,
      p_roster_id: rosterId,
      p_item_key: itemKey,
      p_is_complete: isComplete,
      p_note: note,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? { ok: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update candidate checklist.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
