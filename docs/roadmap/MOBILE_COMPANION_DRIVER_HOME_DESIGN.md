# Insight Mobile Companion — Driver Home Design Brief

**Prepared:** August 10, 2026

**Status:** Design only — no Driver Home implementation or activation authorized

> **Superseded rollout boundary — August 24, 2026:** Driver Home has been
> implemented and the approved 1.0 scope now permits background GPS only while
> an explicit duty session is active. The original foreground-only design notes
> remain below as historical context. The controlling launch contract is
> `MOBILE_COMPANION_1_0_DUTY_LOCATION_AND_DEVICE_AUTH.md`.

## Outcome

Replace the development-oriented `Duty & outbox` presentation with a calm,
driver-facing Home surface that answers five questions immediately:

1. Am I scheduled today, and what work is assigned?
2. Is duty tracking on or off?
3. Is my phone safely synchronized?
4. Is there a message or discrepancy that needs my attention?
5. Where do I go for messages, schedule, inspection, and scorecard?

The screen must preserve the MC-1 contract. Duty is explicit, location remains
foreground-only, and device observations do not automatically establish
payroll, vehicle, carrier, delivery, or odometer truth.

## Product boundary

The native app is the driver's field workspace. Company administration,
configuration, broad analytics, roster management, and operational oversight
remain in Insight web.

The existing browser components cannot be copied directly into React Native.
The native app should reuse governed business rules, Supabase authentication,
company and roster authority, warehouse contracts, and response types. Existing
Next.js routes that rely on browser cookies require a mobile-safe bearer-token
contract or a purpose-built Supabase RPC before native use.

Driver Home is initially a read-oriented composition around the already working
duty and synchronization vertical slice. It does not authorize new background
permissions, push notifications, camera access, or additional offline command
types.

## Native information architecture

The target bottom navigation mirrors the existing driver web model:

1. **Home** — today's work, duty control, attention items, and sync health;
2. **Messages** — company and targeted messages plus required acknowledgment;
3. **Schedule** — upcoming work and, later, time-off requests;
4. **Inspect** — vehicle inspection workflow;
5. **Scorecard** — driver-facing performance information.

The top-right gear remains outside the primary navigation and owns account,
permissions, synchronization diagnostics, retained rejection evidence, app
version, and sign-out.

Only Home is in the first design slice. The other tabs may appear as disabled or
design-only navigation targets until their contracts are approved.

## First frame: `02 — Driver Home / Ready`

Use the existing iPhone 16 baseline frame at 393 × 852 with 24-pixel horizontal
content margins. The screen scrolls behind a fixed bottom navigation.

### Above the fold

1. **Header**
   - `INSIGHT` eyebrow;
   - `Today` as the primary title;
   - active company name;
   - Settings gear with a 44 × 44 minimum touch target.
2. **Today's work card**
   - localized weekday and service date;
   - route or assignment when available;
   - `Scheduled`, `Not scheduled`, or `Schedule pending` language;
   - no inferred payroll statement.
3. **Duty card**
   - `Duty tracking is off` or `Duty tracking is active`;
   - plain explanation that tracking starts or stops only by driver action;
   - one dominant `Start duty` or `Stop duty` button;
   - foreground capture remains available only while duty is active during
     MC-1 testing.
4. **Synchronization status**
   - calm success: `Up to date`;
   - offline: `Saved on this phone` plus pending item count;
   - attention: `Some information needs review`;
   - never expose `batch`, raw RPC codes, or `outbox` in the normal Home state.

### Below the fold

5. **Attention stack**
   - timekeeping discrepancy, required message, or inspection reminder;
   - no card when no action is required.
6. **Schedule preview**
   - next three workdays or an explicit empty/pending state;
   - `View schedule` target may remain nonfunctional in the first prototype.
7. **Observation notice**
   - concise link or disclosure rather than the current large diagnostic card;
   - full evidence and permission language remains available in Settings.

## Figma organization on the free Starter plan

Do not create another page or collaborative file. On
`MC-1 Screens & Prototype`, add one section named:

`MC-2 — Driver Home / Working`

Inside that section, create frames from left to right:

1. `02 — Driver Home / Loading`
2. `02 — Driver Home / Ready`
3. `02 — Driver Home / Duty Active`
4. `02 — Driver Home / Offline Saved`
5. `02 — Driver Home / Needs Review`
6. `02 — Driver Home / Not Eligible`
7. `02 — Driver Home / No Schedule`
8. `02 — Driver Home / Android Compact`

Start with `Ready`; duplicate it only after the hierarchy is approved. Use
instances of the existing button and field components. Add local components for
`Status Card`, `Attention Card`, `Schedule Row`, `Sync Pill`, and `Bottom Nav
Item`. Introduce Auto Layout one component at a time so resizing behavior stays
understandable.

## Required design states

| State | Primary behavior |
| --- | --- |
| Loading | No stale company or duty action is shown while authority loads |
| Ready | Eligible driver, duty off, current data synchronized |
| Duty active | Stop duty is dominant; foreground capture is visible only for MC-1 testing |
| Offline saved | Driver can see that evidence is safe locally and not yet acknowledged |
| Needs review | Human-readable issue plus a route to diagnostics; no destructive clear action |
| Not eligible | No company duty authority; Start duty is disabled or absent |
| No schedule | Honest empty/pending language; no assumption that the driver is off |
| Android compact | Same content priority and behavior with Android-safe spacing |

## Proposed read contract before implementation

Driver Home should not assemble its initial state from several browser-cookie
routes. Before implementation, define one governed, authenticated, company-
scoped summary contract that can return only the signed-in driver's:

- company and eligible roster identity;
- service date and terminal timezone;
- schedule/route presentation state;
- current duty session state;
- synchronization summary derived locally on the device;
- count and summary of required messages;
- highest-priority timekeeping discrepancy;
- inspection reminder state;
- optional scorecard summary only after its existing authority is confirmed.

The contract must distinguish `unknown`, `pending`, `empty`, and `not
authorized`. It must not turn device evidence into payroll or delivery truth.
Read responses may later be cached with `observed_at` and `expires_at`, but no
new offline write command is part of this design slice.

## Acceptance criteria for design approval

Driver Home design is approved when:

1. a driver can identify today's assignment, duty state, and sync state in five
   seconds without understanding technical synchronization terms;
2. Start/Stop duty remains the only way to change the duty envelope;
3. offline and attention states confirm that evidence is retained without
   offering a destructive clear action;
4. no screen claims payroll time, odometer miles, vehicle assignment, carrier
   activity, or delivery completion from device evidence;
5. the Not Eligible state cannot expose an enabled duty action;
6. iOS and Android frames preserve the same hierarchy and actions;
7. Settings retains technical diagnostics for support without dominating the
   driver's normal experience;
8. the user approves the Figma hierarchy before React Native implementation.

## Parked capabilities

Background telemetry, terminal presence inference, `observed_path_miles`, push
notifications, camera evidence, Delivery Location/access-point observations,
geocoding, and Green Sheet contingency evidence remain outside this design
slice and retain their existing governance gates.
