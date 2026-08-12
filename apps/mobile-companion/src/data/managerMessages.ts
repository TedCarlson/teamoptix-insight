import type { ManagerAccessContext } from "../domain/access";
import {
  effectiveManagerMessageRecipients,
  validateManagerMessageDraft,
  type ManagerMessageDraft,
  type ManagerMessageRecord,
  type ManagerMessagesSnapshot,
  type ManagerMessageStatus,
  type ManagerMessageVisibility,
} from "../domain/managerMessages";
import { getSupabaseClient } from "../lib/supabase";

type CompanyMessageRow = {
  id: string;
  title: string;
  body: string;
  status: ManagerMessageStatus;
  visibility: ManagerMessageVisibility;
  requires_ack: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function canAuthorMessages(context: ManagerAccessContext) {
  return Boolean(context.is_platform_owner) || context.relationship_type === "admin";
}

function messageRecord(row: CompanyMessageRow): ManagerMessageRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    visibility: row.visibility,
    requiresAck: row.requires_ack,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadManagerMessagesSnapshot(
  context: ManagerAccessContext,
): Promise<ManagerMessagesSnapshot> {
  const supabase = getSupabaseClient();
  const canAuthor = canAuthorMessages(context);
  const [messageResult, rosterResult] = await Promise.all([
    supabase
      .from("company_message")
      .select("id, title, body, status, visibility, requires_ack, published_at, created_at, updated_at")
      .eq("company_id", context.company_id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
    canAuthor
      ? supabase
        .from("company_roster_view")
        .select("roster_member_id, full_name, employment_status, job_title")
        .eq("company_id", context.company_id)
        .in("employment_status", ["Active", "Trainee"])
        .order("full_name")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (messageResult.error) throw messageResult.error;
  if (rosterResult.error) throw rosterResult.error;

  return {
    canAuthor,
    messages: ((messageResult.data ?? []) as CompanyMessageRow[]).map(messageRecord),
    recipients: (rosterResult.data ?? []).map((row) => ({
      rosterMemberId: row.roster_member_id,
      fullName: row.full_name ?? "Unnamed driver",
      employmentStatus: row.employment_status ?? null,
      jobTitle: row.job_title ?? null,
    })),
  };
}

export async function saveManagerMessage(input: {
  context: ManagerAccessContext;
  profileId: string;
  draft: ManagerMessageDraft;
  status: Extract<ManagerMessageStatus, "draft" | "published">;
}) {
  if (!canAuthorMessages(input.context)) {
    throw new Error("Company administrator access is required to author messages.");
  }

  const validation = validateManagerMessageDraft(input.draft);
  if (validation) throw new Error(validation);

  const supabase = getSupabaseClient();
  const recipientIds = effectiveManagerMessageRecipients(input.draft);
  const now = new Date().toISOString();
  const publishAfterRecipients = input.status === "published" && recipientIds.length > 0;
  const initialStatus: "draft" | "published" = publishAfterRecipients ? "draft" : input.status;

  const insertedResult = await supabase
    .from("company_message")
    .insert({
      company_id: input.context.company_id,
      title: input.draft.title.trim(),
      body: input.draft.body.trim(),
      status: initialStatus,
      visibility: input.draft.visibility,
      requires_ack: input.draft.requiresAck,
      published_at: initialStatus === "published" ? now : null,
      archived_at: null,
      created_by_profile_id: input.profileId,
      updated_by_profile_id: input.profileId,
    })
    .select("id, title, body, status, visibility, requires_ack, published_at, created_at, updated_at")
    .single();

  if (insertedResult.error || !insertedResult.data) {
    throw insertedResult.error ?? new Error("Failed to create message.");
  }

  const inserted = insertedResult.data as CompanyMessageRow;

  if (recipientIds.length > 0) {
    const rosterResult = await supabase
      .from("company_roster_view")
      .select("roster_member_id, profile_id, person_id, employment_status")
      .eq("company_id", input.context.company_id)
      .in("roster_member_id", recipientIds);

    if (rosterResult.error) throw rosterResult.error;

    const recipientRows = (rosterResult.data ?? [])
      .filter((row) => row.employment_status === "Active" || row.employment_status === "Trainee")
      .map((row) => ({
        company_id: input.context.company_id,
        message_id: inserted.id,
        roster_member_id: row.roster_member_id,
        profile_id: row.profile_id ?? null,
        person_id: row.person_id ?? null,
      }));

    if (recipientRows.length !== recipientIds.length) {
      throw new Error("One or more selected recipients are not active drivers.");
    }

    const recipientResult = await supabase
      .from("company_message_recipient")
      .insert(recipientRows);
    if (recipientResult.error) throw recipientResult.error;
  }

  if (!publishAfterRecipients) return messageRecord(inserted);

  const publishedResult = await supabase
    .from("company_message")
    .update({
      status: "published",
      published_at: now,
      updated_by_profile_id: input.profileId,
    })
    .eq("company_id", input.context.company_id)
    .eq("id", inserted.id)
    .select("id, title, body, status, visibility, requires_ack, published_at, created_at, updated_at")
    .single();

  if (publishedResult.error || !publishedResult.data) {
    throw publishedResult.error ?? new Error("Message recipients saved, but publish failed.");
  }

  return messageRecord(publishedResult.data as CompanyMessageRow);
}
