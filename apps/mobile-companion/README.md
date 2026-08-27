# Insight Mobile Companion

This is the downloadable iOS/Android application track, built with React
Native, Expo, and TypeScript. It is not a browser application optimized for a
phone.

## Local setup

Prerequisites:

- Node.js 22.13 or newer;
- pnpm 10.6.1 (the repository-pinned package manager);
- the free Expo account/project already created for Team Optix LLC;
- an iOS or Android development build when encrypted outbox testing begins.

From the repository root:

1. Run `pnpm install`.
2. Copy `apps/mobile-companion/.env.example` to
   `apps/mobile-companion/.env`.
3. Add the same Supabase URL and publishable key used by Insight. Do not commit
   `.env` or any secret/service-role key.
4. Run `pnpm dev:mobile`.

Expo Go cannot run this app's encrypted database, Face ID, or background
location task because those capabilities require a custom native development
client. This is intentional: production behavior must not silently fall back
to a weaker authentication or plaintext queue.

## Useful commands

- `pnpm typecheck:mobile` — check the native TypeScript code.
- `pnpm test:mobile` — run the outbox protocol contract tests.
- `pnpm dev:mobile` — start the Expo development server.

## MC-1 behavior

- Sign-in uses the existing Insight account and access context.
- Face ID or supported device authentication protects every authenticated app
  session and re-locks when the app leaves the foreground.
- Duty tracking starts and stops only through the existing intent-confirmed
  Start Duty and Stop Duty actions.
- Always Location is required to start duty. Merely signing in, reading a
  schedule, or viewing messages does not start Location Services.
- Foreground and background GPS points are accepted only while an encrypted
  duty session is open; synthetic points appear only in a development build.
- Sessions, points, and batches receive device-generated UUIDs.
- Unacknowledged data remains in a user-specific SQLCipher database across
  app restarts.
- Synchronization accepts only explicit server acknowledgments and safely
  handles duplicate and partial submissions.
- Location remains observation-only evidence, never automatic payroll,
  vehicle, carrier, or delivery truth.
- The app does not call motion-activity APIs. The iOS bundle still includes a
  motion purpose string because the linked location module exposes Core Motion
  APIs and App Store validation requires the declaration.
