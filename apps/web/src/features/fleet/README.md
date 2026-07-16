# Fleet

Fleet is a bounded operational system for company vehicles. It is deliberately separate from the generic asset inventory.

## Ownership

- Driver mobile: pre-trip, post-trip, and mid-route inspections; defect evidence.
- Fleet manager: readiness, triage, vehicle control, work approval, compliance review.
- Mechanic: scope of work, diagnosis, parts and labor, performed work, repair certification, return to service.
- Reporting: period snapshots used to generate reviewed monthly FedEx-facing artifacts without rewriting operational history.

## Data lineage

`vehicle -> inspection -> inspection item -> defect -> work order -> performed work -> repair certification`

Inspection labels and results are stored as submitted snapshots so later template changes do not alter historical records. Compliance snapshots preserve the exact source cutoff and generated payload for auditability.

## Repository layout

- `components/`: Fleet workspace UI.
- `pages/`: shared Fleet page shells.
- `server/`: server-only repositories and orchestration.
- `fleet.types.ts`: public read-model types shared by Fleet surfaces.

The database source of truth is `supabase/migrations/20260716230000_fleet_system_foundation.sql`.
