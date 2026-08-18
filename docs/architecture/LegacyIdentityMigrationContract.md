# Legacy Identity Migration Contract

## Purpose

This contract defines how an identity from a donor application may be associated with a commercial Insight profile without account deduplication, password handling, or silent merging.

## Core rule

The target `auth.users` record and `core.profiles` record are authoritative after cutover. A donor identity is an external source reference, not a second login authority inside the target.

Different email addresses are accepted as intentional. No automated match is permitted from:

- a similar email address;
- the same name;
- phone number;
- employer;
- roster placement;
- administrator judgment without user verification.

## Link shape

`core.legacy_identity_link` records:

- `source_system`: stable donor identifier such as `itg-insight`;
- `source_subject`: immutable donor Auth user ID or another stable donor subject;
- `target_profile_id`: the commercial profile selected for the migration;
- `link_status`: pending, verified, or retired;
- verification actor and timestamp.

The link contains no password hash, access token, refresh token, JWT secret, or donor service-role credential.

## Allowed lifecycle

```text
No link
  -> pending link created by an authorized migration process
  -> user or approved administrator verifies the exact pairing
  -> verified link used for controlled data attribution/import
  -> retired when the donor reference is no longer needed
```

Verification must occur before donor records are attributed to a target profile. A pending link cannot grant access.

## Registration and import rules

1. New users register in the commercial application when that workflow is ready.
2. Existing donor users continue to sign into the donor until their workflow cutover.
3. A donor account does not become a company membership merely because it is linked.
4. Company membership, engagement participation, entitlements, and user grants are provisioned independently.
5. User imports occur in a dedicated migration event with a rehearsal, reconciliation report, rollback plan, and explicit production approval.
6. A verified link may support attribution of imported history, but never bypass target authorization.

## Security boundary

The two Supabase projects keep independent signing secrets and sessions during coexistence. The commercial application must not accept a donor JWT as proof of target access. Temporary donor reads must occur through a narrow server-side migration adapter with allowlisted operations and full audit logging.

## Reconciliation requirements

Every identity import event must report:

- donor subjects considered;
- target profiles created;
- links created, verified, rejected, or unresolved;
- memberships and grants created separately;
- records attributed through each verified link;
- exceptions requiring a human decision.

Counts must reconcile before cutover. Unresolved identities remain in the donor workflow.

## Event 1 boundary

Migration Event 1 adds only the dormant link structure. It creates no links, imports no users, changes no login path, and contacts no live Supabase project.
