import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripeServerClient, getStripeWebhookSecret } from "@/lib/stripe/server";
import {
  failStripeEvent,
  finishStripeEvent,
  receiveStripeEvent,
} from "@/lib/stripe/webhooks/stripeEventLedger";
import { processStripeFinanceEvent } from "@/lib/stripe/webhooks/processStripeFinanceEvent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripeServerClient();
  const webhookSecret = getStripeWebhookSecret();

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Stripe webhook.";

    return NextResponse.json({ error: message }, { status: 400 });
  }

  let receiptId: string | null = null;

  try {
    const receipt = await receiveStripeEvent(event);
    receiptId = receipt.id;

    if (receipt.terminal) {
      return NextResponse.json({
        ok: true,
        received: true,
        event_id: event.id,
        event_type: event.type,
        handled: true,
        duplicate: true,
      });
    }

    const result = await processStripeFinanceEvent(event);
    await finishStripeEvent(receipt.id, result);

    return NextResponse.json({
      ok: true,
      received: true,
      event_id: event.id,
      event_type: event.type,
      handled: result.handled,
      duplicate: receipt.duplicate,
      company_id: result.companyId,
      object_id: result.objectId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Stripe webhook processing failed.";

    if (receiptId) await failStripeEvent(receiptId, message);

    console.error("Stripe webhook processing failed.", {
      eventId: event.id,
      eventType: event.type,
      error: message,
    });

    /*
     * Returning a non-2xx response tells Stripe that processing failed and
     * allows Stripe to retry the event.
     */
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
