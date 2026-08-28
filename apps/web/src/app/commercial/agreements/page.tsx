import type { Metadata } from "next";
import Link from "next/link";
import PublicInformationPage from "@/features/foyer/components/PublicInformationPage";

export const metadata: Metadata = {
  title: "Customer Agreements",
  description:
    "A plain-language introduction to the four agreements that frame a Team Optix Insight customer relationship.",
};

const agreementLinks = [
  { href: "#master-service-agreement", label: "Master Service Agreement" },
  { href: "#statement-of-work", label: "Statement of Work" },
  { href: "#data-processing-addendum", label: "Data Processing Addendum" },
  { href: "#acceptable-use-policy", label: "Acceptable Use Policy" },
];

export default function AgreementsPage() {
  return (
    <PublicInformationPage
      eyebrow="Working with Team Optix"
      title="Customer Agreements"
      summary="A plain-language introduction to the four documents that establish how Team Optix and an Insight customer work together."
      updated="August 28, 2026"
    >
      <div className="public-information-notice" role="note">
        <strong>This page is an overview, not the agreement.</strong>
        <p>
          It is designed to help prospective customers understand the purpose of each document before formal review. It does not
          create a service relationship, replace legal review, or change the customer-specific versions presented for signature.
          The final executed documents control.
        </p>
        <nav className="agreement-summary-index" aria-label="Agreement summaries">
          {agreementLinks.map((agreement) => (
            <Link key={agreement.href} href={agreement.href}>{agreement.label}</Link>
          ))}
        </nav>
      </div>

      <section id="master-service-agreement">
        <h2>Master Service Agreement</h2>
        <p>
          The Master Service Agreement is the foundation of the commercial relationship. It identifies Team Optix as the provider,
          the subscribing organization as the customer, and Insight as the service being made available under an approved
          subscription or order.
        </p>
        <ul>
          <li>Defines service access, subscription, billing, support, availability, and the responsibilities of both parties.</li>
          <li>Confirms that the customer owns its data while Team Optix owns Insight, its software, workflows, and documentation.</li>
          <li>Sets expectations for confidentiality, security, third-party services, warranties, liability, term, suspension, and termination.</li>
          <li>Requires the customer to control authorized users, submit data it has authority to use, and review operational outputs before acting on them.</li>
        </ul>
        <p>
          <strong>Why it matters:</strong> this document supplies the durable legal and commercial framework. The other three
          documents add the customer&apos;s implementation plan, data protections, and permitted-use boundaries.
        </p>
      </section>

      <section id="statement-of-work">
        <h2>Statement of Work</h2>
        <p>
          The Statement of Work turns the general relationship into a customer-specific implementation plan. It describes which
          Insight workspaces are included, what Team Optix will configure or help validate, what the customer must provide, and how
          the parties will decide that the initial launch is ready.
        </p>
        <ul>
          <li>Records the agreed scope, subscribed surfaces, deliverables, implementation phases, timeline assumptions, and fees.</li>
          <li>Assigns responsibility for source data, access, approvals, workflow validation, user preparation, and the final go-live decision.</li>
          <li>Identifies exclusions such as unapproved custom development, payroll processing, accounting, tax, legal, HR, safety, or managed-operations services.</li>
          <li>Provides a written change process when requested work affects scope, cost, timeline, deliverables, or support expectations.</li>
        </ul>
        <p>
          <strong>Why it matters:</strong> this document makes the engagement concrete. It gives both parties a shared definition of
          what will be delivered, what readiness depends on, and what falls outside the agreed implementation.
        </p>
      </section>

      <section id="data-processing-addendum">
        <h2>Data Processing Addendum</h2>
        <p>
          The Data Processing Addendum explains how Team Optix handles customer data while providing Insight. The customer determines
          the authorized business purpose and remains responsible for its source data; Team Optix processes that data only to deliver,
          secure, support, and maintain the selected services.
        </p>
        <ul>
          <li>Preserves customer ownership and control while limiting Team Optix to documented customer instructions.</li>
          <li>Prohibits selling or sharing customer data, behavioral advertising, data brokerage, unrelated profiling, external benchmarking, and general-purpose AI model training.</li>
          <li>Limits identifiable stop-, package-, recipient-, and address-level carrier data to seven calendar days after the service date, followed by deletion or irreversible transformation.</li>
          <li>Describes security safeguards, restricted personnel access, subprocessors, incident response, rights assistance, audits, exports, return, and deletion.</li>
        </ul>
        <p>
          <strong>Why it matters:</strong> this document makes data stewardship part of the signed relationship rather than a product
          promise alone. Customer-specific processing details and approved providers are recorded with the executed version.
        </p>
      </section>

      <section id="acceptable-use-policy">
        <h2>Acceptable Use Policy</h2>
        <p>
          The Acceptable Use Policy establishes the boundaries for every administrator, employee, contractor, integration, device,
          and other authorized user operating through the customer&apos;s Insight account. Access to a feature does not by itself grant
          authority to use it.
        </p>
        <ul>
          <li>Requires lawful, authorized business use, individual identities, protected credentials, least-privilege access, and prompt reporting of suspected compromise.</li>
          <li>Prohibits unauthorized data collection, harmful surveillance, discrimination, deception, malware, platform interference, access-control evasion, and misuse of customer or carrier information.</li>
          <li>Requires honest operational records and evidence, including inspections, photographs, time records, maintenance activity, approvals, and signatures.</li>
          <li>Keeps people responsible for automation and AI-assisted outputs and permits proportionate restriction or suspension when misuse creates a material legal, safety, privacy, or security risk.</li>
        </ul>
        <p>
          <strong>Why it matters:</strong> this document protects the customer, affected people, carrier relationships, other customers,
          and the integrity of the service by defining conduct that is allowed, restricted, or prohibited.
        </p>
      </section>

      <div className="public-information-closing">
        <strong>Moving from introduction to agreement</strong>
        <p>
          When a prospective customer is ready to move forward, Team Optix prepares customer-specific versions for review and
          signature. Questions about the agreement set can be sent to <a href="mailto:admin@teamoptix.io">admin@teamoptix.io</a>.
          Product and account assistance remains available through <Link href="/support">Insight Support</Link>.
        </p>
      </div>
    </PublicInformationPage>
  );
}
