import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDispatchRequestContext } from "@/features/dispatch/server/resolveDispatchCompany.server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type HolidayWorkflowBody = {
  action?: "SET" | "CLEAR";
  dispatch_date?: string;
  roster_member_ids?: string[];
  closure_event_id?: string;
};

type DispatchEventPayload = {
  id?: unknown;
  event_code?: unknown;
  event_payload?: unknown;
};

const ZERO_TERMINAL_ID = "00000000-0000-0000-0000-000000000000";

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 500);
}

function payloadIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return cleanIds(
    (value as Record<string, unknown>).workforce_override_ids
  );
}

async function paintHolidayDate(
  supabase: SupabaseClient,
  companyId: string,
  dispatchDate: string
) {
  return supabase.rpc("paint_schedule_day_fact_for_company", {
    p_company_id: companyId,
    p_start_date: dispatchDate,
    p_horizon_days: 1,
  });
}

async function recordContextEvent(params: {
  supabase: SupabaseClient;
  companyId: string;
  profileId: string | null;
  dispatchDate: string;
  eventCode: string;
  eventLabel: string;
  note: string;
  eventPayload: Record<string, unknown>;
}) {
  return params.supabase.rpc("dispatch_record_event", {
    p_company_id: params.companyId,
    p_dispatch_date: params.dispatchDate,
    p_event_code: params.eventCode,
    p_event_label: params.eventLabel,
    p_event_category: "OPERATIONS",
    p_route_key: null,
    p_route_label: null,
    p_seat: null,
    p_person_roster_member_id: null,
    p_person_name: null,
    p_from_route_key: null,
    p_from_route_label: null,
    p_to_route_key: null,
    p_to_route_label: null,
    p_note: params.note,
    p_event_payload: params.eventPayload,
    p_created_by_profile_id: params.profileId,
  });
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = (await req.json()) as HolidayWorkflowBody;
    const dispatchDate = body.dispatch_date;

    if (!isIsoDate(dispatchDate)) {
      return NextResponse.json(
        { error: "A valid dispatch_date is required." },
        { status: 400 }
      );
    }

    const ctx = await getDispatchRequestContext(slug);
    if ("error" in ctx) return ctx.error;

    if (body.action === "SET") {
      const requestedIds = cleanIds(body.roster_member_ids);

      if (requestedIds.length > 0) {
        const { data: rosterRows, error: rosterError } = await ctx.supabase
          .from("company_roster_view")
          .select("roster_member_id")
          .eq("company_id", ctx.company.id)
          .in("roster_member_id", requestedIds);

        if (rosterError) {
          return NextResponse.json(
            { error: rosterError.message, step: "validate_workforce" },
            { status: 500 }
          );
        }

        const validIds = new Set(
          (rosterRows ?? []).map((row) => String(row.roster_member_id))
        );
        if (requestedIds.some((id) => !validIds.has(id))) {
          return NextResponse.json(
            { error: "Holiday workforce contains an invalid roster member." },
            { status: 400 }
          );
        }
      }

      const { data: insertedRows, error: insertError } = requestedIds.length
        ? await ctx.supabase
            .from("schedule_override")
            .insert(
              requestedIds.map((rosterMemberId) => ({
                company_id: ctx.company.id,
                terminal_id: ZERO_TERMINAL_ID,
                roster_member_id: rosterMemberId,
                override_type: "HOLIDAY",
                start_date: dispatchDate,
                end_date: dispatchDate,
                route_name_override: null,
                manager_note: `Holiday closure · ${dispatchDate} · Operations Calendar`,
                is_active: true,
              }))
            )
            .select("id, roster_member_id")
        : { data: [], error: null };

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message, step: "prepare_workforce_overrides" },
          { status: 500 }
        );
      }

      const overrideIds = (insertedRows ?? []).map((row) => String(row.id));
      const { error: paintError } = await paintHolidayDate(
        ctx.supabase,
        ctx.company.id,
        dispatchDate
      );

      if (paintError) {
        if (overrideIds.length) {
          await ctx.supabase
            .from("schedule_override")
            .delete()
            .eq("company_id", ctx.company.id)
            .in("id", overrideIds);
        }
        return NextResponse.json(
          { error: paintError.message, step: "paint_holiday_schedule" },
          { status: 500 }
        );
      }

      if (requestedIds.length) {
        const expectedOverrideByRosterId = new Map(
          (insertedRows ?? []).map((row) => [
            String(row.roster_member_id),
            String(row.id),
          ])
        );
        const { data: resolvedRows, error: verificationError } =
          await ctx.supabase
            .from("schedule_day_fact")
            .select("roster_member_id, planned_on, override_id")
            .eq("company_id", ctx.company.id)
            .eq("service_date", dispatchDate)
            .in("roster_member_id", requestedIds);
        const resolvedByRosterId = new Map(
          (resolvedRows ?? []).map((row) => [String(row.roster_member_id), row])
        );
        const holidayWasApplied = requestedIds.every((rosterMemberId) => {
          const row = resolvedByRosterId.get(rosterMemberId);
          return Boolean(
            row &&
              row.planned_on === false &&
              String(row.override_id) ===
                expectedOverrideByRosterId.get(rosterMemberId)
          );
        });

        if (verificationError || !holidayWasApplied) {
          await ctx.supabase
            .from("schedule_override")
            .delete()
            .eq("company_id", ctx.company.id)
            .in("id", overrideIds);
          await paintHolidayDate(ctx.supabase, ctx.company.id, dispatchDate);
          return NextResponse.json(
            {
              error:
                verificationError?.message ??
                "Holiday workforce support is not active in this environment yet.",
              step: "verify_holiday_schedule",
            },
            { status: 503 }
          );
        }
      }

      const { data: eventData, error: eventError } = await recordContextEvent({
        supabase: ctx.supabase,
        companyId: ctx.company.id,
        profileId: ctx.access?.profile_id ?? null,
        dispatchDate,
        eventCode: "OPERATIONS_CLOSED",
        eventLabel: "Holiday / non-operating",
        note: "Holiday set from the Operations Calendar.",
        eventPayload: {
          source: "operations_calendar",
          operating_context: "HOLIDAY",
          workforce_override_type: "HOLIDAY",
          workforce_override_ids: overrideIds,
          workforce_override_count: overrideIds.length,
        },
      });

      if (eventError) {
        if (overrideIds.length) {
          await ctx.supabase
            .from("schedule_override")
            .delete()
            .eq("company_id", ctx.company.id)
            .in("id", overrideIds);
          await paintHolidayDate(ctx.supabase, ctx.company.id, dispatchDate);
        }
        return NextResponse.json(
          { error: eventError.message, step: "close_operation" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        ...(eventData ?? {}),
        workforce_override_count: overrideIds.length,
      });
    }

    if (body.action === "CLEAR") {
      const closureEventId = body.closure_event_id?.trim();
      if (!closureEventId) {
        return NextResponse.json(
          { error: "closure_event_id is required." },
          { status: 400 }
        );
      }

      const { data: dayData, error: dayError } = await ctx.supabase.rpc(
        "dispatch_get_or_create_day",
        {
          p_company_id: ctx.company.id,
          p_dispatch_date: dispatchDate,
        }
      );

      if (dayError) {
        return NextResponse.json(
          { error: dayError.message, step: "load_holiday_context" },
          { status: 500 }
        );
      }

      const dayRecord = dayData && typeof dayData === "object"
        ? (dayData as Record<string, unknown>)
        : {};
      const events = Array.isArray(dayRecord.events)
        ? (dayRecord.events as DispatchEventPayload[])
        : [];
      const closureEvent = events.find(
        (event) =>
          event.id === closureEventId && event.event_code === "OPERATIONS_CLOSED"
      );

      if (!closureEvent) {
        return NextResponse.json(
          { error: "Holiday closure event was not found." },
          { status: 404 }
        );
      }

      const overrideIds = payloadIds(closureEvent.event_payload);
      if (overrideIds.length) {
        const { error: releaseError } = await ctx.supabase
          .from("schedule_override")
          .update({ is_active: false })
          .eq("company_id", ctx.company.id)
          .eq("override_type", "HOLIDAY")
          .in("id", overrideIds);

        if (releaseError) {
          return NextResponse.json(
            { error: releaseError.message, step: "release_workforce_overrides" },
            { status: 500 }
          );
        }
      }

      const { error: paintError } = await paintHolidayDate(
        ctx.supabase,
        ctx.company.id,
        dispatchDate
      );
      if (paintError) {
        if (overrideIds.length) {
          await ctx.supabase
            .from("schedule_override")
            .update({ is_active: true })
            .eq("company_id", ctx.company.id)
            .in("id", overrideIds);
          await paintHolidayDate(ctx.supabase, ctx.company.id, dispatchDate);
        }
        return NextResponse.json(
          { error: paintError.message, step: "repaint_reopened_schedule" },
          { status: 500 }
        );
      }

      const { data: eventData, error: eventError } = await recordContextEvent({
        supabase: ctx.supabase,
        companyId: ctx.company.id,
        profileId: ctx.access?.profile_id ?? null,
        dispatchDate,
        eventCode: "UNDO_OPERATIONS_CLOSED",
        eventLabel: "Return to inherited operating plan",
        note: "Holiday cleared from the Operations Calendar.",
        eventPayload: {
          source: "operations_calendar",
          reverses_event_id: closureEventId,
          reverses_event_code: "OPERATIONS_CLOSED",
          released_workforce_override_ids: overrideIds,
        },
      });

      if (eventError) {
        if (overrideIds.length) {
          await ctx.supabase
            .from("schedule_override")
            .update({ is_active: true })
            .eq("company_id", ctx.company.id)
            .in("id", overrideIds);
          await paintHolidayDate(ctx.supabase, ctx.company.id, dispatchDate);
        }
        return NextResponse.json(
          { error: eventError.message, step: "reopen_operation" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        ...(eventData ?? {}),
        workforce_override_count: 0,
      });
    }

    return NextResponse.json(
      { error: "action must be SET or CLEAR." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update the holiday operation.",
      },
      { status: 500 }
    );
  }
}
