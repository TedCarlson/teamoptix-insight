import {
  EMPTY_MANAGER_MESSAGE_DRAFT,
  effectiveManagerMessageRecipients,
  managerMessageAudienceLabel,
  validateManagerMessageDraft,
} from "./managerMessages";

describe("manager message authority", () => {
  it("requires title and body before a message can be saved", () => {
    expect(validateManagerMessageDraft(EMPTY_MANAGER_MESSAGE_DRAFT)).toBe("Enter a message title.");
    expect(validateManagerMessageDraft({
      ...EMPTY_MANAGER_MESSAGE_DRAFT,
      title: "Dispatch reminder",
    })).toBe("Enter the message.");
  });

  it("requires a recipient for selected-driver messages", () => {
    expect(validateManagerMessageDraft({
      ...EMPTY_MANAGER_MESSAGE_DRAFT,
      title: "Route 410",
      body: "Meet at the north entrance.",
      audienceMode: "selected_drivers",
    })).toBe("Select at least one driver for a targeted message.");
  });

  it("removes targeting outside the selected-driver audience", () => {
    expect(effectiveManagerMessageRecipients({
      ...EMPTY_MANAGER_MESSAGE_DRAFT,
      visibility: "all",
      recipientRosterMemberIds: ["driver-1"],
    })).toEqual([]);
  });

  it("deduplicates recipients and describes publication impact", () => {
    const draft = {
      ...EMPTY_MANAGER_MESSAGE_DRAFT,
      title: "Route 410",
      body: "Meet at the north entrance.",
      audienceMode: "selected_drivers" as const,
      recipientRosterMemberIds: ["driver-1", "driver-1", "driver-2"],
    };
    expect(effectiveManagerMessageRecipients(draft)).toEqual(["driver-1", "driver-2"]);
    expect(managerMessageAudienceLabel(draft, 12)).toBe("2 selected drivers");
  });
});
