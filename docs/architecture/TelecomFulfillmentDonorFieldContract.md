# Insight — Telecom Fulfillment donor field contract

## Purpose

This contract prevents the Telecom Fulfillment conversion from substituting invented business fields for the working donor application. The donor remains read-only. The Team Optix review studio may use fictional values, but its field names, status families, option values, and metric keys must be traceable to donor schema or application code.

## Evidence reviewed

- `itg-insight/supabase/sql/baseline/20260710_100526_live_schema.sql`
- `itg-insight/apps/web/src/app/api/people/create/route.ts`
- `itg-insight/apps/web/src/app/api/people/update/route.ts`
- `itg-insight/apps/web/src/shared/server/people/loadPeopleOnboardingRows.server.ts`
- `itg-insight/apps/web/src/shared/surfaces/people/PeopleIntakeDrawer.tsx`
- `itg-insight/apps/web/src/shared/surfaces/people/PeopleEditorDrawer.tsx`
- `itg-insight/apps/web/src/shared/types/workforce/workforce.types.ts`
- `itg-insight/apps/web/src/shared/types/workforce/surfacePayload.ts`
- `itg-insight/apps/web/src/shared/server/workforce/loadWorkforceSourceRows.server.ts`
- `itg-insight/apps/web/src/shared/surfaces/workforce/workforceSurface.helpers.ts`
- `itg-insight/apps/web/src/app/api/workforce/assignment/update/route.ts`
- `itg-insight/apps/web/src/shared/surfaces/reports/FuseOnboardingGrid.tsx`
- `itg-insight/apps/web/src/app/api/reports/fuse/onboarding/grid/route.ts`
- `FUSEITG HR Chat Assistant.xlsx` (read-only source audit, 2026-08-17)
- `itg-insight/apps/web/src/shared/types/metrics/surfacePayload.ts`
- `itg-insight/apps/web/src/shared/kpis/engine/payloads/getOrgMetricPayload.server.ts`
- `itg-insight/apps/web/src/features/tech/metrics/lib/getTechMetricsRangePayload.server.ts`

## Person record

The review surface preserves:

- `full_name`, `legal_name`, `preferred_name`
- `status`: `active`, `inactive`, `onboarding`, `onboarding_closed`
- `tech_id`, `fuse_emp_id`, `nt_login`, `csg`
- `mobile`, `email`
- `prospecting_affiliation_id`
- `onboarding_pc_org_id`
- active assignment count and active organization summary

The legacy `public.person` and current `core.people` structures overlap. Conversion must map them deliberately; it must not assume that the legacy role or company-code fields are the final Team Optix tenant model.

## Workforce assignment

The review surface preserves:

- assignment, person, workspace, and PC organization identity
- `tech_id`
- `position_title`
- `office_id` and office label
- `affiliation_id`, affiliation code, affiliation label, and affiliation type
- `reports_to_assignment_id`, resolved person, and display label
- `start_date`, `end_date`
- `assignment_status`: `active`, `inactive`, `pending`, `archived`
- `is_primary`, `is_active`, `is_incomplete`
- app-access state: `missing_email`, `invite_available`, `invited_pending`, `active`, `profile_mismatch`
- schedule day/state payload where available

Seat values and donor display labels are:

| Stored value | Donor label |
| --- | --- |
| `FIELD` | Field |
| `LEADERSHIP` | Leadership |
| `SUPPORT` | Support |
| `TRAVEL` | Travel Tech |
| `DROP_BURY` | Drop Bury |
| `TRAINING` | Training |
| `FMLA` | FMLA |

## FUSE onboarding

The donor’s current FUSE projection exposes FUSE date, contractor, candidate, Tech ID, personnel ID, status, status update, snapshot history, and identity-match signal.

The current grouped status values are:

- Started
- DT Pass/Pending BG
- Pending D&B
- Pending DT/BG Pass
- Drug & Background Sent
- Badge/Creds Submitted
- Ready for Badge/Creds
- Ready to Start
- Consent Forms Pending Return
- Not Hiring
- Not Qualified
- Terminated

These are onboarding-pipeline values. They do not replace person status or workforce assignment status.

The governed FUSE onboarding workbook signature is:

`Date`, `Last Name`, `First Name`, `Tech ID`, `Personnel ID`, `Office`, `Office Address`, `Company Name`, `Contractor Type`, `Status`, `Note Update`, `Last Note`, `Status Update`.

Recognition is structural rather than filename-based. `N/A` identifier values remain empty identifiers, Personnel ID is preserved as text even when Excel stores it numerically, and repeated rows for the same company candidate are retained as status snapshots rather than rejected or silently deduplicated. A Tech ID or Personnel ID attached to more than one candidate identity remains a blocking conflict.

The commercial ingestion meaning is:

- `Date` is the FUSE processing start date.
- `Last Name` and `First Name` normalize into the roster display name.
- `Tech ID` remains the telecom identifier and `Personnel ID` remains the FUSE employee identifier.
- `Office` supplies the leading location number and the remaining regional identifier.
- `Office Address` is disregarded; it does not select or create a governed company office.
- `Company Name` is the source key used to reconcile a contractor company and its ITF relationship before any roster record can be written.
- `Contractor Type` normalizes to the ITF position `Technician`; the original value remains source evidence.
- `Status` determines the source action policy. Started and in-process statuses may insert a new onboarding candidate or update a matched candidate. Inactive statuses update a matched candidate but never create one. Unknown statuses are blocked and ignored.
- `Status Update`, then `Note Update`, then `Date` provide the descending evidence priority used to decide whether a snapshot is newer. `Last Note` remains status-history evidence.

Insert versus update cannot be decided from status alone. It also requires company-scoped identity reconciliation against the current commercial record. A stale snapshot must not replace a newer status, and all accepted snapshots retain source lineage for future workforce history.

## Metrics

Metrics is a primary Telecom Fulfillment surface, not a secondary widget. The donor supports the `NSR` and `SMART` profiles and `FM`, `PREVIOUS`, `3FM`, and `12FM` ranges.

The existing NSR-oriented metric family used in the review studio is:

| Metric key | Donor display label |
| --- | --- |
| `tnps_score` | tNPS |
| `ftr_rate` | FTR % |
| `tool_usage_rate` | Tool Usage % |
| `contact_48hr_rate` | 48Hr Contact |
| `pht_pure_pass_rate` | Pure Pass % |
| `met_rate` | MET % |
| `repeat_rate` | Repeat % |
| `rework_rate` | Rework % |
| `soi_rate` | SOI % |

The donor also carries configured display/customer labels, report order, direction, rubric, weight, numerator, denominator, band, weighted points, rank, composite score, jobs display, work mix, risk, and drill-down permissions. Production ITF must read the active configurations rather than hard-code thresholds or customer labels.

### ITF v2 exclusion: risk

Risk belongs to an older donor metrics model and is intentionally excluded from the ITF v2 metric contract. It must not appear as a matrix column, sort option, rollup field, or reporting dimension. Historical donor risk values may remain in the legacy source for audit purposes, but they will not be promoted into the commercial ITF experience.

## New requirement: entry provenance

The user has required a small visible source signal: `ITG added`, `Contractor added`, or `Legacy source unknown`.

This is an ITF requirement, not a donor field discovered in the audited record contract. Migration must preserve `unknown`; it must never infer provenance for legacy rows without evidence. A future production implementation requires its own approved schema and access event.

## Interface rule

The interface may consolidate People, onboarding, and assignment management into one overlay. Consolidation changes the interaction cost, not the stored meaning of the underlying fields. Role-aware server projections and database policies remain responsible for preventing ITG from reading contractor-private or other-client roster rows.
