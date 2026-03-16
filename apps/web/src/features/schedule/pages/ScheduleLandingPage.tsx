"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SiteHeader from "@/features/landing/components/SiteHeader";
import ScheduleFilters from "@/features/schedule/components/ScheduleFilters";
import ScheduleGrid from "@/features/schedule/components/ScheduleGrid";
import SchedulePostureBand from "@/features/schedule/components/SchedulePostureBand";
import type { ScheduleBaselineDraft } from "@/features/schedule/components/ScheduleBaselineEditor";
import type { DayCounts } from "@/features/schedule/lib/scheduleWorkbench";

type ScheduleGridRow = {
  roster_member_id: string;
  full_name: string;
  tech_id?: string | null;

  role_label: string | null;
  role_bucket: "DRIVER_HELPER" | "OTHER";

  preset_id: string | null;
  preset_code: string | null;

  preset_works_s: boolean | null;
  preset_works_u: boolean | null;
  preset_works_m: boolean | null;
  preset_works_t: boolean | null;
  preset_works_w: boolean | null;
  preset_works_h: boolean | null;
  preset_works_f: boolean | null;

  rotation_mode: string | null;
  anchor_date: string | null;

  default_route_s: string | null;
  default_route_u: string | null;
  default_route_m: string | null;
  default_route_t: string | null;
  default_route_w: string | null;
  default_route_h: string | null;
  default_route_f: string | null;

  schedule_pending: boolean;
};

type SchedulePresetRow = {
  id: string;
  preset_code: string;
  works_s: boolean;
  works_u: boolean;
  works_m: boolean;
  works_t: boolean;
  works_w: boolean;
  works_h: boolean;
  works_f: boolean;
  uses_rotation: boolean;
};

type RouteRow = {
  runs_s: boolean;
  runs_u: boolean;
  runs_m: boolean;
  runs_t: boolean;
  runs_w: boolean;
  runs_h: boolean;
  runs_f: boolean;
};

type PeopleFilter = "drivers_helpers" | "others";

const EMPTY_BASELINE_DRAFT: ScheduleBaselineDraft = {
  preset_id: "",
  rotation_mode: "NONE",
  default_route_s: "",
  default_route_u: "",
  default_route_m: "",
  default_route_t: "",
  default_route_w: "",
  default_route_h: "",
  default_route_f: "",
};

const toolbarButtonStyle: React.CSSProperties = {
  minHeight: 46,
  padding: "0 22px",
  borderRadius: 24,
  fontSize: 14,
  fontWeight: 700,
};

