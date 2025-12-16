"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  divisions: string[];
  regions: string[];
  companies: string[];
  itgSupervisors: string[];
};

function s(v: string | null) {
  return (v ?? "").trim();
}

// Selected (active) button styling — readable in light + dark
const BLUE_BG = "#2563EB";
const BLUE_BORDER = "#1D4ED8";

function pill(active: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid ${active ? BLUE_BORDER : "#ddd"}`,
    background: active ? BLUE_BG : "transparent",
    color: active ? "white" : "inherit",
    fontWeight: 900,
    cursor: "pointer",
  };
}

export default function Filters({ divisions, regions, companies, itgSupervisors }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const division = s(sp.get("division"));
  const region = s(sp.get("region"));
  const company = s(sp.get("company"));
  const itgSupervisor = s(sp.get("itg_supervisor"));
  const statusRaw = s(sp.get("status")); // "" | "active" | "inactive"

  // Validate current selections against the option lists the server computed
  const divisionOk = !division || divisions.includes(division);
  const regionOk = !region || regions.includes(region);
  const companyOk = !company || companies.includes(company);
  const itgOk = !itgSupervisor || itgSupervisors.includes(itgSupervisor);
  const statusOk = !statusRaw || statusRaw === "active" || statusRaw === "inactive";

  const effectiveDivision = divisionOk ? division : "";
  const effectiveRegion = regionOk ? region : "";
  const effectiveCompany = companyOk ? company : "";
  const effectiveItg = itgOk ? itgSupervisor : "";

  // Default filter = active
  const effectiveStatus = statusOk ? (statusRaw || "active") : "active";

  function pushParams(params: URLSearchParams, replace = false) {
    const q = params.toString();
    const href = q ? `/roster?${q}` : "/roster";
    if (replace) router.replace(href);
    else router.push(href);
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());

    if (!value) params.delete(key);
    else params.set(key, value);

    // Cascading clears (top → bottom)
    if (key === "division") {
      params.delete("region");
      params.delete("company");
      params.delete("itg_supervisor");
    }
    if (key === "region") {
      params.delete("company");
      params.delete("itg_supervisor");
    }
    if (key === "company") {
      params.delete("itg_supervisor");
    }

    // Keep status default active unless user explicitly changes it
    if (!params.get("status")) params.set("status", "active");

    pushParams(params);
  }

  // Canonicalize stale/invalid params in the URL (client-side)
  useEffect(() => {
    const needsFix =
      division !== effectiveDivision ||
      region !== effectiveRegion ||
      company !== effectiveCompany ||
      itgSupervisor !== effectiveItg ||
      statusRaw !== effectiveStatus; // also enforces default status=active

    if (!needsFix) return;

    const params = new URLSearchParams(sp.toString());

    if (division !== effectiveDivision) {
      if (effectiveDivision) params.set("division", effectiveDivision);
      else params.delete("division");
      // if division changes/invalid, clear below
      params.delete("region");
      params.delete("company");
      params.delete("itg_supervisor");
    }

    if (region !== effectiveRegion) {
      if (effectiveRegion) params.set("region", effectiveRegion);
      else params.delete("region");
      // if region changes/invalid, clear below
      params.delete("company");
      params.delete("itg_supervisor");
    }

    if (company !== effectiveCompany) {
      if (effectiveCompany) params.set("company", effectiveCompany);
      else params.delete("company");
      params.delete("itg_supervisor");
    }

    if (itgSupervisor !== effectiveItg) {
      if (effectiveItg) params.set("itg_supervisor", effectiveItg);
      else params.delete("itg_supervisor");
    }

    // Default status to active; only remove if explicitly "All"
    if (effectiveStatus) params.set("status", effectiveStatus);
    else params.delete("status");

    pushParams(params, true); // replace to avoid back-button noise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    division,
    region,
    company,
    itgSupervisor,
    statusRaw,
    effectiveDivision,
    effectiveRegion,
    effectiveCompany,
    effectiveItg,
    effectiveStatus,
  ]);

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 14, maxWidth: 760 }}>
      {/* Division buttons */}
      <div>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Division</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setParam("division", "")} style={pill(!effectiveDivision)}>
            All
          </button>

          {divisions.map((d) => (
            <button key={d} type="button" onClick={() => setParam("division", d)} style={pill(d === effectiveDivision)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Region buttons */}
      <div>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Region</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setParam("region", "")} style={pill(!effectiveRegion)}>
            All
          </button>

          {regions.map((r) => (
            <button key={r} type="button" onClick={() => setParam("region", r)} style={pill(r === effectiveRegion)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Company (dropdown) */}
      <div>
        <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Company</label>
        <select
          value={effectiveCompany}
          onChange={(e) => setParam("company", e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "transparent",
            color: "inherit",
            fontWeight: 800,
          }}
        >
          <option value="">Select a Company…</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* ITG Supervisor (dropdown) */}
      <div>
        <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>ITG Supervisor</label>
        <select
          value={effectiveItg}
          onChange={(e) => setParam("itg_supervisor", e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "transparent",
            color: "inherit",
            fontWeight: 800,
          }}
        >
          <option value="">Select an ITG Supervisor…</option>
          {itgSupervisors.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>

      {/* Status buttons (default: Active) */}
      <div>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Status</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "All", value: "" },
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
          ].map(({ label, value }) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => setParam("status", value)}
              style={pill(effectiveStatus === value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
