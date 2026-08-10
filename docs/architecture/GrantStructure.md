## Workspace Grants Architecture

### Purpose

Workspace grants govern company navigation visibility and workspace access authorization.

The objective is simple:

```text
User
    ↓
Signs In
    ↓
What company workspaces can they see?
    ↓
What company workspaces can they enter?
```

Workspace grants are not organizational hierarchy, leadership assignments, ownership records, or employment records. They exist solely to control visibility and access within a company workspace.

---

### Source of Truth

Workspace access is stored in:

```text
core.company_user_grant
```

Proposed structure:

```sql
id uuid primary key

company_id uuid not null
profile_id uuid not null

grant_key text not null

created_at timestamptz not null default now()
created_by_profile_id uuid null

unique (
    company_id,
    profile_id,
    grant_key
)
```

Each row represents a single grant assigned to a profile within a company.

Example:

```text
Keystone
    Ted Carlson
        Dispatch

Keystone
    Ted Carlson
        Planning

Keystone
    Ted Carlson
        Delivery Window
```

---

### Identity Model

Workspace grants attach to Profiles.

```text
Auth User
    ↓
Profile
    ↓
Company Membership
    ↓
Workspace Grants
```

Workspace grants do not attach directly to workforce roster records.

Reason:

```text
Authorization belongs to Profiles.

Workforce management belongs to Company Roster.
```

A workforce record may exist without application access.

A profile represents an authenticated user.

---

### Runtime Access Signature

The database is the source of truth.

The application consumes a runtime access signature generated through:

```sql
access_context()
```

Example:

```json
{
  "profile_id": "...",
  "is_platform_owner": false,
  "memberships": [
    {
      "company_id": "...",
      "company_slug": "keystone",
      "relationship_type": "member",
      "grants": [
        "dispatch",
        "schedule",
        "delivery_window"
      ]
    }
  ]
}
```

The access signature is a runtime snapshot.

It is not the source of truth.

---

### Navigation Visibility

Company navigation should only render workspaces granted to the active user.

Examples:

```text
Grant: dispatch
    → Show Dispatch

Grant: planning
    → Show Planning

Grant: payroll
    → Show Payroll
```

If a grant is absent, the workspace should not appear in navigation.

Navigation should reflect reality.

Users should not see destinations they cannot access.

---

### Route Protection

Navigation visibility is not security.

Every workspace route and API endpoint must independently validate access.

```text
Navigation Hidden
        +
Route Protected
        +
API Protected
```

All access checks should be derived from the same runtime access signature.

---

### Administrative Overrides

The following identities bypass workspace grants:

```text
Platform Owner
Company Admin
```

These identities retain full company access regardless of assigned grants.

All other users operate through explicit workspace grants.

---

### Initial Grant Catalog

Operations

- schedule
- dispatch
- routes
- planning
- delivery_window
- operations_uploads
- reports
- fleet

Workforce

- roster
- hiring

Business

- payroll
- admin_config
- grant_management

Additional grants may be introduced over time as new workspaces are added.

Inspections are not a workspace grant. Every active workforce user reaches the
driver inspection workflow independently of Fleet workspace access. The Fleet
grant governs Fleet vehicles, maintenance, inspection history, and management
surfaces under `/company/[slug]/fleet`.

---

### Guiding Principle

Workspace grants determine:

```text
What users can see.
What users can enter.
```

Nothing more.

Leadership assignments, company governance, ownership records, and succession planning are separate concerns and should not be modeled through workspace grants.