export default function ScheduleLandingPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [rows, setRows] = useState<ScheduleGridRow[]>([]);
  const [presets, setPresets] = useState<SchedulePresetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [routeDemand, setRouteDemand] = useState<DayCounts>({
    s: 0,
    u: 0,
    m: 0,
    t: 0,
    w: 0,
    h: 0,
    f: 0,
  });

  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [rotationFilter, setRotationFilter] = useState("ALL");
  const [peopleFilter, setPeopleFilter] =
    useState<PeopleFilter>("drivers_helpers");

  const [inlineOpenRosterId, setInlineOpenRosterId] = useState<string | null>(
    null
  );
  const [baselineBusy, setBaselineBusy] = useState(false);

  async function loadSchedule() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/schedule`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to load schedule.");
        setRows([]);
        return;
      }

      setRows((data?.rows ?? []) as ScheduleGridRow[]);
    } catch {
      setError("Failed to load schedule.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadPresets() {
    try {
      const res = await fetch(`/api/company/${slug}/schedule/presets`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to load presets.");
        setPresets([]);
        return;
      }

      setPresets((data?.presets ?? []) as SchedulePresetRow[]);
    } catch {
      setError("Failed to load presets.");
      setPresets([]);
    }
  }

  async function loadRouteDemand() {
    try {
      const res = await fetch(`/api/company/${slug}/routes`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) return;

      const routes = (data?.routes ?? []) as RouteRow[];
      const counts: DayCounts = { s: 0, u: 0, m: 0, t: 0, w: 0, h: 0, f: 0 };

      for (const r of routes) {
        if (r.runs_s) counts.s += 1;
        if (r.runs_u) counts.u += 1;
        if (r.runs_m) counts.m += 1;
        if (r.runs_t) counts.t += 1;
        if (r.runs_w) counts.w += 1;
        if (r.runs_h) counts.h += 1;
        if (r.runs_f) counts.f += 1;
      }

      setRouteDemand(counts);
    } catch {
      // silent
    }
  }

  useEffect(() => {
    if (!slug) return;
    loadSchedule();
    loadPresets();
    loadRouteDemand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const rotationOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((r) => r.rotation_mode?.trim())
          .filter((v): v is string => Boolean(v))
      )
    ).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        row.full_name.toLowerCase().includes(q) ||
        (row.tech_id ?? "").toLowerCase().includes(q) ||
        (row.preset_code ?? "").toLowerCase().includes(q) ||
        (row.rotation_mode ?? "").toLowerCase().includes(q) ||
        (row.default_route_s ?? "").toLowerCase().includes(q) ||
        (row.default_route_u ?? "").toLowerCase().includes(q) ||
        (row.default_route_m ?? "").toLowerCase().includes(q) ||
        (row.default_route_t ?? "").toLowerCase().includes(q) ||
        (row.default_route_w ?? "").toLowerCase().includes(q) ||
        (row.default_route_h ?? "").toLowerCase().includes(q) ||
        (row.default_route_f ?? "").toLowerCase().includes(q);

      const matchesPending = !pendingOnly || row.schedule_pending;

      const matchesRotation =
        rotationFilter === "ALL"
          ? true
          : rotationFilter === "__NONE__"
            ? !row.rotation_mode
            : row.rotation_mode === rotationFilter;

      const matchesPeople =
        peopleFilter === "drivers_helpers"
          ? row.role_bucket === "DRIVER_HELPER"
          : row.role_bucket === "OTHER";

      return (
        matchesSearch &&
        matchesPending &&
        matchesRotation &&
        matchesPeople
      );
    });
  }, [rows, search, pendingOnly, rotationFilter, peopleFilter]);

  const routeTotals = useMemo<DayCounts>(() => routeDemand, [routeDemand]);

  const headcountTotals = useMemo<DayCounts>(() => {
    const counts: DayCounts = { s: 0, u: 0, m: 0, t: 0, w: 0, h: 0, f: 0 };

    for (const row of filteredRows) {
      if (!row.preset_id) continue;
      if (row.preset_works_s === true) counts.s += 1;
      if (row.preset_works_u === true) counts.u += 1;
      if (row.preset_works_m === true) counts.m += 1;
      if (row.preset_works_t === true) counts.t += 1;
      if (row.preset_works_w === true) counts.w += 1;
      if (row.preset_works_h === true) counts.h += 1;
      if (row.preset_works_f === true) counts.f += 1;
    }

    return counts;
  }, [filteredRows]);

  const deltaTotals = useMemo<DayCounts>(() => {
    return {
      s: headcountTotals.s - routeTotals.s,
      u: headcountTotals.u - routeTotals.u,
      m: headcountTotals.m - routeTotals.m,
      t: headcountTotals.t - routeTotals.t,
      w: headcountTotals.w - routeTotals.w,
      h: headcountTotals.h - routeTotals.h,
      f: headcountTotals.f - routeTotals.f,
    };
  }, [headcountTotals, routeTotals]);

  function getBaselineDraft(row: ScheduleGridRow): ScheduleBaselineDraft {
    return {
      preset_id: row.preset_id ?? "",
      rotation_mode: row.rotation_mode ?? "NONE",
      default_route_s: row.default_route_s ?? "",
      default_route_u: row.default_route_u ?? "",
      default_route_m: row.default_route_m ?? "",
      default_route_t: row.default_route_t ?? "",
      default_route_w: row.default_route_w ?? "",
      default_route_h: row.default_route_h ?? "",
      default_route_f: row.default_route_f ?? "",
    };
  }

  async function handleSaveBaseline(draft: ScheduleBaselineDraft) {
    if (!inlineOpenRosterId) return;

    try {
      setBaselineBusy(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/schedule/${inlineOpenRosterId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draft),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to save schedule baseline.");
        return;
      }

      setInlineOpenRosterId(null);
      await loadSchedule();
      await loadPresets();
      await loadRouteDemand();
    } catch {
      setError("Failed to save schedule baseline.");
    } finally {
      setBaselineBusy(false);
    }
  }

  async function handleRemoveSchedule(rosterMemberId: string) {
    try {
      setBaselineBusy(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/schedule/${rosterMemberId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to remove schedule.");
        return;
      }

      setInlineOpenRosterId(null);
      await loadSchedule();
      await loadPresets();
      await loadRouteDemand();
    } catch {
      setError("Failed to remove schedule.");
    } finally {
      setBaselineBusy(false);
    }
  }

  function handleToggleInlineEditor(rosterMemberId: string) {
    setInlineOpenRosterId((current) =>
      current === rosterMemberId ? null : rosterMemberId
    );
  }

  function handleCloseInlineEditor() {
    if (!baselineBusy) {
      setInlineOpenRosterId(null);
    }
  }

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="value-strip">
        <div className="value-grid">
          <article
            className="value-card"
            style={{
              gridColumn: "1 / -1",
              paddingTop: 18,
              paddingBottom: 18,
              borderRadius: 40,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <p
                  className="value-card__eyebrow"
                  style={{
                    marginBottom: 4,
                    fontSize: 12,
                    letterSpacing: "0.08em",
                  }}
                >
                  Schedule
                </p>
                <h2
                  className="value-card__title"
                  style={{ marginBottom: 0, fontSize: 20, lineHeight: 1.05 }}
                >
                  Workbench
                </h2>
              </div>

              <div className="cta-row" style={{ marginTop: 0, gap: 10 }}>
                <Link
                  className="button"
                  href={`/company/${slug}`}
                  style={toolbarButtonStyle}
                >
                  Back
                </Link>
                <Link
                  className="button"
                  href={`/company/${slug}/routes`}
                  style={toolbarButtonStyle}
                >
                  Routes
                </Link>
                <Link
                  className="button button-primary"
                  href={`/company/${slug}/schedule/presets`}
                  style={toolbarButtonStyle}
                >
                  Presets
                </Link>
              </div>
            </div>
          </article>

          {error ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
            </article>
          ) : null}

          <article
            className="value-card"
            style={{
              gridColumn: "1 / -1",
              paddingTop: 20,
              borderRadius: 36,
            }}
          >
            <ScheduleFilters
              search={search}
              onSearchChange={setSearch}
              rotationFilter={rotationFilter}
              onRotationFilterChange={setRotationFilter}
              rotationOptions={rotationOptions}
              pendingOnly={pendingOnly}
              onPendingOnlyChange={setPendingOnly}
              peopleFilter={peopleFilter}
              onPeopleFilterChange={setPeopleFilter}
            />

            <SchedulePostureBand
              headcountTotals={headcountTotals}
              routeTotals={routeTotals}
              deltaTotals={deltaTotals}
            />

            <ScheduleGrid
              loading={loading}
              rows={filteredRows}
              presets={presets}
              inlineOpenRosterId={inlineOpenRosterId}
              baselineBusy={baselineBusy}
              getBaselineDraft={getBaselineDraft}
              onToggleInlineEditor={handleToggleInlineEditor}
              onCloseInlineEditor={handleCloseInlineEditor}
              onSaveBaseline={handleSaveBaseline}
              onRemoveSchedule={handleRemoveSchedule}
            />

            <div
              style={{
                position: "sticky",
                bottom: 0,
                zIndex: 3,
                marginTop: 16,
                height: 14,
                border: "1px solid #d6dfeb",
                borderRadius: 28,
                background: "#fff",
              }}
            />
          </article>
        </div>
      </section>
    </main>
  );
}