import type Stripe from "stripe";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveEventCompanyId,
  resolveEventObjectId,
  stripeTimestamp,
} from "./stripeFinanceRecords";

type EventReceipt = {
  id: string;
  processing_status: "received" | "processed" | "ignored" | "failed";
  processing_attempts: number;
};

export type StripeEventReceipt = {
  id: string;
  duplicate: boolean;
  terminal: boolean;
};

function serializeEvent(event: Stripe.Event) {
  return JSON.parse(JSON.stringify(event));
}

export async function receiveStripeEvent(
  event: Stripe.Event
): Promise<StripeEventReceipt> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .schema("billing")
    .from("provider_event")
    .insert({
      provider: "stripe",
      provider_event_id: event.id,
      event_type: event.type,
      object_id: resolveEventObjectId(event),
      company_id: resolveEventCompanyId(event),
      provider_livemode: event.livemode,
      api_version: event.api_version ?? null,
      occurred_at: stripeTimestamp(event.created),
      processing_status: "received",
      payload: serializeEvent(event),
    })
    .select("id, processing_status, processing_attempts")
    .single();

  if (!error && data) {
    return { id: data.id, duplicate: false, terminal: false };
  }

  if (error?.code !== "23505") {
    throw new Error(error?.message ?? "Unable to record Stripe event receipt.");
  }

  const { data: existing, error: existingError } = await admin
    .schema("billing")
    .from("provider_event")
    .select("id, processing_status, processing_attempts")
    .eq("provider", "stripe")
    .eq("provider_event_id", event.id)
    .single<EventReceipt>();

  if (existingError || !existing) {
    throw new Error(
      existingError?.message ?? "Unable to load duplicate Stripe event receipt."
    );
  }

  const terminal = ["processed", "ignored"].includes(existing.processing_status);

  if (!terminal) {
    const { error: retryError } = await admin
      .schema("billing")
      .from("provider_event")
      .update({
        processing_status: "received",
        processing_attempts: existing.processing_attempts + 1,
        last_error: null,
        payload: serializeEvent(event),
      })
      .eq("id", existing.id);

    if (retryError) throw new Error(retryError.message);
  }

  return { id: existing.id, duplicate: true, terminal };
}

export async function finishStripeEvent(
  receiptId: string,
  result: {
    handled: boolean;
    companyId: string | null;
    customerId?: string | null;
  }
) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .schema("billing")
    .from("provider_event")
    .update({
      processing_status: result.handled ? "processed" : "ignored",
      company_id: result.companyId,
      customer_id: result.customerId ?? null,
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", receiptId);

  if (error) throw new Error(error.message);
}

export async function failStripeEvent(receiptId: string, errorMessage: string) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .schema("billing")
    .from("provider_event")
    .update({
      processing_status: "failed",
      processed_at: null,
      last_error: errorMessage,
    })
    .eq("id", receiptId);

  if (error) {
    console.error("Unable to record Stripe event failure.", {
      receiptId,
      error: error.message,
    });
  }
}
