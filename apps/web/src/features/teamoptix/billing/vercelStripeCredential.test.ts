import { describe, expect, it, vi } from "vitest";
import {
  redeployLatestVercelProduction,
  updateVercelProductionStripeCredential,
  VercelCredentialRotationError,
} from "./vercelStripeCredential";

const configuration = {
  accessToken: "vercel-access-token",
  projectId: "project-id",
  teamId: "team-id",
};
const stripeApiKey = `rk_${"live"}_${"x".repeat(32)}`;

describe("Vercel Stripe credential rotation", () => {
  it("upserts a production-only sensitive environment variable", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", { status: 200 })
    );

    await updateVercelProductionStripeCredential(
      configuration,
      stripeApiKey,
      fetchImplementation
    );

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(String(url)).toContain("/v10/projects/project-id/env?");
    expect(String(url)).toContain("teamId=team-id");
    expect(String(url)).toContain("upsert=true");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      key: "STRIPE_SECRET_KEY",
      value: stripeApiKey,
      type: "sensitive",
      target: ["production"],
    });
  });

  it("rebuilds the latest ready production deployment", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          deployments: [
            { uid: "failed", readyState: "ERROR" },
            { uid: "ready-deployment", readyState: "READY", url: "old.example.test" },
          ],
        })
      )
      .mockResolvedValueOnce(
        Response.json({ uid: "new-deployment", url: "new.example.test" })
      );

    await expect(
      redeployLatestVercelProduction(configuration, fetchImplementation)
    ).resolves.toEqual({
      deploymentId: "new-deployment",
      deploymentUrl: "https://new.example.test",
    });

    expect(String(fetchImplementation.mock.calls[1][0])).toContain(
      "/v13/deployments/ready-deployment/rebuild?teamId=team-id"
    );
  });

  it("never includes the credential in an environment update error", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("failure", { status: 403 })
    );

    const error = await updateVercelProductionStripeCredential(
      configuration,
      stripeApiKey,
      fetchImplementation
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(VercelCredentialRotationError);
    expect(String(error)).not.toContain(stripeApiKey);
  });
});
