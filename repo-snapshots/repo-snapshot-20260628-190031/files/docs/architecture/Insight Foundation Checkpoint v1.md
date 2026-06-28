# **Insight Foundation Checkpoint v1**

## **Purpose**

This document is the standing reference for the new Insight platform foundation. It exists to reduce drift across future planning and build sessions.

## **Platform posture**

* New project is separate from ITG Insight.

* Insight is being built as a multi-industry platform backbone.

* Launch will begin with one industry first.

* The structure stays vanilla initially.

* Conventions should be informed by lessons learned from the ITG telecom project, without importing telecom-specific domain language into the new platform core.

## **Build philosophy**

* Simple base, intentional rules, earned abstraction.

* Favor clear feature boundaries.

* Be disciplined about file size.

* Keep shared files small and truly shared.

* Do not centralize prematurely.

* Build responsive UX from day one.

## **UX posture**

The app must be designed intentionally for:

* Mobile

* Tablet

* Laptop

* Desktop

This is a deliberate shift away from the desktop-first pattern used in the current ITG app.

## **Business model direction**

* Company profiles are the monetized anchor.

* Individual user profiles and auth users are free while actively linked to a company or onboarding is in progress.

* Users with stale profiles for more than 30 days may later be offered a discounted self-maintained option.

* Otherwise, the user profile may move toward archival.

* Un-archival exists conceptually but is not yet defined.

## **Identity model principles**

* Identity is global to the platform.

* A user can belong to more than one company.

* Profile is platform-wide, not company-owned.

* Company affiliation is relationship-based.

* Roles and permissions should eventually be scoped by company relationship.

* Person/workforce concepts should not be blindly merged into auth identity.

## **Company model principles**

* A company is a standalone entity inside the app.

* The current focus is what one company needs to operate well.

* Future company-to-company relationship features will come later.

* Subcontractor relationships should later be modeled as explicit company relationships, not as hardcoded structural nesting.

## **Initial product focus**

The first foundational surfaces are:

* Landing page

* Auth user setup

* Profile setup

* Company setup

* Quick-add / CSV onboarding path

## **Bulk onboarding principle**

The system must support a quick-add model where a company can upload CSV data directly and stage large groups for onboarding quickly.

## **Database naming direction**

* Lowercase snake\_case

* Prefer plural table names

* Prefer schemas for grouping

* Current preferred schemas:

  * core

  * ref

* Keep names boring, predictable, and grep-able

* Use business meaning, not implementation-heavy names

* Keep row-grain clear in table naming

## **Foundation Table Blueprint v1**

### **Schemas**

* core

* ref

### **First-pass tables**

* ref.industries

* core.profiles

* core.companies

* core.company\_invites

* core.company\_memberships

* core.company\_onboardings

## **Table intent summary**

### **ref.industries**

Reference list of industries.

### **core.profiles**

Platform-wide user profile tied to auth identity.

### **core.companies**

Standalone company account and paid anchor entity.

### **core.company\_invites**

Company-driven invite and CSV staging table.

### **core.company\_memberships**

Live company affiliation for a profile.

### **core.company\_onboardings**

Company-specific onboarding or hiring progress for a profile.

## **Core rules protecting the model**

1. Identity is global.

2. Membership is scoped.

3. Onboarding is process, not identity.

4. Invites are staging objects.

5. Company is standalone.

6. Keep v1 simple.

## **Explicit deferrals**

These are not phase-one foundation items yet:

* Company-to-company relationships

* Billing/subscriptions implementation

* Stale-profile monetization logic

* Messaging/conversation systems

* Detailed permissions matrix

* Workforce/person model expansion

* Industry-specific operational modules

* Analytics/fact tables

* Audit/event ledger

## **First end-to-end loop to support**

1. Company is created.

2. Admin invites users manually or by CSV.

3. Invite rows land in core.company\_invites.

4. User creates auth account.

5. User completes core.profiles.

6. Invite links to profile.

7. Company onboarding begins.

8. Membership becomes active.

## **Breadcrumb rule for future sessions**

When work resumes, use this sequence:

1. Re-open this checkpoint first.

2. Confirm whether the session is still on foundation scope.

3. Only then create DDL, routes, and UI surfaces.

4. Any new idea must be labeled as either:

   * Foundation now

   * Deferred next phase

   * Later platform expansion

Add this to the **foundation checkpoint**:

* confirm company creation remains **platform-owner only**

* confirm route files stay thin and feature UI lives under features/company

* next planned milestone: hydrate company workspace from slug-based company context

