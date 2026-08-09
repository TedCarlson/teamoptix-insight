# Delivery Location Assistance — Future DPA Update Plan

**Recorded:** August 9, 2026  
**Status:** Planning only — not approved, published, released, or incorporated into an active agreement  
**Target:** Insight Data Processing Addendum (`DATA_PROCESSING_ADDENDUM`)

## Purpose

Preserve the intended DPA treatment for a future Insight Delivery Location Warehouse and its location-assistance surfaces.

The proposed capability is an internal Insight operational service. It is not a customer-downloadable address or coordinate dataset, a standalone geocoding service, or a data product offered for sale, license, hire, syndication, or external reuse.

## Product boundary to preserve

Insight may retain company-scoped location intelligence solely to resolve service locations and visually assist authorized users managing operations.

The capability must not provide:

- bulk location downloads or exports;
- a public or customer-facing geocoding API;
- direct access to provider responses or warehouse tables;
- cross-customer location or driver-knowledge reuse;
- external benchmarking, resale, licensing, or syndication;
- general-purpose model training using location data.

A browser-rendered map necessarily receives enough information to display a location. The product commitment is therefore the absence of supported bulk extraction, export, resale, or standalone dataset access—not a claim that displayed coordinates are technically impossible to inspect.

## Candidate DPA concept

The following language is a planning draft for later legal and product review:

> **Location Assistance Data** means normalized service-location addresses, map coordinates, match-quality information, and customer-authorized operational guidance retained solely to provide Insight location resolution, mapping, dispatch, and driver-assistance features. Location Assistance Data is company-scoped, is not offered as a downloadable data product or standalone geocoding service, and is not sold, licensed, shared across customers, used for external benchmarking, or used to train general-purpose models.

## Intended retention distinction

The future DPA should distinguish durable Location Assistance Data from short-lived manifest and delivery-event evidence.

- Manifest artifacts, recipients, tracking data, package identifiers, source stop instructions, and delivery-event evidence remain subject to their applicable short operational retention and transformation requirements.
- Customer-authorized Location Assistance Data may be retained while the feature and customer relationship are active.
- Location Assistance Data must be deleted after feature disablement, customer instruction, or termination according to a documented deletion window.
- Raw geocoding-provider responses should expire quickly; only the minimum accepted coordinates, match quality, provider provenance, and verification facts should persist.
- Free-form access guidance requires role-based visibility, auditability, and its own review and deletion lifecycle.

## DPA sections requiring later review

Before this capability is activated, review and reconcile at least:

- `carrier-data-minimization`;
- `seven-day-operational-retention`;
- `mandatory-transformation`;
- `transformed-analytical-data`;
- `confidentiality-and-access`;
- `return-export-and-deletion`;
- Annex A processing description and special instructions;
- Annex B subprocessor register and provider restrictions.

The existing DPA draft currently requires complete addresses and precise coordinates to be removed after seven days. The location-assistance exception must therefore be explicit rather than inferred from general operational-processing permission.

## Application guardrails

Later implementation should require:

- explicit customer enablement of the location-assistance feature;
- strict company scoping and tenant-isolation verification;
- purpose-built, role-authorized read contracts for operational surfaces;
- exclusion from generic report and data-export pipelines;
- audited privileged access;
- provider terms that permit the intended internal storage and display;
- documented disablement, termination, deletion, and backup-expiration behavior;
- separate governance for customer-authored driver and access knowledge.

## Approval and application sequence

1. Finalize the Delivery Location domain and retention requirements through the Platform Switchboard.
2. Review the candidate language with the appropriate business, privacy, and legal owners.
3. Create a new DPA document version; do not silently rewrite an executed version.
4. Update the relevant sections and Annexes consistently.
5. Add any geocoding or map provider that processes Customer Data to the subprocessor register.
6. Define customer notice, acceptance, and feature-enablement requirements.
7. Implement and verify retention, export exclusion, tenant isolation, and deletion controls before activation.

## Non-decision

This note preserves product intent only. It does not authorize durable address retention, activate the Delivery Location Warehouse, select a provider, amend an agreement, or represent legal approval.
