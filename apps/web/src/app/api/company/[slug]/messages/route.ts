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

  const { supabase, company, canAdmin } = resolved;
  const url = new URL(req.url);
  const includeDrafts = url.searchParams.get("admin") === "1" && canAdmin;

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

  return NextResponse.json({
    messages: data ?? [],
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

  if (!title) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }

  if (!messageBody) {
    return NextResponse.json({ error: "body is required." }, { status: 400 });
  }

  const now = new Date().toISOString();

  const insertRow = {
    company_id: company.id,
    title,
    body: messageBody,
    status,
    visibility,
    requires_ack: requiresAck,
    published_at: status === "published" ? now : null,
    archived_at: status === "archived" ? now : null,
    created_by_profile_id: access?.profile_id ?? null,
    updated_by_profile_id: access?.profile_id ?? null,
  };

  const { data, error } = await supabase
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data }, { status: 201 });
}
