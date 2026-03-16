import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PresetPayload = {
  preset_code?: string | null;
  works_s?: boolean | null;
  works_u?: boolean | null;
  works_m?: boolean | null;
  works_t?: boolean | null;
  works_w?: boolean | null;
  works_h?: boolean | null;
  works_f?: boolean | null;
  uses_rotation?: boolean | null;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found", presets: [] },
        { status: 404 }
      );
    }

    const { data, error } = await sb
      .from("schedule_preset")
      .select(`
        id,
        preset_code,
        works_s,
        works_u,
        works_m,
        works_t,
        works_w,
        works_h,
        works_f,
        uses_rotation,
        is_active,
        created_at,
        updated_at
      `)
      .eq("company_id", company.id)
      .eq("is_active", true)
      .order("preset_code");

    if (error) {
      return NextResponse.json(
        { error: error.message, presets: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      company_id: company.id,
      presets: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load presets.";

    return NextResponse.json(
      { error: message, presets: [] },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();
    const body = (await req.json()) as PresetPayload;

    const presetCode = String(body?.preset_code ?? "").trim().toUpperCase();

    if (!presetCode) {
      return NextResponse.json(
        { error: "preset_code is required" },
        { status: 400 }
      );
    }

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const insertRow = {
      company_id: company.id,
      preset_code: presetCode,
      works_s: Boolean(body?.works_s),
      works_u: Boolean(body?.works_u),
      works_m: Boolean(body?.works_m),
      works_t: Boolean(body?.works_t),
      works_w: Boolean(body?.works_w),
      works_h: Boolean(body?.works_h),
      works_f: Boolean(body?.works_f),
      uses_rotation: Boolean(body?.uses_rotation),
      is_active: true,
    };

    const { data, error } = await sb
      .from("schedule_preset")
      .insert(insertRow)
      .select(`
        id,
        preset_code,
        works_s,
        works_u,
        works_m,
        works_t,
        works_w,
        works_h,
        works_f,
        uses_rotation,
        is_active,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        preset: data,
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create preset.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}