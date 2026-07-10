import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripeServerClient, getStripeWebhookSecret } from "@/lib/stripe/server";
import { processCheckoutSessionCompleted } from "@/lib/stripe/webhooks/processCheckoutSessionCompleted";

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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const result = await processCheckoutSessionCompleted(event);

        return NextResponse.json({
          ok: true,
          received: true,
          event_id: event.id,
          event_type: event.type,
          handled: result.handled,
          duplicate: result.duplicate,
          company_id: result.companyId,
          checkout_session_id: result.checkoutSessionId,
        });
      }

      default:
        return NextResponse.json({
          ok: true,
          received: true,
          event_id: event.id,
          event_type: event.type,
          handled: false,
        });
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Stripe webhook processing failed.";

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
