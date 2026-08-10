import type { SupabaseClient, User } from "@supabase/supabase-js";

type AuthAdmin = Pick<
  SupabaseClient["auth"]["admin"],
  "generateLink" | "listUsers"
>;

const AUTH_USERS_PER_PAGE = 1_000;

export type RosterInviteAuthLink = {
  actionLink: string;
  authUserId: string;
  isNewUser: boolean;
  shouldSetPassword: boolean;
};

async function findAuthUserByEmail(
  admin: AuthAdmin,
  email: string
): Promise<User | null> {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.listUsers({
      page,
      perPage: AUTH_USERS_PER_PAGE,
    });

    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === email
    );

    if (match) return match;
    if (data.users.length < AUTH_USERS_PER_PAGE) return null;
  }

  throw new Error("Auth user lookup exceeded the supported page limit.");
}

export async function createRosterInviteAuthLink(
  admin: AuthAdmin,
  input: {
    email: string;
    redirectTo: string | ((shouldSetPassword: boolean) => string);
    fullName: string;
    companySlug: string;
    rosterId: string;
  }
): Promise<RosterInviteAuthLink> {
  const email = input.email.trim().toLowerCase();
  const existingUser = await findAuthUserByEmail(admin, email);
  const isNewUser = !existingUser;
  const shouldSetPassword = isNewUser || !existingUser?.email_confirmed_at;
  const redirectTo =
    typeof input.redirectTo === "function"
      ? input.redirectTo(shouldSetPassword)
      : input.redirectTo;

  const { data, error } = await admin.generateLink({
    type: isNewUser ? "invite" : "magiclink",
    email,
    options: {
      redirectTo,
      data: {
        full_name: input.fullName,
        company_slug: input.companySlug,
        roster_id: input.rosterId,
        invitation_source: "company_roster",
      },
    },
  });

  if (error) throw error;

  const actionLink = data.properties?.action_link;
  const authUserId = data.user?.id ?? existingUser?.id;

  if (!actionLink || !authUserId) {
    throw new Error("Supabase did not return a complete invitation link.");
  }

  return {
    actionLink,
    authUserId,
    isNewUser,
    shouldSetPassword,
  };
}
