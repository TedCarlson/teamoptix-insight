# Mobile Companion 1.0 — App Store Privacy Matrix

**Technical audit date:** September 3, 2026

**Status:** The audited answers below were published in App Store Connect on
September 3, 2026. The public Privacy Policy and Support routes are reachable;
the corrected Backblaze B2 inspection-evidence disclosure must be deployed and
verified before public App Review submission.

## Product boundary

Insight Mobile Companion is a company-scoped operational app. It does not use
advertising, data brokers, cross-app tracking, unrestricted web browsing, or a
social feed. Device authentication is performed by the operating system; the
app never receives or stores biometric templates.

Location authorization and location collection are separate:

- login and ordinary use do not start location collection;
- Precise and Always authorization are required only to start duty;
- collection starts only after the user confirms Start Duty;
- collection stops when the user selects Stop Duty;
- accepted locations are linked to the authenticated worker and company duty
  session for operational asset/work records.

## Proposed App Store Connect disclosures

| Apple data type | Collected | Linked to user | Used for tracking | Purpose | Shipping use |
| --- | --- | --- | --- | --- | --- |
| Precise Location | Yes | Yes | No | App Functionality | Duty-scoped foreground/background latitude, longitude, accuracy, and capture time |
| Email Address | Yes | Yes | No | App Functionality | Account authentication and identity display |
| User ID | Yes | Yes | No | App Functionality | Authenticated profile, company access, and operational record ownership |
| Photos or Videos | Yes | Yes | No | App Functionality | User-selected or captured vehicle-inspection evidence |
| Emails or Text Messages | Yes | Yes | No | App Functionality | Company messages drafted, published, targeted, received, and acknowledged in the app |
| Other User Content | Yes | Yes | No | App Functionality | Inspection responses/notes and time-off request content |
| Product Interaction | Yes | Yes | No | App Functionality | Duty start/stop, message acknowledgements, inspection submissions, and time-off actions retained as operational records |

Do not declare Coarse Location in place of Precise Location. The shipping app
records latitude and longitude at precise resolution. Do not declare biometric
data: Face ID/Touch ID processing remains inside the operating system.

## Not collected by the current build

- Motion or fitness data
- Contacts or address book data
- Browsing or search history
- Advertising data or advertising identifiers
- Purchases, payment, credit, or financial information
- Health or medical data
- Audio recordings
- Crash, performance, or analytics telemetry sent to Team Optix
- Biometric templates or Face ID images

Remote push registration is disabled in the current production configuration.
If it is enabled later, reassess Device ID and notification-token handling
before the next App Store privacy update.

## Runtime processors and storage

- Supabase Auth authenticates the user account.
- Supabase Database receives company-scoped operational records.
- Backblaze B2 receives sanitized, resized WebP vehicle-inspection evidence.
- Supabase Database retains the company-scoped authorization and evidence record for each inspection photograph.
- A per-user SQLCipher database stores pending operational records encrypted on
  the device until synchronization succeeds.

The final privacy policy must identify the actual service-provider entities and
hosting regions selected by Team Optix. Build and distribution services are not
runtime collection merely because they produced or delivered the binary.

## Publication gate

Before public submission, Team Optix must deploy and verify:

1. `https://teamoptix.io/privacy`;
2. `https://teamoptix.io/support`;
3. the monitored public support channel currently listed on those pages; and
4. the App Store Connect privacy answers represented by this matrix.

This matrix must be re-audited whenever remote notifications, analytics,
crash-reporting, advertising, payments, motion data, or a new runtime SDK is
enabled.
