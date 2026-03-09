"use client";

import { useAccess } from "@/features/access/AccessProvider";

function initials(name?: string, email?: string) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function IdentityPill() {
  const access = useAccess();

  if (access.loading) {
    return <div className="identity-pill identity-pill--muted">Loading…</div>;
  }

  if (!access.auth_user_id) {
    return (
      <a className="identity-pill identity-pill--link" href="/sign-in">
        <span className="identity-pill__avatar">→</span>
        <span className="identity-pill__content">
          <strong>Sign in</strong>
          <span>Access your workspace</span>
        </span>
      </a>
    );
  }

  const name =
    access.display_name ||
    [access.first_name, access.last_name].filter(Boolean).join(" ") ||
    access.email ||
    "Signed in";

  const companyLabel =
    access.memberships && access.memberships.length > 0
      ? access.memberships[0].company_name
      : "No company yet";

  return (
    <div className="identity-pill">
      <span className="identity-pill__avatar">
        {initials(name, access.email)}
      </span>

      <span className="identity-pill__content">
        <strong>{name}</strong>
        <span>
          {access.is_platform_owner ? "Platform Owner" : companyLabel}
        </span>
      </span>
    </div>
  );
}
