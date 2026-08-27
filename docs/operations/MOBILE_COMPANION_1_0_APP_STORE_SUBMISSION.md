# Insight Mobile Companion 1.0 — App Store submission package

**Prepared:** August 27, 2026  
**App Store Connect app:** Insight Mobile Companion  
**Apple ID:** 6804785270  
**Bundle ID:** `com.teamoptix.insight.companion`  
**Release territory:** United States only  
**Price:** Free; no in-app purchases  
**Build:** Select build 6 after Apple finishes processing it

## Listing metadata

**Name**  
Insight Mobile Companion

**Subtitle**  
Workforce, fleet & operations

**Promotional text**  
Keep schedules, service history, fleet readiness, inspections, messages, and field decisions close wherever the operation takes you.

**Description**

Insight Mobile Companion brings authorized Team Optix workspaces to iPhone and iPad. It is built for operators who need the current operating picture away from a desk.

Use the companion to:

- review today’s operational posture;
- understand schedules, coverage, and workforce readiness;
- review current and historical route service;
- see fleet units, defects, work orders, and readiness;
- complete vehicle inspections and attach optional photo evidence;
- read and acknowledge company messages; and
- work within the company, role, and workspace access granted to you.

Insight protects the boundary between companies and roles. Location is collected only during an explicitly started, location-enabled duty session. Pending operational records are encrypted on the device until synchronization succeeds.

An existing Insight account and company authorization are required. Available features depend on your organization, role, and granted workspaces.

**Keywords**  
`workforce,schedule,fleet,inspection,dispatch,routes,drivers,field service,operations`

**Primary category**  
Business

**Secondary category**  
Productivity

**Support URL**  
https://teamoptix.io/support

**Marketing URL**  
https://teamoptix.io/insight

**Privacy Policy URL**  
https://teamoptix.io/privacy

**Copyright**  
2026 Team Optix LLC

## Screenshot package

App previews are optional and intentionally deferred for 1.0. Capture five authentic screenshots from the isolated **Insight Demo** tenant. Do not use Beacon Point Ventures, another customer, real names, real route numbers, real email addresses, or photographs of a physical device.

Prepare the same five-story gallery for:

- iPhone portrait: `1284 × 2778` PNG
- iPad landscape: `2732 × 2048` PNG

| Order | Surface | App Store message | Capture requirement |
| --- | --- | --- | --- |
| 1 | Today | See the operation at a glance | Manager context; synthetic posture and priority work visible |
| 2 | Schedule / Calendar | Plan the week with clarity | Active workforce counts and the separately grouped trainee visible |
| 3 | Service | Review today or any operating day | Earlier synthetic operating day selected; route service cards visible |
| 4 | Fleet | Keep every unit ready | Three synthetic demo units with readiness, defect, and work-order posture |
| 5 | Inspect | Capture inspections in the field | Demo unit selected; inspection checklist or optional evidence step visible |

Use the exact app UI as the primary content. A short headline may be added in unused space, but it must not cover controls, imply unavailable functionality, or introduce customer data. Keep the first three screenshots strong enough to tell the product story without opening the full gallery.

## App Review account and note

Mark **Sign-in required** and enter the dedicated review email and current review-only password directly in App Store Connect. Do not copy the password into this file, a screenshot, source control, or task message. Keep the account active and non-expiring throughout review, then rotate the password after the review cycle.

**Reviewer note**

> Insight Mobile Companion is a company-scoped operations app and requires an account. The supplied review account opens our permanent Insight Demo tenant, which contains only synthetic people, routes, vehicles, schedules, messages, and service history. After sign-in, choose “Manager — Insight Demo.” Suggested review path: Today → Schedule → Service (select an earlier day) → Fleet → Inspect → Messages. Inspection camera/photo access is optional and is used only when the reviewer chooses to attach vehicle evidence. Report uploads, payroll, hiring, and company administration are not part of the review role.

**Review contact**

- Saved in App Store Connect
- Monitored role inbox: app-review@teamoptix.io
- Keep the direct review phone only in App Store Connect; do not store it in the repository

## Privacy questionnaire

For every collected type below, answer **Linked to the user: Yes**, **Used for tracking: No**, and **Purpose: App Functionality**.

- Precise Location
- Email Address
- User ID
- Photos or Videos
- Other User Content
- Product Interaction

Do not declare biometric information: Face ID and Touch ID remain inside iOS. Do not declare advertising, purchases, contacts, health, audio, crash analytics, or tracking for this build. See `docs/roadmap/MOBILE_COMPANION_1_0_APP_STORE_PRIVACY_MATRIX.md` for the audited reasoning.

## Submission gate

- [x] App name, subtitle direction, categories, copyright, and US-only availability decided
- [x] Content Rights recorded as necessary rights to third-party content
- [x] Apple standard EULA retained
- [x] Dedicated synthetic Insight Demo tenant and review account prepared
- [x] App Review contact prepared
- [x] Public Privacy Policy and Support pages implemented locally
- [ ] Deploy and verify `https://teamoptix.io/privacy` and `https://teamoptix.io/support`
- [ ] Capture, review, and upload the ten screenshots (five iPhone, five iPad)
- [ ] Complete App Privacy answers from the audited matrix
- [ ] Complete age-rating questionnaire
- [ ] Select the replacement build after processing. Its Info.plist declares that the app uses only encryption exempt from App Store Connect documentation requirements; no separate export-compliance attachment or code is expected for the current United States-only distribution.
- [ ] Select the replacement build after Apple finishes processing it
- [ ] Save all fields and address any App Store Connect validation messages
- [ ] Add for Review, verify the submission summary, and submit

Do not submit until the public URLs are live, the review credential has been re-tested on a clean install, and the screenshot gallery contains only synthetic data.

The encrypted device outbox uses SQLCipher, an industry-standard algorithm, in addition to Apple-provided HTTPS and secure-storage facilities. The app is currently distributed only in the United States. Apple's current export-compliance matrix requires a French encryption declaration for this standard non-Apple encryption category only when the app is distributed in France. The replacement build therefore declares `ITSAppUsesNonExemptEncryption: false`, meaning the encryption is exempt from App Store Connect documentation requirements. Revisit this determination before adding France or changing cryptographic functionality.
