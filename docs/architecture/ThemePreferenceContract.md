# Theme Preference Contract

## Purpose

Light and dark appearance are platform capabilities. They are not owned by the FedEx, ITG, or any other product branch.

## User contract

- The profile offers System, Light, and Dark preferences.
- System follows the active device preference.
- Light and Dark are explicit choices that follow the authenticated profile across TeamOptix and company workspaces.
- A header toggle is available throughout the platform for immediate switching.
- Changing appearance never changes navigation, authorization, data scope, or workflow.

## Persistence and rollout

The browser applies and caches the selection immediately. The authenticated profile becomes authoritative after `20260815183611_profile_theme_preference.sql` is approved and applied.

Before that migration is applied, the local branch detects that profile persistence is unavailable and keeps the choice browser-local. It must not attempt an unsupported hosted-database mutation.

After migration:

1. `core.profiles.theme_preference` stores `system`, `light`, or `dark`.
2. `core.access_context()` returns the authenticating profile preference.
3. `public.set_profile_theme_preference(text)` updates only the authenticating profile.
4. The provider applies the server preference and refreshes the browser cache.
5. The narrow update function is callable only by authenticated and service roles and validates every value.

## Rendering contract

- Shared surfaces use global theme tokens such as `--bg`, `--surface`, `--surface-2`, `--text`, `--muted`, and `--line`.
- Product-specific components may add tokens but must resolve them from the shared light/dark root.
- Theme switching must not require a page reload.
- The initial bootstrap resolves the cached preference before the React tree paints to minimize appearance flash.
- System-preference changes are observed while the application is open.

## Product studios and demos

Branch studios and prospect demos must support both light and dark themes from their first interactive version. This makes theme review part of capability approval instead of a later retrofit.

FedEx, ITG, and future products consume this shared contract. They may not create separate profile preference fields or competing theme providers.
