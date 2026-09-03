import type { Metadata } from "next";
import Link from "next/link";
import PublicInformationPage from "@/features/foyer/components/PublicInformationPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Team Optix handles information in Insight and Insight Mobile Companion.",
};

export default function PrivacyPage() {
  return (
    <PublicInformationPage
      eyebrow="Trust and privacy"
      title="Privacy Policy"
      summary="How Team Optix handles information when authorized users access Insight on the web, iPhone, or iPad."
      updated="August 27, 2026"
    >
      <section>
        <h2>Scope and our role</h2>
        <p>
          This policy applies to Insight and Insight Mobile Companion, operated by Team Optix LLC. Insight is a company-scoped
          operations service. Your employer or the organization that gives you access generally determines which workspaces and
          operational records you may use. For that company-provided information, Team Optix generally processes data on the
          organization&apos;s instructions. Team Optix is responsible for account, support, security, and service-administration
          information that it collects for its own business operations.
        </p>
      </section>

      <section>
        <h2>Information we process</h2>
        <ul>
          <li><strong>Account and access data:</strong> email address, user ID, company membership, role, and workspace permissions.</li>
          <li><strong>Operational records:</strong> schedules, time-off requests, routes, vehicle and fleet records, messages, acknowledgements, inspection responses, notes, and related activity.</li>
          <li><strong>Inspection evidence:</strong> photos that a user chooses to capture or select and attach to a vehicle inspection.</li>
          <li><strong>Duty location:</strong> precise location and capture time only when an authorized user explicitly starts a duty session that requires location. Location collection stops when the user stops duty.</li>
          <li><strong>Device-held pending records:</strong> operational actions waiting to synchronize are stored in an encrypted, per-user database on the device.</li>
          <li><strong>Support communications:</strong> information a user or customer provides when requesting help.</li>
        </ul>
        <p>
          Face ID and Touch ID are handled by the device operating system. Team Optix does not receive or store biometric templates.
        </p>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          We process information to authenticate users, enforce company and role access, operate the selected workspaces, synchronize
          field actions, support scheduling and fleet readiness, preserve inspection and operational records, provide customer
          support, secure the service, and comply with legal obligations.
        </p>
        <p>
          Team Optix does not sell personal information, use customer operational data for advertising or cross-context behavioral
          tracking, operate as a data broker, or use customer data to train a general-purpose or shared artificial-intelligence model.
        </p>
      </section>

      <section>
        <h2>Permissions and choices</h2>
        <p>
          Camera and photo-library access is requested only when you choose to add inspection evidence. Location permission is not
          required for sign-in, schedules, messages, inspections, or ordinary account use. If your company enables duty-location
          functionality, declining or withdrawing the required location permission prevents location-enabled duty collection but does
          not block those other features. Device permissions can be changed in iOS Settings.
        </p>
      </section>

      <section>
        <h2>Service providers and storage</h2>
        <p>
          Team Optix uses service providers when necessary to host, secure, and operate Insight. Supabase provides authentication and
          database services for the current production service. Optional inspection photographs are validated, resized, converted to
          a web-ready format, and stored in Backblaze B2; the related authorization and evidence record remain company-scoped in
          Insight. Service providers may process information only to provide their contracted services and are not permitted to use
          customer data for their own advertising or independent purposes.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          Account and operational records are retained while needed to provide the service, meet the customer&apos;s documented
          instructions, maintain security and auditability, or satisfy legal obligations. Identifiable carrier stop-, package-,
          recipient-, and address-level data is retained for no more than seven calendar days after its service date, after which
          source artifacts and direct delivery-level identifiers are deleted or irreversibly transformed under the applicable customer
          agreement. Backups expire through a controlled lifecycle and are isolated from ordinary use.
        </p>
        <p>
          A customer administrator may request access, correction, export, or deletion of company data. Individual users should begin
          with the organization that provided their account; Team Optix will assist that organization with verified requests when
          required.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          We use administrative, technical, and organizational safeguards designed to protect information, including encrypted
          transport, encrypted storage where appropriate, company-scoped access controls, least-privilege administration, secure
          credential handling, and incident-response procedures. No method of storage or transmission is completely secure.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          Insight is a business operations service and is not directed to children under 13. We do not knowingly offer personal
          accounts to children.
        </p>
      </section>

      <section>
        <h2>Contact and policy updates</h2>
        <p>
          Questions or verified privacy requests may be sent to <a href="mailto:admin@teamoptix.io">admin@teamoptix.io</a>. We may
          update this policy as the service changes. The updated date above identifies the current version, and material changes will
          be communicated through an appropriate service or customer channel.
        </p>
        <p>For product assistance, visit <Link href="/support">Insight Support</Link>.</p>
      </section>
    </PublicInformationPage>
  );
}
