import type { Metadata } from "next";
import Link from "next/link";
import PublicInformationPage from "@/features/foyer/components/PublicInformationPage";

export const metadata: Metadata = {
  title: "Insight Support",
  description: "Help with Insight and Insight Mobile Companion.",
};

export default function SupportPage() {
  return (
    <PublicInformationPage
      eyebrow="Product support"
      title="Insight Support"
      summary="Help with access, mobile permissions, inspections, and company-scoped Insight workspaces."
      updated="August 27, 2026"
    >
      <section>
        <h2>Contact Team Optix</h2>
        <p>
          Email <a href="mailto:admin@teamoptix.io">admin@teamoptix.io</a> for product support. Include your company name, device type,
          iOS version, and a short description of what happened. Do not send passwords, authentication codes, private keys, or customer
          data that is not necessary to diagnose the issue.
        </p>
      </section>

      <section>
        <h2>Signing in and workspace access</h2>
        <p>
          Insight Mobile Companion requires an existing Insight account and company authorization. After signing in, choose the
          manager or driver context provided by your organization. If a company or workspace is missing, contact your company
          administrator first; Team Optix cannot grant access without the organization&apos;s authorization.
        </p>
      </section>

      <section>
        <h2>Camera and inspection photos</h2>
        <p>
          Camera and photo-library permission is requested only when you choose to attach evidence to an inspection. On iPhone or iPad,
          open Settings, find Insight, and confirm the required camera or photo permission. Inspection responses can be completed
          without attaching a photo unless your organization&apos;s process requires evidence.
        </p>
      </section>

      <section>
        <h2>Location and duty sessions</h2>
        <p>
          Location collection does not begin at sign-in. It begins only after an authorized user confirms Start Duty for a workflow
          that requires location, and stops when the user selects Stop Duty. If location-enabled duty cannot start, review Insight&apos;s
          location permission in iOS Settings. Schedules, messages, inspections, and account information remain available without an
          active duty session.
        </p>
      </section>

      <section>
        <h2>Before contacting support</h2>
        <ol>
          <li>Confirm the device has a working internet connection.</li>
          <li>Close and reopen Insight Mobile Companion.</li>
          <li>Confirm the correct company and role context is selected.</li>
          <li>Note the screen name and the approximate time the problem occurred.</li>
        </ol>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          Review the <Link href="/privacy">Team Optix Privacy Policy</Link> for information about account data, duty location,
          inspection evidence, retention, and user choices.
        </p>
      </section>
    </PublicInformationPage>
  );
}
