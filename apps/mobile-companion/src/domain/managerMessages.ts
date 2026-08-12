export type ManagerMessageStatus = "draft" | "published" | "archived";

export type ManagerMessageVisibility = "drivers" | "all" | "leadership";

export type ManagerMessageAudienceMode = "all_drivers" | "selected_drivers";

export type ManagerMessageDraft = {
  title: string;
  body: string;
  visibility: ManagerMessageVisibility;
  audienceMode: ManagerMessageAudienceMode;
  recipientRosterMemberIds: string[];
  requiresAck: boolean;
};

export type ManagerMessageRecipient = {
  rosterMemberId: string;
  fullName: string;
  employmentStatus: string | null;
  jobTitle: string | null;
};

export type ManagerMessageRecord = {
  id: string;
  title: string;
  body: string;
  status: ManagerMessageStatus;
  visibility: ManagerMessageVisibility;
  requiresAck: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagerMessagesSnapshot = {
  messages: ManagerMessageRecord[];
  recipients: ManagerMessageRecipient[];
  canAuthor: boolean;
};

export const EMPTY_MANAGER_MESSAGE_DRAFT: ManagerMessageDraft = {
  title: "",
  body: "",
  visibility: "drivers",
  audienceMode: "all_drivers",
  recipientRosterMemberIds: [],
  requiresAck: true,
};

export function effectiveManagerMessageRecipients(draft: ManagerMessageDraft) {
  if (draft.visibility !== "drivers" || draft.audienceMode !== "selected_drivers") {
    return [];
  }
  return Array.from(new Set(draft.recipientRosterMemberIds.filter(Boolean)));
}

export function validateManagerMessageDraft(draft: ManagerMessageDraft) {
  if (!draft.title.trim()) return "Enter a message title.";
  if (!draft.body.trim()) return "Enter the message.";
  if (
    draft.visibility === "drivers"
    && draft.audienceMode === "selected_drivers"
    && effectiveManagerMessageRecipients(draft).length === 0
  ) {
    return "Select at least one driver for a targeted message.";
  }
  return null;
}

export function managerMessageAudienceLabel(
  draft: ManagerMessageDraft,
  activeDriverCount: number,
) {
  if (draft.visibility === "all") return "Everyone in the company";
  if (draft.visibility === "leadership") return "Company leadership";
  const selected = effectiveManagerMessageRecipients(draft).length;
  return draft.audienceMode === "selected_drivers"
    ? `${selected} selected driver${selected === 1 ? "" : "s"}`
    : `${activeDriverCount} active driver${activeDriverCount === 1 ? "" : "s"}`;
}
