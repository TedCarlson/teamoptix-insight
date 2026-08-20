"use server";

import Stripe from "stripe";
import {
  describeStripeApiKey,
  describeStripeConnectionError,
  validateProductionStripeApiKey,
} from "@/lib/stripe/apiKey";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { StripeCredentialRotationState } from "@/features/teamoptix/billing/stripeCredentialRotation.types";
import {
  redeployLatestVercelProduction,
  updateVercelProductionStripeCredential,
  type VercelCredentialConfiguration,
} from "@/features/teamoptix/billing/vercelStripeCredential";

export async function rotateStripeProductionCredential(
  _previousState: StripeCredentialRotationState,
  formData: FormData
): Promise<StripeCredentialRotationState> {
  if (!(await isPlatformOwner())) {
    return {
      status: "error",
      message: "Your session is not authorized to rotate platform credentials.",
    };
  }

  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return {
      status: "error",
      message: "Production credentials can only be rotated from the production TeamOptix workspace.",
    };
  }

  if (formData.get("confirmProductionRotation") !== "ROTATE") {
    return {
      status: "error",
      message: "Confirm that this rotation targets the Production environment.",
    };
  }

  const stripeApiKey = String(formData.get("stripeApiKey") ?? "").trim();
  const validationError = validateProductionStripeApiKey(stripeApiKey);
  if (validationError) {
    return { status: "error", message: validationError };
  }

  const configuration = vercelConfiguration();
  if (!configuration) {
    return {
      status: "error",
      message:
        "Vercel credential automation is not configured. Add VERCEL_ACCESS_TOKEN and VERCEL_PROJECT_ID before using this control.",
    };
  }

  try {
    await validateStripeCredentialAccess(stripeApiKey);
  } catch (error) {
    return {
      status: "error",
      message: describeStripeConnectionError(error).message,
    };
  }

  try {
    await updateVercelProductionStripeCredential(configuration, stripeApiKey);
  } catch {
    return {
      status: "error",
      message:
        "Stripe accepted the replacement credential, but Vercel could not save it. No deployment was started.",
    };
  }

  const credentialLabel = describeStripeApiKey(stripeApiKey).maskedLabel;

  try {
    const deployment = await redeployLatestVercelProduction(configuration);
    return {
      status: "success",
      message:
        "The replacement credential was saved as a Sensitive Production variable and a production rebuild was queued.",
      credentialLabel,
      deploymentId: deployment.deploymentId,
      deploymentUrl: deployment.deploymentUrl,
    };
  } catch {
    return {
      status: "partial",
      message:
        "The replacement credential was saved in Vercel, but the production rebuild could not be queued. Redeploy the latest Production deployment from Vercel before testing billing.",
      credentialLabel,
    };
  }
}

async function validateStripeCredentialAccess(stripeApiKey: string) {
  const stripe = new Stripe(stripeApiKey, {
    apiVersion: "2026-06-24.dahlia",
    typescript: true,
  });

  await Promise.all([
    stripe.customers.list({ limit: 1 }),
    stripe.products.list({ limit: 1 }),
    stripe.prices.list({ limit: 1 }),
    stripe.subscriptions.list({ limit: 1, status: "all" }),
    stripe.invoices.list({ limit: 1 }),
    stripe.paymentIntents.list({ limit: 1 }),
    stripe.checkout.sessions.list({ limit: 1 }),
    stripe.tax.settings.retrieve(),
  ]);
}

function vercelConfiguration(): VercelCredentialConfiguration | null {
  const accessToken = process.env.VERCEL_ACCESS_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();

  if (!accessToken || !projectId) return null;

  return {
    accessToken,
    projectId,
    ...(teamId ? { teamId } : {}),
  };
}

async function isPlatformOwner() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return false;

  const { error: contextError } = await supabase.rpc("ensure_access_context");
  if (contextError) return false;

  const { data: access, error: accessError } = await supabase.rpc("access_context");
  return !accessError && Boolean(access?.is_platform_owner);
}
