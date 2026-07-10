"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";


function tierOptions(tiers: any) {
  const rows = Array.isArray(tiers) ? tiers : [];

  return [
    {
      tier_key: "",
      display_name: "Select operator tier...",
      implementation_fee: null,
      weekly_subscription: null,
    },
    ...rows,
  ];
}


export default function CommercialProfileForm(props: {
  billingEmail: string;
  profile: any;
  tiers: any[];
}) {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug);
  const [tier, setTier] = useState(props.profile?.operator_tier_key ?? "");
  const [contactName, setContactName] = useState(props.profile?.billing_contact_name ?? "");
  const [billingPhone, setBillingPhone] = useState(props.profile?.billing_phone ?? "");
  const [email, setEmail] = useState(props.profile?.billing_email ?? props.billingEmail);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () =>
      tierOptions(props.tiers).find((x: any) => x.tier_key === tier) ??
      tierOptions(props.tiers)[0],
    [props.tiers, tier]
  );


  async function saveProfile() {
    try {
      setSaving(true);

      const implementation =
        selected.implementation_fee == null ? null : Number(selected.implementation_fee);

      const weekly =
        selected.weekly_subscription == null ? null : Number(selected.weekly_subscription);

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
          commercial_status:
            props.profile?.commercial_status === "draft" ||
            !props.profile?.commercial_status
              ? "profile_complete"
              : props.profile.commercial_status,
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
                {tierOptions(props.tiers).map((tier: any) => (
                  <option key={tier.tier_key} value={tier.tier_key}>
                    {tier.display_name}
                  </option>
                ))}
              </select>
            }
          />

          <Row
            label="Implementation Fee"
            value={formatCurrency(selected.implementation_fee)}
          />

          <Row
            label="Weekly Subscription"
            value={formatWeekly(selected.weekly_subscription)}
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
            value={formatCommercialStatus(props.profile?.commercial_status ?? "draft")}
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

function formatCommercialStatus(value: string) {
  switch (value) {
    case "stripe_customer_created":
      return "Implementation payment required.";

    case "implementation_paid":
      return "Implementation paid; awaiting Go Live.";

    case "subscription_active":
      return "Subscription activated.";

    default:
      return value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function formatCurrency(value: unknown) {
  if (value == null || value === "") return "Pending";
  return `$${Number(value).toFixed(0)}`;
}

function formatWeekly(value: unknown) {
  if (value == null || value === "") return "Pending";
  return `$${Number(value).toFixed(0)}/week`;
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
