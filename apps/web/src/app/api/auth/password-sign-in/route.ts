import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/security/turnstile";

export const runtime = "nodejs";

// Authentication can be materially slower while a Nano database recovers from
// exhausted burst I/O. Keep the request bounded without rejecting a valid
// sign-in during temporary resource pressure.
const AUTH_TIMEOUT_MS = 60_000;

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  const upstreamSignal = init?.signal;
  const abortFromUpstream = () => controller.abort();

  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener("abort", abortFromUpstream, {
      once: true,
    });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  });
}

function authErrorMessage(error: {
  message?: string;
  code?: string;
  status?: number;
}) {
  const message = String(error.message ?? "").trim();

  if (!message || message === "{}" || message === "[object Object]") {
    return "The authentication service did not return a valid response.";
  }

  if (message.toLowerCase().includes("operation was aborted")) {
    return "The authentication service is still recovering from database resource pressure. Please try again.";
  }

  return message;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const email =
      typeof payload?.email === "string" ? payload.email.trim() : "";
    const password =
      typeof payload?.password === "string" ? payload.password : "";
    const captchaToken =
      typeof payload?.captchaToken === "string"
        ? payload.captchaToken.trim()
        : "";

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required." },
        { status: 400, headers: noStoreHeaders }
      );
    }

    if (process.env.TURNSTILE_REQUIRED === "true") {
      if (!captchaToken) {
        return NextResponse.json(
          { ok: false, error: "Security verification is required." },
          { status: 400, headers: noStoreHeaders }
        );
      }

      const remoteIp =
        request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const verified = await verifyTurnstile(captchaToken, remoteIp);

      if (!verified) {
        return NextResponse.json(
          {
            ok: false,
            error: "Security verification failed. Please try again.",
          },
          { status: 403, headers: noStoreHeaders }
        );
      }
    }

    const supabase = await getSupabaseServerClient({
      fetch: fetchWithTimeout,
    });
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const status =
        error.status === 400 || error.status === 401 ? 401 : 503;

      return NextResponse.json(
        { ok: false, error: authErrorMessage(error), code: error.code ?? null },
        { status, headers: noStoreHeaders }
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error) {
    const timedOut =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError";

    return NextResponse.json(
      {
        ok: false,
        error: timedOut
          ? "The authentication service timed out. Please try again."
          : "Unable to complete sign-in.",
      },
      { status: timedOut ? 504 : 503, headers: noStoreHeaders }
    );
  }
}
