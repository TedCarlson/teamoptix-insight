# Mobile Companion 1.0 — Duty Location and Device Authentication

**Approved product direction:** August 24, 2026

**Status:** Implementation and release-gate contract

## Outcome

Insight Mobile Companion 1.0 protects authenticated company information with
Face ID or supported device authentication and records operational location
only during an explicit duty session. This expands the earlier lightweight,
foreground-only release candidate now that Team Optix has an organization
distribution account.

## Permission is not collection

The app may hold **Always Location** authorization so it can perform its core
duty-tracking function, but authorization alone never starts collection.

- Signing in does not start Location Services.
- Viewing schedules, messages, inspections, scorecards, or account information
  does not start Location Services.
- The user must select **Start Duty** and pass the existing intent-confirmation
  gate before the app requests the required location authorization or starts
  the native background task.
- **Stop Duty** clears the task authorization record, stops native location
  updates, records a final foreground fix when available, and closes the local
  duty session.
- Sign-out is blocked while duty remains open so an active operational tracking
  session cannot be abandoned accidentally.

## Fail-closed tracking envelope

Every accepted point requires all of the following:

1. an authenticated user with an eligible company-scoped driver context;
2. an encrypted local SQLCipher outbox for that authenticated user;
3. an open local duty session created after intent confirmation;
4. the same user, company context, and session identifiers in the encrypted
   background-task registration;
5. Precise foreground and background/Always authorization;
6. a capture timestamp delivered after the registered duty start.

If the background task wakes without matching encrypted registration and an
open duty session, it records nothing and unregisters an orphaned task. Network
failure leaves sealed evidence encrypted on the device for a later retry.

`FOREGROUND_GPS` and `BACKGROUND_GPS` describe capture context only. All points
remain `DEVICE_LOCATION_OBSERVATION` with server-owned `OBSERVATION_ONLY` truth
status. They do not independently establish payroll, vehicle assignment,
carrier activity, delivery completion, route completion, or odometer mileage.

## Device authentication

- An authenticated Supabase session is not rendered until Face ID, Touch ID,
  or another supported device-owner authentication succeeds.
- The app re-locks whenever it leaves the foreground.
- The operating-system passcode fallback remains available after biometric
  failure so the device owner is not locked out by a temporary sensor issue.
- Biometric templates never enter the app; only the operating system's success
  or failure result is observed.

## Explicit exclusions

- No motion or activity-recognition permission is requested.
- No location is collected while duty is off.
- No unrestricted web browsing, advertising, cross-app tracking, or social
  feed is introduced by this scope.
- The feature does not provide emergency services or autonomous vehicle
  control.

## Release acceptance

Before public submission, verify on a physical iPhone:

1. first sign-in transitions to the device-authentication gate;
2. login and ordinary navigation cause no location indicator;
3. Start Duty cannot complete without Precise and Always authorization;
4. successful Start Duty produces a visible active state and background
   location indicator;
5. points continue while the app is backgrounded and remain encrypted offline;
6. relaunch recovers a still-open duty session and its task registration;
7. Stop Duty turns the indicator off and no later point is accepted;
8. sign-out is blocked until duty is stopped;
9. denied/reduced permission fails closed with a direct route to device
   Settings;
10. the production archive contains Face ID and both location purpose strings,
    the location background mode, and no motion declaration.

The privacy policy and App Store privacy answers must describe precise duty
location, background collection while clocked in, company-scoped operational
use, encryption, retention/deletion, service providers, and consent withdrawal
before the feature is submitted for public review.
