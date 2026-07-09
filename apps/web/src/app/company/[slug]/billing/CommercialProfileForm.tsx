"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";

const TIERS = [
  {
    key: "",
    label: "Select operator tier...",
    implementation: "",
    weekly: "",
  },
  {
    key: "operator_1",
    label: "Operator 1 (1–10 Routes)",
    implementation: "$118",
    weekly: "$59/week",
  },
  {
    key: "operator_2",
    label: "Operator 2 (11–15 Routes)",
    implementation: "$198",
    weekly: "$99/week",
  },
  {
    key: "operator_3",
    label: "Operator 3 (16–25 Routes)",
    implementation: "$398",
    weekly: "$199/week",
  },
  {
    key: "operator_4",
    label: "Operator 4 (26–50 Routes)",
    implementation: "$698",
    weekly: "$349/week",
  },
  {
    key: "operator_5",
    label: "Operator 5 (51+ Routes)",
    implementation: "Custom",
    weekly: "Custom",
  },
];

export default function CommercialProfileForm(props: {
  billingEmail: string;
  profile: any;
}) {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug);
  const [tier, setTier] = useState(props.profile?.operator_tier_key ?? "");
  const [contactName, setContactName] = useState(props.profile?.billing_contact_name ?? "");
  const [billingPhone, setBillingPhone] = useState(props.profile?.billing_phone ?? "");
  const [email, setEmail] = useState(props.profile?.billing_email ?? props.billingEmail);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => TIERS.find((x) => x.key === tier) ?? TIERS[0],
    [tier]
  );


  async function saveProfile() {
    try {
      setSaving(true);

      const implementation =
        selected.implementation && selected.implementation !== "Custom"
          ? Number(selected.implementation.replace(/[$,]/g, ""))
          : null;

      const weekly =
        selected.weekly && selected.weekly !== "Custom"
          ? Number(selected.weekly.replace(/[$,/week]/g, ""))
          : null;

      const res = await fetch(`/api/company/${slug}/commercial/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operator_tier_key: tier || null,
          implementation_fee: implementation,
          weekly_subscription: weekly,
          billing_contact_name: contactName,
          billing_email: email,
          billing_phone: billingPhone,
          commercial_status: "profile_complete",
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Save failed");
      }

      alert("Commercial profile saved.");
    } catch (err) {
      console.error(err);
      alert("Unable to save commercial profile.");
    } finally {
      setSaving(false);
    }
  }


  return (
    <>
      <table style={table}>
        <tbody>
          <Row
            label="Operator Tier"
            value={
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                style={inputStyle}
              >
                {TIERS.map((tier) => (
                  <option key={tier.key} value={tier.key}>
                    {tier.label}
                  </option>
                ))}
              </select>
            }
          />

          <Row
            label="Implementation Fee"
            value={selected.implementation || "Pending"}
          />

          <Row
            label="Weekly Subscription"
            value={selected.weekly || "Pending"}
          />

          <Row
            label="Billing Contact Name"
            value={
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Accounts payable contact"
                style={inputStyle}
              />
            }
          />

          <Row
            label="Billing Email Address"
            value={
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            }
          />

          <Row
            label="Billing Phone"
            value={
              <input
                value={billingPhone}
                onChange={(e) => setBillingPhone(e.target.value)}
                placeholder="Optional"
                style={inputStyle}
              />
            }
          />

          <Row
            label="Commercial Status"
            value="Draft"
          />
        </tbody>
      </table>

      <div style={{ padding: 18 }}>
        <button
          type="button"
          style={primaryButton}
          disabled={saving}
          onClick={saveProfile}
        >
          {saving ? "Saving..." : "Save Commercial Profile"}
        </button>
      </div>
    </>
  );
}

function Row(props: { label: string; value: React.ReactNode }) {
  return (
    <tr style={tr}>
      <th style={th}>{props.label}</th>
      <td style={td}>{props.value}</td>
    </tr>
  );
}

const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const tr = {
  borderBottom: "1px solid #e2e8f0",
};

const th = {
  width: 260,
  padding: "12px 18px",
  textAlign: "left" as const,
  background: "#f8fafc",
  color: "#64748b",
  fontWeight: 900,
  fontSize: 12,
  textTransform: "uppercase" as const,
};

const td = {
  padding: "12px 18px",
};

const inputStyle = {
  width: "100%",
  maxWidth: 360,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
};

const primaryButton = {
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 800,
};
