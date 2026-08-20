export type VercelCredentialConfiguration = {
  accessToken: string;
  projectId: string;
  teamId?: string;
};

export type VercelRedeployResult = {
  deploymentId: string;
  deploymentUrl: string | null;
};

type FetchImplementation = typeof fetch;

export class VercelCredentialRotationError extends Error {
  constructor(
    public readonly stage: "environment_update" | "deployment_lookup" | "redeploy",
    public readonly status: number | null
  ) {
    super(`Vercel credential rotation failed during ${stage}.`);
    this.name = "VercelCredentialRotationError";
  }
}

export async function updateVercelProductionStripeCredential(
  configuration: VercelCredentialConfiguration,
  stripeApiKey: string,
  fetchImplementation: FetchImplementation = fetch
) {
  const query = vercelTeamQuery(configuration.teamId);
  query.set("upsert", "true");

  const response = await fetchImplementation(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(configuration.projectId)}/env?${query}`,
    {
      method: "POST",
      headers: vercelHeaders(configuration.accessToken),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        key: "STRIPE_SECRET_KEY",
        value: stripeApiKey,
        type: "sensitive",
        target: ["production"],
        comment: "Rotated from TeamOptix Stripe administration",
      }),
    }
  );

  if (!response.ok) {
    throw new VercelCredentialRotationError("environment_update", response.status);
  }
}

export async function redeployLatestVercelProduction(
  configuration: VercelCredentialConfiguration,
  fetchImplementation: FetchImplementation = fetch
): Promise<VercelRedeployResult> {
  const lookupQuery = new URLSearchParams({
    projectId: configuration.projectId,
    target: "production",
    limit: "10",
  });
  if (configuration.teamId) lookupQuery.set("teamId", configuration.teamId);

  const lookupResponse = await fetchImplementation(
    `https://api.vercel.com/v6/deployments?${lookupQuery}`,
    {
      headers: vercelHeaders(configuration.accessToken, false),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!lookupResponse.ok) {
    throw new VercelCredentialRotationError("deployment_lookup", lookupResponse.status);
  }

  const lookupPayload = (await lookupResponse.json()) as {
    deployments?: Array<{
      uid?: string;
      url?: string;
      state?: string;
      readyState?: string;
    }>;
  };
  const deployment = lookupPayload.deployments?.find((candidate) => {
    const state = String(candidate.readyState ?? candidate.state ?? "").toUpperCase();
    return Boolean(candidate.uid) && state === "READY";
  });

  if (!deployment?.uid) {
    throw new VercelCredentialRotationError("deployment_lookup", null);
  }

  const redeployQuery = vercelTeamQuery(configuration.teamId);
  const redeployResponse = await fetchImplementation(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(deployment.uid)}/rebuild?${redeployQuery}`,
    {
      method: "POST",
      headers: vercelHeaders(configuration.accessToken),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      body: "{}",
    }
  );

  if (!redeployResponse.ok) {
    throw new VercelCredentialRotationError("redeploy", redeployResponse.status);
  }

  const redeployPayload = (await redeployResponse.json()) as {
    id?: string;
    uid?: string;
    url?: string;
  };

  return {
    deploymentId: redeployPayload.uid ?? redeployPayload.id ?? deployment.uid,
    deploymentUrl: redeployPayload.url
      ? `https://${redeployPayload.url}`
      : deployment.url
        ? `https://${deployment.url}`
        : null,
  };
}

function vercelHeaders(accessToken: string, includeContentType = true) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(includeContentType ? { "Content-Type": "application/json" } : {}),
  };
}

function vercelTeamQuery(teamId: string | undefined) {
  const query = new URLSearchParams();
  if (teamId) query.set("teamId", teamId);
  return query;
}
