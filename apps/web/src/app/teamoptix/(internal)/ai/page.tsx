import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";

export default function Page() {
  return <TeamOptixDomainOverview eyebrow="TeamOptix · AI" title="AI governance" description="Govern where machine assistance is allowed, how it is evaluated, and which decisions remain human-owned."
    metrics={[
      { label: "Production assistants", value: 0, detail: "No governed registry exists yet" },
      { label: "Versioned prompts", value: 0, detail: "Prompt ledger not established" },
      { label: "Evaluation suites", value: 0, detail: "Quality baseline required" },
      { label: "Human authority", value: "Required", detail: "Operational decisions remain owned" },
    ]}
    panels={[
      { eyebrow: "Governance sequence", title: "Safe enablement path", rows: [
        { title: "Prompt registry", detail: "Version prompts with owner, purpose, inputs, outputs, and permitted data", status: "Build first", href: "/teamoptix/ai/prompts" },
        { title: "Evaluation baseline", detail: "Define expected outcomes and failure cases before production use", status: "Required", href: "/teamoptix/ai/evaluations" },
        { title: "Assistant registry", detail: "Authorize assistants only after prompts and evaluations are governed", status: "Blocked", href: "/teamoptix/ai/assistants" },
      ]},
      { eyebrow: "Authority boundary", title: "Operating principles", rows: [
        { title: "Evidence before inference", detail: "Machine outputs identify basis, uncertainty, and unresolved records", status: "Policy", href: "/teamoptix/ai/evaluations" },
        { title: "Boring system boundaries", detail: "Workers transport work; domain engines interpret and decide", status: "Policy", href: "/teamoptix/ai/prompts" },
        { title: "Human-owned decisions", detail: "AI may assist review but cannot silently expand its authority", status: "Policy", href: "/teamoptix/ai/assistants" },
      ]},
    ]}
  />;
}
