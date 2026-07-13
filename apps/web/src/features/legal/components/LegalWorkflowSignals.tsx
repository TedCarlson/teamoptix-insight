import styles from "./legal-workspace.module.css";

type Props = {
  documentScope: string;
  draftMode: boolean;
  hasLockedVersions: boolean;
  hasAcceptance: boolean;
  fieldsReady: boolean;
};

type Tone = "go" | "next" | "blocked" | "done" | "muted";

type Step = {
  label: string;
  detail: string;
  tone: Tone;
};

function toneLabel(tone: Tone) {
  if (tone === "go") return "Ready";
  if (tone === "next") return "Next";
  if (tone === "blocked") return "Blocked";
  if (tone === "done") return "Done";
  return "Waiting";
}

function stepClass(tone: Tone) {
  return [styles.workflowStep, styles[`workflowStep_${tone}`]].join(" ");
}

export function LegalWorkflowSignals({
  documentScope,
  draftMode,
  hasLockedVersions,
  hasAcceptance,
  fieldsReady,
}: Props) {
  const isClientDocument = documentScope === "CLIENT_DOCUMENT";

  const templateSteps: Step[] = [
    {
      label: "Edit template",
      detail: draftMode
        ? "Draft mode is open. Update reusable legal language and sections."
        : "Open Draft Mode when template language or section structure needs changes.",
      tone: draftMode ? "next" : "muted",
    },
    {
      label: "Lock template",
      detail: hasLockedVersions
        ? "A locked template version is available as the source for client documents."
        : "Lock a template version before producing customer documents.",
      tone: hasLockedVersions ? "done" : "go",
    },
    {
      label: "Create client document",
      detail: hasLockedVersions
        ? "Enter customer details in the panel below and generate the customer-owned draft."
        : "Blocked until a locked template version exists.",
      tone: hasLockedVersions ? "go" : "blocked",
    },
  ];

  const clientSteps: Step[] = [
    {
      label: "Confirm fields",
      detail: fieldsReady
        ? "Required customer name and effective date are present."
        : "Enter customer legal name and effective date before locking.",
      tone: fieldsReady ? "done" : "blocked",
    },
    {
      label: "Review draft",
      detail: "Use Review Document to inspect the customer-specific draft before locking.",
      tone: fieldsReady ? "next" : "muted",
    },
    {
      label: "Lock client version",
      detail: hasLockedVersions
        ? "A locked client version is ready to release to the customer."
        : fieldsReady
          ? "Ready to lock the customer-specific version."
          : "Blocked until required fields are complete.",
      tone: hasLockedVersions ? "done" : fieldsReady ? "go" : "blocked",
    },
    {
      label: "Release to customer",
      detail: hasAcceptance
        ? "Customer acceptance has been recorded."
        : hasLockedVersions
          ? "Send the locked version to the customer review lane."
          : "Blocked until the client document is locked.",
      tone: hasAcceptance ? "done" : hasLockedVersions ? "go" : "blocked",
    },
    {
      label: "Customer acceptance",
      detail: hasAcceptance
        ? "Customer has accepted the released document."
        : "Waiting for the customer to review and accept.",
      tone: hasAcceptance ? "done" : "muted",
    },
  ];

  const steps = isClientDocument ? clientSteps : templateSteps;

  return (
    <section className={styles.inspectorSection}>
      <div className={styles.inspectorHeadingRow}>
        <p className={styles.panelLabel}>{isClientDocument ? "Client Workflow" : "Template Workflow"}</p>
        <span className={styles.sectionBadge}>{isClientDocument ? "Client" : "Template"}</span>
      </div>

      <div className={styles.workflowStack}>
        {steps.map((step, index) => (
          <article key={step.label} className={stepClass(step.tone)}>
            <span className={styles.workflowStepNumber}>{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </div>
            <em>{toneLabel(step.tone)}</em>
          </article>
        ))}
      </div>
    </section>
  );
}
