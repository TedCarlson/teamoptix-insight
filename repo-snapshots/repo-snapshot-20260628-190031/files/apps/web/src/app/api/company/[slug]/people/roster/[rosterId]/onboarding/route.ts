import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; rosterId: string }> }
) {
  try {
    const { slug, rosterId } = await params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 }
      );
    }

    const { data: rosterRow, error: rosterError } = await supabase
      .schema("core")
      .from("company_roster")
      .select("id, company_id, employment_status, onboarding_completed_at")
      .eq("id", rosterId)
      .eq("company_id", company.id)
      .single();

    if (rosterError || !rosterRow) {
      return NextResponse.json(
        { error: "Candidate not found." },
        { status: 404 }
      );
    }

    const { data: session } = await supabase
      .from("onboarding_session")
      .select("id, status, created_at, completed_at")
      .eq("candidate_id", rosterId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return NextResponse.json(
        {
          onboarding: {
            has_session: false,
            session_id: null,
            session_status: null,
            onboarding_completed_at: rosterRow.onboarding_completed_at ?? null,
            progress_pct: 0,
            current_step: null,
            steps: [],
          },
        },
        { status: 200 }
      );
    }

    const { data: steps, error: stepsError } = await supabase
      .from("onboarding_step")
      .select("step_key, label, step_order")
      .order("step_order", { ascending: true });

    if (stepsError) {
      return NextResponse.json(
        { error: stepsError.message },
        { status: 500 }
      );
    }

    const { data: progress, error: progressError } = await supabase
      .from("onboarding_step_progress")
      .select("step_key, completed, completed_at")
      .eq("session_id", session.id);

    if (progressError) {
      return NextResponse.json(
        { error: progressError.message },
        { status: 500 }
      );
    }

    const progressMap = new Map(
      (progress ?? []).map((row) => [row.step_key, row])
    );

    let currentStep: string | null = null;

    const mergedSteps = (steps ?? []).map((step) => {
      const hit = progressMap.get(step.step_key) as
        | { step_key: string; completed: boolean; completed_at: string | null }
        | undefined;

      const completed = hit?.completed ?? false;

      if (!completed && currentStep === null) {
        currentStep = step.label;
      }

      return {
        step_key: step.step_key,
        label: step.label,
        step_order: step.step_order,
        completed,
        completed_at: hit?.completed_at ?? null,
      };
    });

    const completedCount = mergedSteps.filter((step) => step.completed).length;
    const progressPct =
      mergedSteps.length === 0
        ? 0
        : Math.round((completedCount / mergedSteps.length) * 100);

    return NextResponse.json(
      {
        onboarding: {
          has_session: true,
          session_id: session.id,
          session_status: session.status ?? null,
          onboarding_completed_at: rosterRow.onboarding_completed_at ?? null,
          progress_pct: progressPct,
          current_step: currentStep,
          steps: mergedSteps,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load candidate onboarding.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}