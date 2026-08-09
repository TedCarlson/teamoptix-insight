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

Expo Go cannot run this app's encrypted database because SQLCipher requires a
custom native development client. This is intentional: MC-1 must not silently
fall back to a plaintext queue. Do not create an EAS build until the Expo
project is linked and a dedicated device-test checkpoint is approved.

## Useful commands

- `pnpm typecheck:mobile` — check the native TypeScript code.
- `pnpm test:mobile` — run the outbox protocol contract tests.
- `pnpm dev:mobile` — start the Expo development server.

## MC-1 behavior

- Sign-in uses the existing Insight account and access context.
- Duty tracking starts and stops only through explicit user action.
- Location capture is foreground-only; synthetic points appear only in a
  development build.
- Sessions, points, and batches receive device-generated UUIDs.
- Unacknowledged data remains in a user-specific SQLCipher database across
  app restarts.
- Synchronization accepts only explicit server acknowledgments and safely
  handles duplicate and partial submissions.
- Location remains observation-only evidence, never automatic payroll,
  vehicle, carrier, or delivery truth.
