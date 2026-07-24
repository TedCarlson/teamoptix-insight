# Weekly Determination and Contract-Year Export Contract

**Status:** Design contract; not yet implemented  
**Last reviewed:** July 24, 2026

## Ownership boundary

- Fleet owns vehicle identity, effective-dated weight evidence, and classification history.
- Compliance owns immutable employee-workweek facts, rule evaluation, review, finalization, and audit.
- Payroll consumes finalized Compliance outcomes and owns payment calculations and payroll output.

Payroll must not infer an exemption from an operational class such as L10, L15, or L20. An
operational class may help locate source evidence, but only a finalized weekly Compliance
determination may direct Payroll treatment.

## Weekly observance

The durable unit is one employee and one FLSA workweek. Calendar weeks are not assumed; each
company profile must define its workweek start day and time.

Each weekly observation requires:

- company and roster member;
- workweek start and end;
- worked service dates and hours;
- effective vehicle-assignment segments, including swaps;
- the effective vehicle rating record for every segment;
- trailer/GCWR, passenger-capacity, and placarded-hazardous-material facts when applicable;
- employer carrier/interstate profile version;
- worker duty profile version;
- compensation component inputs;
- source record identifiers, timestamps, and versions; and
- the rule-definition versions evaluated.

The weekly fact set is append-only after evaluation. A correction creates a superseding version;
it never edits a finalized fact set in place.

## Required database contracts

### `compliance.driver_week_fact`

One versioned, immutable input envelope per employee-workweek.

Key controls:

- stable `driver_week_key`;
- monotonically increasing `fact_version`;
- canonical JSON or normalized child rows for source lineage;
- `assembled_at` and `assembled_by`;
- `supersedes_fact_id`;
- content hash; and
- no update or delete for finalized rows.

### `compliance.driver_week_determination`

One generated result for a fact version and rule bundle.

Outcome vocabulary:

- `FLSA_OT_REQUIRED`;
- `MCA_EXEMPTION_APPLIES`;
- `MCA_EXEMPTION_REVIEW`;
- `EVIDENCE_REVIEW_REQUIRED`;
- `ASSIGNMENT_CONFLICT`; and
- `RULE_PROFILE_MISSING`.

The record must distinguish generated, manually resolved, and final outcomes. A manual resolution
adds a version with actor, reason, and supporting evidence; it does not overwrite the generated
result.

### `compliance.driver_week_audit_snapshot`

An immutable reconstruction package created at finalization. It includes the fact envelope,
determination, rules, evidence manifest, compensation inputs, calculation outputs, reviewer,
finalizer, timestamps, and cryptographic content hash.

### Payroll consumption view

Payroll receives only finalized fields:

- employee and workweek identity;
- final outcome and determination ID/version;
- `federal_ot_applies`;
- regular-rate inputs and result;
- overtime hours and premium;
- review/finalization status; and
- audit snapshot ID.

No Fleet classification row should be exposed as a Payroll instruction.

## Grouped Payroll summary

Payroll Summary should group employee-workweeks under:

1. Motor Carrier exempt;
2. Federal overtime required; and
3. Review required / blocked.

An L10 observation is not itself the grouping rule. A verified qualifying small-vehicle exposure
is one input to the weekly determination. The grouped section reads the final outcome.

## Contract-year export

The export covers a company-defined contract-year date range and includes every employee-workweek
overlapping that range.

Required sections:

1. export manifest;
2. Motor Carrier exempt workweeks;
3. federal overtime required workweeks;
4. review-required or blocked workweeks;
5. payroll reconciliation and variance;
6. rule and legal-reference index;
7. evidence inventory; and
8. superseded determination history.

Each exported row includes:

- company, employee, and workweek;
- hours and relevant exposure summary;
- final outcome and reason codes;
- regular rate, overtime hours, premium, and paid amount where applicable;
- fact, determination, rule, and snapshot versions;
- reviewer/finalizer identity and time;
- source/evidence references; and
- row hash.

The export manifest includes the requested period, generation time, generator version, included
record counts, unresolved-case count, ordered file hashes, and a package hash. Generated packages
are write-once artifacts. A corrected export receives a new version and identifies the package it
supersedes.

## Legal reference package

Every export embeds or links the exact reference set recorded by the applicable rule versions:

- 29 U.S.C. § 207;
- 29 U.S.C. § 213(b)(1);
- 29 C.F.R. Part 782;
- Public Law 110-244, § 306;
- DOL Fact Sheet #19;
- DOL Field Assistance Bulletin 2010-2; and
- any additional DOT authority or controlling decision configured for the determination.

The canonical operational explanation is
`docs/compliance/Federal-Overtime-Reference.md`.

## Finalization and audit protection

- Material unresolved cases block Payroll export/finalization.
- Finalized facts, determinations, and snapshots are immutable.
- Corrections use reopen-and-supersede; prior versions remain readable.
- Database policies prevent ordinary application roles from updating or deleting finalized rows.
- Service operations record actor, request ID, timestamp, and reason.
- Export artifacts are retained according to the approved retention policy and are reproducible
  from their manifest and snapshot IDs.

## Implementation dependencies

This contract is not satisfied by the current Fleet classification migration. It requires, in
order:

1. effective vehicle assignments and same-day swaps;
2. employer and worker rule profiles;
3. weekly fact assembly and source lineage;
4. versioned determinations and review cases;
5. immutable snapshots and Payroll consumption view; and
6. contract-year export generation, storage, and verification.
