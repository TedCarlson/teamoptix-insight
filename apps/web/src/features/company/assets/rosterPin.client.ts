type ApiError = {
  error?: string;
  detail?: string;
};

export async function updateRosterPin(input: {
  companySlug: string;
  rosterMemberId: string;
  pin: string;
}) {
  const response = await fetch(
    `/api/company/${encodeURIComponent(input.companySlug)}/people/roster/${encodeURIComponent(input.rosterMemberId)}/operations`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pin_id_no: input.pin }),
    },
  );

  const body = (await response.json().catch(() => ({}))) as ApiError;

  if (!response.ok) {
    throw new Error(
      body.detail ?? body.error ?? "Failed to save driver PIN.",
    );
  }
}
