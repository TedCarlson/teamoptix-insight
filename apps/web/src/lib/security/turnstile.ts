export type TurnstileVerification = { success: boolean; errorCodes: string[]; hostname?: string };

export async function verifyTurnstileDetailed(
  token: string,
  remoteIp?: string
): Promise<TurnstileVerification> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    throw new Error("Missing TURNSTILE_SECRET_KEY.");
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  if (!response.ok) {
    return { success: false, errorCodes: [`siteverify-http-${response.status}`] };
  }

  const result = (await response.json()) as {
    success?: boolean;
    hostname?: string;
    "error-codes"?: string[];
  };

  return { success: result.success === true, errorCodes: result["error-codes"] ?? [], hostname: result.hostname };
}

export async function verifyTurnstile(token: string, remoteIp?: string): Promise<boolean> {
  return (await verifyTurnstileDetailed(token, remoteIp)).success;
}
