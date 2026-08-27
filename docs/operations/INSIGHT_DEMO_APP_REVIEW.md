# Insight Demo — App Review operating runbook

**Owner:** Team Optix LLC

**Purpose:** Permanent, synthetic App Review and guided product-demonstration workspace

**Company slug:** `insight-demo`

**Data policy:** `SYNTHETIC_ONLY`

## Safety boundary

Insight Demo is an isolated company tenant. Its people, routes, vehicles,
messages, schedule facts, and service history are authored synthetic records.
They are not copied from Beacon Point Ventures or another customer, and they
do not contain customer names, route numbers, email addresses, phone numbers,
VINs, or production metrics.

The reviewer receives only these mobile grants:

- Schedule
- Dispatch
- Service / delivery window
- Reports (read surfaces; operations uploads remain unavailable)
- Fleet, including inspections and inspection evidence
- Routes

Payroll, hiring, roster administration, company configuration, grant
management, opportunity analysis, and report uploads are intentionally absent.
Inspection photos are the one supported evidence-upload workflow.

## Create the reviewer credential

1. In Supabase Authentication, create a dedicated email/password user using a
   Team Optix-controlled mailbox. A stable address such as
   `app-review@teamoptix.io` is recommended after the mailbox or alias exists.
2. Generate a strong password and store it in the Team Optix password manager.
   Do not place it in this repository, a migration, an application environment
   variable, an App Store screenshot, or a task message.
3. Copy the new Auth user UUID.
4. From a trusted service-role operation, bind that Auth user to Insight Demo:

   ```sql
   select public.provision_insight_demo_reviewer(
     '<SUPABASE_AUTH_USER_UUID>'::uuid
   );
   ```

5. Sign in on a clean iPhone/iPad install and confirm that the context picker
   contains only `Insight Demo` for this account.

The provisioning function does not create or store the password. It creates or
repairs the profile, establishes the demo membership, and replaces the demo
grant set with the minimum list above.

## Refresh synthetic operating facts

Before submitting a build to App Review, refresh the rolling schedule and
service history from a trusted service-role operation:

```sql
select public.refresh_insight_demo_workspace();
```

The refresh updates deterministic synthetic seed records and only replaces
report batches whose source begins with `insight-demo://`. Reviewer-created
inspections, inspection evidence, messages, and other interactions are
preserved.

## App Review walkthrough

Use this sequence in App Review notes and for the internal release check:

1. Sign in with the supplied App Review credential.
2. Choose **Manager — Insight Demo**.
3. Open **Today** to review the synthetic operating posture.
4. Open **Schedule**. Confirm four active drivers are used for readiness and
   Cameron Blake appears separately in the trainee group.
5. Open **Service**, move to an earlier operating day, and inspect the
   historical route cards.
6. Open **Fleet** to view three demo units, including one maintenance unit, one
   defect, and one in-progress work order.
7. Open **Inspect**, choose a demo unit, and complete a pre-trip or post-trip
   inspection. Camera/photo evidence is supported.
8. Open **Messages** to read or acknowledge the synthetic operating note.
9. Optionally choose the isolated **Driver demo** context to review the driver
   experience. Driver-demo mutations write to the demo ledger, not customer
   operational tables.

## Proposed App Review note

> Insight Mobile Companion is a company-scoped operations app and requires an
> account. The supplied review account opens our permanent Insight Demo tenant,
> which contains only synthetic people, routes, vehicles, schedules, messages,
> and service history. After sign-in, choose “Manager — Insight Demo.” Suggested
> review path: Today → Schedule → Service (select an earlier day) → Fleet →
> Inspect → Messages. Inspection camera/photo access is optional and is used
> only when the reviewer chooses to attach vehicle evidence. Report uploads,
> payroll, hiring, and company administration are not part of the review role.

## Submission fields still requiring Team Optix confirmation

- Review contact first/last name, direct phone in international format, and a
  monitored email. This contact is for Apple, not the public product page.
- The final reviewer email/password entered only in App Store Connect. Mark
  sign-in as required; the credential must remain active and must not expire.
- Content Rights: the recommended answer is **Yes, the app accesses third-party
  content and Team Optix has the necessary rights or permission to use it**.
  Insight displays organization-provided operational records and inspection
  evidence, even though the App Review tenant itself is fully synthetic. Team
  Optix must confirm that its customer terms and permissions support this
  attestation before submission.
- EU Digital Services Act status: Team Optix LLC is developing and distributing
  Insight in a business capacity, so the working recommendation is **Trader**.
  This remains an Account Holder legal self-assessment. If the app is available
  in the EU, Apple will display the verified business address, phone, and email
  on the product page. Select a public business phone and monitored role inbox,
  not a private personal contact.
- Public Support URL and Privacy Policy URL
- Final privacy questionnaire and build export-compliance answers

These legal/account fields are not inferred or embedded in the application.
They are completed in App Store Connect after the demo account passes the clean
device verification above.

Current Apple references:

- [App Review contact and non-expiring demo credential](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/)
- [Content Rights requirement](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/)
- [EU Digital Services Act trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
