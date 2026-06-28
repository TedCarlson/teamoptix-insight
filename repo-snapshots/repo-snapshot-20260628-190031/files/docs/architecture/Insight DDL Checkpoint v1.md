# **Insight DDL Checkpoint v1**

## **Status**

Installed successfully.

## **Purpose**

This document records the exact first successful database foundation checkpoint for the new Insight platform so future sessions can resume from a stable implementation state instead of relying on memory.

## **Installed schemas**

* core

* ref

## **Installed function**

* core.set\_updated\_at()

## **Installed tables**

### **ref.industries**

Reference list of industries.

### **core.profiles**

Platform-wide user profile tied to auth.users.

### **core.companies**

Standalone company account and paid anchor entity.

### **core.company\_invites**

Company-driven invite and CSV staging table.

### **core.company\_memberships**

Live company affiliation for a profile.

### **core.company\_onboardings**

Company-specific onboarding or hiring progress for a profile.

## **Seeded reference data**

ref.industries seeded with:

* Telecom

* Logistics

* Construction

* Field Service

* Home Services

* Healthcare Operations

* Manufacturing

* Retail Operations

## **Key rules now enforced in the database**

* One profile per auth user.

* Case-insensitive unique profile email via unique index.

* Unique company slug.

* Controlled status values through check constraints.

* Foreign key relationships across the foundation model.

* No duplicate open membership for the same company/profile pair.

* No duplicate open onboarding for the same company/profile pair.

* updated\_at auto-maintained by trigger function.

## **Installed object list**

### **Schemas**

* core

* ref

### **Function**

* core.set\_updated\_at()

### **Tables**

* ref.industries

* core.profiles

* core.companies

* core.company\_invites

* core.company\_memberships

* core.company\_onboardings

### **Trigger coverage**

* ref.industries

* core.profiles

* core.companies

* core.company\_invites

* core.company\_memberships

* core.company\_onboardings

## **What this checkpoint enables**

The database can now support the first foundation loop:

1. A company can be created.

2. A profile can exist for a platform user.

3. A company can invite users manually or by CSV staging.

4. A profile can enter onboarding for a company.

5. A profile can hold a real company membership.

## **What is intentionally not installed yet**

* RLS policies

* grants / access policy model

* API routes

* landing page UI

* auth/profile setup UI

* company setup UI

* invite acceptance flow

* CSV importer flow

* billing/subscription logic

* stale-profile lifecycle automation

* company-to-company relationships

* analytics/fact tables

* messaging/conversation systems

## **Resume rule**

When resuming this project after today:

1. Re-open **Insight Foundation Checkpoint v1**.

2. Re-open **Insight DDL Checkpoint v1**.

3. Treat this DDL state as the current installed baseline.

4. Build only the next intended layer on top of it.

## **Next intended artifact**

RLS / grants v1 **or** app/API surface build order for:

* landing page

* auth user setup

* profile setup

* company setup

* quick-add / CSV onboarding

Add this to the **DDL / implementation checkpoint**:

* company creation flow is now working

* ref.industries is surfaced through a public.company\_industries view for dropdown hydration

* company create writes company \+ membership successfully

* redirect to /company/\[slug\] is working

* dynamic company route exists and currently renders a basic workspace shell

* next first step: **company context loader**

