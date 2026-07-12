import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AccessMembership = {
  company_slug?: string | null;
  relationship_type?: string | null;
  membership_status?: string | null;
  role_key?: string | null;
};

type AccessContext = {
  is_platform_owner?: boolean | null;
  profile_id?: string | null;
  memberships?: AccessMembership[] | null;
};

type CompanyRow = {
  id: string;
  company_slug: string;
};

type MessageRow = {
  id: string;
  company_id: string;
  title: string;
  body: string;
  status: string;
  visibility: string;
  requires_ack: boolean;
  published_at: string | null;
  archived_at: string | null;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

type ResolvedContext =
  | {
      supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
      company: CompanyRow;
      access: AccessContext | null;
      membership: AccessMembership | null;
      canAdmin: boolean;
      error: null;
    }
  | {
      supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
      company?: never;
      access?: never;
      membership?: never;
      canAdmin?: never;
      error: NextResponse;
    };

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown) {
  const status = cleanString(value).toLowerCase();

  if (status === "published" || status === "archived" || status === "draft") {
    return status;
  }

  return "draft";
}

function normalizeVisibility(value: unknown) {
  const visibility = cleanString(value).toLowerCase();

  if (visibility === "all" || visibility === "drivers" || visibility === "leadership") {
    return visibility;
  }

  return "all";
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

async function resolveCompanyAndAccess(slug: string): Promise<ResolvedContext> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      supabase,
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const { data: access, error: accessError } = await supabase.rpc("access_context");

  if (accessError) {
    return {
      supabase,
      error: NextResponse.json({ error: accessError.message }, { status: 500 }),
    };
  }

  const typedAccess = access as AccessContext | null;
  const membership =
    typedAccess?.memberships?.find((item) => item.company_slug === slug) ?? null;

  if (!typedAccess?.is_platform_owner && !membership) {
    return {
      supabase,
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_slug")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return {
      supabase,
      error: NextResponse.json({ error: "Company not found." }, { status: 404 }),
    };
  }

  const canAdmin =
    Boolean(typedAccess?.is_platform_owner) ||
    (membership?.relationship_type === "admin" &&
      membership?.membership_status === "active");

  return {
    supabase,
    company,
    access: typedAccess,
    membership,
    canAdmin,
    error: null,
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await resolveCompanyAndAccess(slug);

  if (resolved.error) return resolved.error;

  const { supabase, company, access, canAdmin } = resolved;
  const url = new URL(req.url);
  const includeDrafts = url.searchParams.get("admin") === "1" && canAdmin;
  const includeHistory = url.searchParams.get("history") === "1";

  let query = supabase
    .from("company_message")
    .select(
      [
        "id",
        "company_id",
        "title",
        "body",
        "status",
        "visibility",
        "requires_ack",
        "published_at",
        "archived_at",
        "created_by_profile_id",
        "updated_by_profile_id",
        "created_at",
        "updated_at",
      ].join(", ")
    )
    .eq("company_id", company.id)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!includeDrafts) {
    query = query.eq("status", "published").is("archived_at", null);
  }

  const { data, error } = await query.limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = data ?? [];
  const messageIds = messages.map((message: any) => message.id).filter(Boolean);

  let acknowledgments: Record<string, string> = {};

  if (!includeDrafts && access?.profile_id && messageIds.length > 0) {
    const { data: ackRows, error: ackError } = await supabase
      .from("company_message_ack")
      .select("message_id, acknowledged_at")
      .eq("company_id", company.id)
      .eq("profile_id", access.profile_id)
      .in("message_id", messageIds);

    if (ackError) {
      return NextResponse.json({ error: ackError.message }, { status: 500 });
    }

    acknowledgments = Object.fromEntries(
      (ackRows ?? []).map((row: any) => [row.message_id, row.acknowledged_at])
    );
  }

  const hydratedMessages = messages.map((message: any) => ({
    ...message,
    acknowledged_at: acknowledgments[message.id] ?? null,
    acknowledged: Boolean(acknowledgments[message.id]),
  }));

  const visibleMessages =
    includeDrafts || includeHistory
      ? hydratedMessages
      : hydratedMessages.filter(
          (message: any) => !message.requires_ack || !message.acknowledged
        );

  return NextResponse.json({
    messages: visibleMessages,
    can_admin: canAdmin,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await resolveCompanyAndAccess(slug);

  if (resolved.error) return resolved.error;

  const { supabase, company, access, canAdmin } = resolved;

  if (!canAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = asObject(await req.json().catch(() => ({})));
  const title = cleanString(body.title);
  const messageBody = cleanString(body.body);
  const status = normalizeStatus(body.status);
  const visibility = normalizeVisibility(body.visibility);
  const requiresAck = booleanOrDefault(body.requires_ack, true);
  const recipientRosterMemberIds = stringArray(body.recipient_roster_member_ids);

  if (!title) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }

  if (!messageBody) {
    return NextResponse.json({ error: "body is required." }, { status: 400 });
  }

  if (recipientRosterMemberIds.length > 0 && visibility !== "drivers") {
    return NextResponse.json(
      { error: "Targeted messages must use drivers visibility." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const publishAfterRecipients =
    status === "published" && recipientRosterMemberIds.length > 0;
  const initialStatus = publishAfterRecipients ? "draft" : status;

  const insertRow = {
    company_id: company.id,
    title,
    body: messageBody,
    status: initialStatus,
    visibility,
    requires_ack: requiresAck,
    published_at: initialStatus === "published" ? now : null,
    archived_at: initialStatus === "archived" ? now : null,
    created_by_profile_id: access?.profile_id ?? null,
    updated_by_profile_id: access?.profile_id ?? null,
  };

  const { data: inserted, error } = await supabase
    .from("company_message")
    .insert(insertRow)
    .select(
      [
        "id",
        "company_id",
        "title",
        "body",
        "status",
        "visibility",
        "requires_ack",
        "published_at",
        "archived_at",
        "created_by_profile_id",
        "updated_by_profile_id",
        "created_at",
        "updated_at",
      ].join(", ")
    )
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create message." },
      { status: 500 }
    );
  }

  const insertedMessage = inserted as unknown as MessageRow;

  if (recipientRosterMemberIds.length > 0) {
    const { data: rosterRows, error: rosterError } = await supabase
      .from("company_roster_view")
      .select("roster_member_id, profile_id, person_id, employment_status")
      .eq("company_id", company.id)
      .in("roster_member_id", recipientRosterMemberIds);

    if (rosterError) {
      return NextResponse.json(
        { error: rosterError.message, message: insertedMessage },
        { status: 500 }
      );
    }

    const recipientRows = (rosterRows ?? [])
      .filter((row: any) =>
        row.employment_status === "Active" || row.employment_status === "Trainee"
      )
      .map((row: any) => ({
        company_id: company.id,
        message_id: insertedMessage.id,
        roster_member_id: row.roster_member_id,
        profile_id: row.profile_id ?? null,
        person_id: row.person_id ?? null,
      }));

    if (recipientRows.length !== recipientRosterMemberIds.length) {
      return NextResponse.json(
        {
          error: "One or more selected recipients are not active drivers.",
          message: insertedMessage,
        },
        { status: 400 }
      );
    }

    const { error: recipientError } = await supabase
      .from("company_message_recipient")
      .insert(recipientRows);

    if (recipientError) {
      return NextResponse.json(
        { error: recipientError.message, message: insertedMessage },
        { status: 500 }
      );
    }
  }

  if (publishAfterRecipients) {
    const { data: published, error: publishError } = await supabase
      .from("company_message")
      .update({
        status: "published",
        published_at: now,
        updated_by_profile_id: access?.profile_id ?? null,
      })
      .eq("company_id", company.id)
      .eq("id", insertedMessage.id)
      .select(
        [
          "id",
          "company_id",
          "title",
          "body",
          "status",
          "visibility",
          "requires_ack",
          "published_at",
          "archived_at",
          "created_by_profile_id",
          "updated_by_profile_id",
          "created_at",
          "updated_at",
        ].join(", ")
      )
      .single();

    if (publishError || !published) {
      return NextResponse.json(
        {
          error: publishError?.message ?? "Message recipients saved, but publish failed.",
          message: insertedMessage,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: published }, { status: 201 });
  }

  return NextResponse.json({ message: insertedMessage }, { status: 201 });
}
