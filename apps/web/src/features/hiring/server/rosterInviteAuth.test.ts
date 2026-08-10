import { describe, expect, it, vi } from "vitest";
import { createRosterInviteAuthLink } from "./rosterInviteAuth";

function adminMock(options?: {
  existingUserId?: string;
  emailConfirmedAt?: string;
}) {
  const existingUserId = options?.existingUserId;
  const listUsers = vi.fn().mockResolvedValue({
    data: {
      users: existingUserId
        ? [{
            id: existingUserId,
            email: "employee@example.com",
            email_confirmed_at: options?.emailConfirmedAt,
          }]
        : [],
    },
    error: null,
  });
  const generateLink = vi.fn().mockResolvedValue({
    data: {
      properties: { action_link: "https://auth.example/verify" },
      user: { id: existingUserId ?? "new-user-id" },
    },
    error: null,
  });

  return { listUsers, generateLink };
}

describe("createRosterInviteAuthLink", () => {
  it("creates an Auth invitation for a new employee", async () => {
    const admin = adminMock();

    const result = await createRosterInviteAuthLink(admin as never, {
      email: " Employee@Example.com ",
      redirectTo: "https://app.example/auth/callback",
      fullName: "Employee Name",
      companySlug: "example-company",
      rosterId: "roster-id",
    });

    expect(result).toEqual({
      actionLink: "https://auth.example/verify",
      authUserId: "new-user-id",
      isNewUser: true,
      shouldSetPassword: true,
    });
    expect(admin.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "invite",
        email: "employee@example.com",
      })
    );
  });

  it("uses a magic link when the employee already has an Auth account", async () => {
    const admin = adminMock({
      existingUserId: "existing-user-id",
      emailConfirmedAt: "2026-08-10T10:00:00.000Z",
    });

    const result = await createRosterInviteAuthLink(admin as never, {
      email: "employee@example.com",
      redirectTo: "https://app.example/auth/callback",
      fullName: "Employee Name",
      companySlug: "example-company",
      rosterId: "roster-id",
    });

    expect(result.isNewUser).toBe(false);
    expect(result.authUserId).toBe("existing-user-id");
    expect(result.shouldSetPassword).toBe(false);
    expect(admin.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: "magiclink" })
    );
  });

  it("surfaces Auth link generation errors", async () => {
    const admin = adminMock();
    admin.generateLink.mockResolvedValue({
      data: { properties: null, user: null },
      error: new Error("Auth provider unavailable"),
    });

    await expect(
      createRosterInviteAuthLink(admin as never, {
        email: "employee@example.com",
        redirectTo: "https://app.example/auth/callback",
        fullName: "Employee Name",
        companySlug: "example-company",
        rosterId: "roster-id",
      })
    ).rejects.toThrow("Auth provider unavailable");
  });
});
