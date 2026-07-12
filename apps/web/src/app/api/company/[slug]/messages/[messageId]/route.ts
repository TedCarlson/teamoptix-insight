import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; messageId: string }>;
};

type AccessMembership = {
  company_slug?: string | null;
  relationship_type?: string | null;
  membership_status?: string | null;
};

type AccessContext = {
  is_platform_owner?: boolean | null;
  profile_id?: string | null;
  memberships?: AccessMembership[] | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function normalizeStatus(value: unknown) {
  const status = cleanString(value).toLowerCase();

  if (status === "published" || status === "archived" || status === "draft") {
    return status;
  }

  return null;
}

function normalizeVisibility(value: unknown) {
  const visibility = cleanString(value).toLowerCase();

  if (visibility === "all" || visibility === "drivers" || visibility === "leadership") {
    return visibility;
  }

  return null;
}

async function resolveAdminContext(slug: string) {
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

  const canAdmin =
    Boolean(typedAccess?.is_platform_owner) ||
    (membership?.relationship_type === "admin" &&
      membership?.membership_status === "active");

  if (!canAdmin) {
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

  return {
    supabase,
    company,
    access: typedAccess,
    error: null,
  };
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { slug, messageId } = await context.params;
  const resolved = await resolveAdminContext(slug);

  if (resolved.error) return resolved.error;

  const { supabase, company, access } = resolved;
  const body = asObject(await req.json().catch(() => ({})));

  const { data: current, error: currentError } = await supabase
    .from("company_message")
    .select("id, company_id, status, published_at, archived_at")
    .eq("company_id", company.id)
    .eq("id", messageId)
    .maybeSingle();

  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }

  if (!current) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const updateRow: Record<string, unknown> = {
    updated_by_profile_id: access?.profile_id ?? null,
  };

  if ("title" in body) {
    const title = optionalString(body.title);

    if (!title) {
      return NextResponse.json({ error: "title cannot be empty." }, { status: 400 });
    }

    updateRow.title = title;
  }

  if ("body" in body) {
    const messageBody = optionalString(body.body);

    if (!messageBody) {
      return NextResponse.json({ error: "body cannot be empty." }, { status: 400 });
    }

    updateRow.body = messageBody;
  }

  if ("visibility" in body) {
    const visibility = normalizeVisibility(body.visibility);

    if (!visibility) {
      return NextResponse.json(
        { error: "visibility must be all, drivers, or leadership." },
        { status: 400 }
      );
    }

    updateRow.visibility = visibility;
  }

  if ("requires_ack" in body) {
    if (typeof body.requires_ack !== "boolean") {
      return NextResponse.json(
        { error: "requires_ack must be a boolean." },
        { status: 400 }
      );
    }

    updateRow.requires_ack = body.requires_ack;
  }

  if ("status" in body) {
    const status = normalizeStatus(body.status);

    if (!status) {
      return NextResponse.json(
        { error: "status must be draft, published, or archived." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    updateRow.status = status;

    if (status === "published" && !current.published_at) {
      updateRow.published_at = now;
    }

    if (status === "archived") {
      updateRow.archived_at = now;
    }

    if (status === "draft") {
      updateRow.archived_at = null;
    }
  }

  const { data, error } = await supabase
    .from("company_message")
    .update(updateRow)
    .eq("company_id", company.id)
    .eq("id", messageId)
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

  return NextResponse.json({ message: data });
}
