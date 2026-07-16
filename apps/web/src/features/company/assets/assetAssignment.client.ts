import type { CompanyAssetRow } from "./asset.types";

type ApiError = {
  error?: string;
  detail?: string;
};

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export async function loadAssetsForAssignment(
  companySlug: string,
  assetTypeKey: string,
): Promise<CompanyAssetRow[]> {
  const response = await fetch(
    `/api/company/${companySlug}/assets/assignable?type=${encodeURIComponent(
      assetTypeKey,
    )}`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );

  const body = (await readJson(response)) as ApiError & {
    assets?: CompanyAssetRow[];
  };

  if (!response.ok) {
    throw new Error(
      body.detail ?? body.error ?? "Failed to load assets.",
    );
  }

  return Array.isArray(body.assets) ? body.assets : [];
}

export async function assignAssetToRosterSlot(input: {
  companySlug: string;
  assetId: string;
  rosterMemberId: string;
}) {
  const response = await fetch(
    `/api/company/${input.companySlug}/assets/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        asset_id: input.assetId,
        roster_member_id: input.rosterMemberId,
      }),
    },
  );

  const body = (await readJson(response)) as ApiError;

  if (!response.ok) {
    throw new Error(
      body.detail ?? body.error ?? "Failed to assign asset.",
    );
  }
}

export async function releaseAssetAssignment(input: {
  companySlug: string;
  assetId: string;
  reason?: string;
}) {
  const response = await fetch(
    `/api/company/${input.companySlug}/assets/release`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        asset_id: input.assetId,
        release_reason: input.reason ?? "RELEASED_FROM_ROSTER",
      }),
    },
  );

  const body = (await readJson(response)) as ApiError;

  if (!response.ok) {
    throw new Error(
      body.detail ?? body.error ?? "Failed to release asset.",
    );
  }
}
