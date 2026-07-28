"use client";

import { useEffect, useMemo, useState } from "react";

export type ManifestRouteHealthCard = {
  route_key: string;
  route_label: string | null;
  capture_plan_id: string;
  capture_plan_route_id: string;
  status: string;
  severity: string;
  flags: Record<string, unknown>;
  artifacts: {
    total: number;
    delivery_count: number;
    pickup_count: number;
    delivery_status: string | null;
    pickup_status: string | null;
    latest_captured_at: string | null;
    latest_processed_at: string | null;
  };
  delivery: {
    stop_count: number;
    completed_stop_count: number;
    incomplete_stop_count: number;
    package_count: number;
  };
  express: {
    package_count: number;
    stop_count: number;
    completed_package_count: number;
    incomplete_package_count: number;
    tracking_gap_package_count: number;
    residential_package_count: number;
    signature_package_count: number;
    hazmat_package_count: number;
    collection_package_count: number;
  };
  pickup: {
    stop_count: number;
    expected_package_count: number;
    actual_package_count: number;
    earliest_ready_time: string | null;
    latest_close_time: string | null;
  };
};

type Props = {
  open: boolean;
  slug: string;
  serviceDate: string;
  routeLabel: string;
  health: ManifestRouteHealthCard | null;
  dsw: {
    planned_delivery_stops: number;
    actual_delivery_stops: number;
    vscan_packages: number;
    actual_delivery_packages: number;
    planned_pickup_stops: number;
    actual_pickup_stops: number;
    actual_pickup_packages: number;
    generated_at_text?: string | null;
    ils_percent?: number | string | null;
    miles?: number | null;
  } | null;
  onClose: () => void;
};

type RouteDetailPayload = {
  delivery_stops: Array<Record<string, unknown>>;
  packages: Array<Record<string, unknown>>;
  pickups: Array<Record<string, unknown>>;
  error?: string;
};

export default function RouteHealthOverlay({
  open,
  slug,
  serviceDate,
  routeLabel,
  health,
  dsw,
  onClose,
}: Props) {
  const [detail, setDetail] = useState<RouteDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const routeKey = health?.route_key ?? null;
  const asOf = dsw?.generated_at_text ?? health?.artifacts.latest_processed_at ?? null;

  useEffect(() => {
    if (!open || !routeKey) return;
    let active = true;
    const selectedRouteKey = routeKey;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      try {
        const response = await fetch(
          `/api/company/${slug}/operations/route-health?serviceDate=${encodeURIComponent(serviceDate)}&routeKey=${encodeURIComponent(selectedRouteKey)}`,
          { credentials: "include", cache: "no-store" }
        );
        const payload = (await response.json()) as RouteDetailPayload;
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "Unable to load route detail.");
        setDetail(payload);
      } catch (error) {
        if (active) {
          setDetail(null);
          setDetailError(error instanceof Error ? error.message : "Unable to load route detail.");
        }
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      active = false;
    };
  }, [open, routeKey, serviceDate, slug]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Route Health"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 85,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <section
        style={{
          width: "min(620px, 100vw)",
          height: "100%",
          background: "#f8fafc",
          boxShadow: "-24px 0 60px rgba(15, 23, 42, 0.24)",
          padding: 18,
          overflow: "auto",
          display: "grid",
          alignContent: "start",
          gap: 12,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 4px",
                color: "#64748b",
                fontSize: 11,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Service · Combined Manifest
            </p>
            <h2 style={{ margin: 0, fontSize: 22 }}>{routeLabel}</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13, fontWeight: 800 }}>
              Service date {serviceDate}
            </p>
            <p style={{ margin: "3px 0 0", color: "#475569", fontSize: 12, fontWeight: 900 }}>
              As of {formatAsOf(asOf)}
            </p>
          </div>

          <button
            type="button"
            className="button"
            onClick={onClose}
            style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}
          >
            Close
          </button>
        </header>

        {!health ? (
          <div
            style={{
              border: "1px solid #e5ecf6",
              borderRadius: 16,
              background: "#fff",
              padding: 14,
              color: "#64748b",
              fontSize: 13,
              fontWeight: 850,
              lineHeight: 1.5,
            }}
          >
            No manifest route-health record is linked to this Service row yet. The route can still show
            FCC signal health, DSW progress, and completion. Manifest health appears after Delivery and
            Pickup manifests are captured, normalized, and matched to this route key.
          </div>
        ) : (
          <>
            <DswContract dsw={dsw} />
            <RouteManifestDetail
              detail={detail}
              dsw={dsw}
              loading={detailLoading}
              error={detailError}
            />
          </>
        )}
      </section>
    </div>
  );
}

function formatAsOf(input: string | null) {
  if (!input) return "—";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return input;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DswContract({ dsw }: { dsw: Props["dsw"] }) {
  if (!dsw) return null;
  const ilsRaw = Number(String(dsw.ils_percent ?? "").replace("%", ""));
  const ils = Number.isFinite(ilsRaw)
    ? `${(ilsRaw <= 1 ? ilsRaw * 100 : ilsRaw).toFixed(1).replace(/\.0$/, "")}%`
    : "—";
  const facts = [
    { label: "Stops", value: `${dsw.actual_delivery_stops} / ${dsw.planned_delivery_stops}`, color: "#16a34a", bg: "#ecfdf5" },
    { label: "Packages", value: `${dsw.actual_delivery_packages} / ${dsw.vscan_packages}`, color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Pickups", value: `${dsw.actual_pickup_stops} / ${dsw.planned_pickup_stops}`, color: "#2563eb", bg: "#eff6ff" },
    { label: "Pickup Pkgs", value: String(dsw.actual_pickup_packages), color: "#0284c7", bg: "#f0f9ff" },
    { label: "ILS", value: ils, color: "#0f766e", bg: "#f0fdfa" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
      {facts.map((fact) => (
        <div key={fact.label} style={{ border: `1px solid ${fact.color}33`, borderTop: `4px solid ${fact.color}`, borderRadius: 11, background: fact.bg, padding: "7px 8px", display: "grid", gap: 2 }}>
          <span style={{ color: fact.color, fontSize: 8, fontWeight: 950, letterSpacing: "0.05em", textTransform: "uppercase" }}>{fact.label}</span>
          <strong style={{ color: "#0f172a", fontSize: 12 }}>{fact.value}</strong>
        </div>
      ))}
    </div>
  );
}

function value(row: Record<string, unknown>, key: string) {
  const result = row[key];
  return result === null || result === undefined || result === "" ? "—" : String(result);
}

function address(row: Record<string, unknown>) {
  return ["address_line_1", "address_line_2", "city", "state", "postal_code"]
    .map((key) => value(row, key))
    .filter((part) => part !== "—")
    .join(", ");
}

type CombinedManifestItem = {
  key: string;
  kind: "delivery" | "pickup" | "combined";
  sequence: number;
  title: string;
  subtitle: string;
  address: string;
  window: string;
  packageCount: number;
  expectedCount: number | null;
  pickupPackageCount: number;
  pickupExpectedCount: number | null;
  complete: boolean;
  open: boolean;
  coded: boolean;
  attention: boolean;
  packageLinked: boolean;
  packageMismatch: boolean;
  express: boolean;
  signature: boolean;
  hazmat: boolean;
  collection: boolean;
  unmanifested: boolean;
  instructions: string;
  contact: string;
  packages: Array<Record<string, unknown>>;
};

function rawValue(row: Record<string, unknown>, key: string) {
  return String(row[key] ?? "").trim();
}

function normalizedIdentityPart(input: string) {
  return input.trim().replace(/\s+/g, " ").toUpperCase();
}

function identity(row: Record<string, unknown>) {
  const stopNumber = rawValue(row, "st_number");
  const sid = rawValue(row, "sid");
  if (sid) {
    return `SID|${normalizedIdentityPart(sid)}`;
  }
  const detailIdentity = [
    normalizedIdentityPart(address(row)),
    normalizedIdentityPart(rawValue(row, "recipient")),
    normalizedIdentityPart(rawValue(row, "contact_name")),
    normalizedIdentityPart(rawValue(row, "delivery_time_begin")),
    normalizedIdentityPart(rawValue(row, "delivery_time_end")),
  ].join("|");
  return detailIdentity.replaceAll("|", "")
    ? `DETAIL|${detailIdentity}`
    : `STOP|${normalizedIdentityPart(stopNumber)}`;
}

function truthy(row: Record<string, unknown>, key: string) {
  return row[key] === true || String(row[key] ?? "").toUpperCase() === "Y";
}

function numberValue(row: Record<string, unknown>, key: string) {
  const parsed = Number(row[key] ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sequenceValue(valueToParse: unknown, fallback: number) {
  const parsed = Number.parseInt(String(valueToParse ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const MANIFEST_FALLBACK_LAG_MS = 30 * 60 * 1000;

function timestamp(valueToParse: unknown) {
  const parsed = new Date(String(valueToParse ?? "")).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function latestManifestTimestamp(detail: RouteDetailPayload | null) {
  if (!detail) return null;
  const timestamps = [
    ...detail.delivery_stops,
    ...detail.packages,
    ...detail.pickups,
  ]
    .map((row) => timestamp(row.created_at))
    .filter((entry): entry is number => entry !== null);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function buildCombinedManifest(detail: RouteDetailPayload) {
  const packagesByStop = new Map<string, Array<Record<string, unknown>>>();
  detail.packages.forEach((packageRow) => {
    const key = identity(packageRow);
    packagesByStop.set(key, [...(packagesByStop.get(key) ?? []), packageRow]);
  });

  const canonicalStops = Array.from(
    detail.delivery_stops.reduce<Map<string, Record<string, unknown>>>((stops, stop) => {
      const key = identity(stop);
      const current = stops.get(key);
      if (!current || String(stop.created_at ?? "") >= String(current.created_at ?? "")) {
        stops.set(key, stop);
      }
      return stops;
    }, new Map()).values()
  );

  const deliveries = canonicalStops.map<CombinedManifestItem>((stop, index) => {
    const packages = packagesByStop.get(identity(stop)) ?? [];
    const unmanifested = !rawValue(stop, "sid");
    const packageLinked = packages.length > 0;
    const evidenceStates = packages.map((packageRow) =>
      rawValue(packageRow, "delivery_evidence_state")
    );
    const hasOpen = evidenceStates.includes("OPEN");
    const hasCodedAttempt = evidenceStates.includes("CODED_ATTEMPT");
    const hasTrackingGap = evidenceStates.includes("NEEDS_ATTENTION");
    const hasCompleteEvidence = evidenceStates.every(
      (state) => state === "COMPLETED"
    );
    const attention =
      unmanifested ||
      !packageLinked ||
      hasTrackingGap ||
      !evidenceStates.every((state) =>
        ["OPEN", "CODED_ATTEMPT", "COMPLETED", "NEEDS_ATTENTION"].includes(
          state
        )
      );
    return {
      key: `delivery-${identity(stop)}-${index}`,
      kind: "delivery",
      sequence: sequenceValue(stop.st_number, index + 1),
      title: `Stop ${value(stop, "st_number")} · ${value(stop, "recipient")}`,
      subtitle: `SID ${value(stop, "sid")}`,
      address: address(stop),
      window: `${value(stop, "delivery_time_begin")}–${value(stop, "delivery_time_end")}`,
      packageCount: packages.length || numberValue(stop, "package_count"),
      expectedCount: null,
      pickupPackageCount: 0,
      pickupExpectedCount: null,
      complete: !attention && hasCompleteEvidence,
      open: !attention && hasOpen,
      coded: !attention && hasCodedAttempt,
      attention,
      packageLinked,
      packageMismatch: !unmanifested && !packageLinked,
      express: packages.some((row) => truthy(row, "is_express")),
      signature: packages.some((row) => truthy(row, "is_signature")),
      hazmat: packages.some((row) => truthy(row, "is_hazmat")),
      collection: packages.some((row) => truthy(row, "is_collection")),
      unmanifested,
      instructions: value(stop, "stop_instructions"),
      contact: value(stop, "contact_name"),
      packages,
    };
  });

  const pickups = detail.pickups.map<CombinedManifestItem>((pickup, index) => {
    const actual = numberValue(pickup, "packages_picked_up");
    const expected = numberValue(pickup, "package_count_expected");
    return {
      key: `pickup-${value(pickup, "puid")}-${index}`,
      kind: "pickup",
      sequence: sequenceValue(pickup.pickup_list, 10000 + index),
      title: `${value(pickup, "shipper_name")} · Pickup`,
      subtitle: `PUID ${value(pickup, "puid")} · ${value(pickup, "pickup_type")}`,
      address: address(pickup),
      window: `${value(pickup, "ready_at")}–${value(pickup, "close_at")}`,
      packageCount: actual,
      expectedCount: expected,
      pickupPackageCount: actual,
      pickupExpectedCount: expected,
      complete: expected === 0 ? Boolean(pickup.pu_closed_at) : actual >= expected,
      open: expected === 0 ? !pickup.pu_closed_at : actual < expected,
      coded: false,
      attention: false,
      packageLinked: true,
      packageMismatch: false,
      express: false,
      signature: false,
      hazmat: false,
      collection: false,
      unmanifested: false,
      instructions: value(pickup, "reason_code"),
      contact: value(pickup, "shipper_number"),
      packages: [],
    };
  });

  const unmatchedPickups = [...pickups];
  const combined: CombinedManifestItem[] = [];
  const remainingDeliveries: CombinedManifestItem[] = [];

  deliveries.forEach((delivery) => {
    const addressToken = (input: string) => normalizedIdentityPart(input).replace(/[^A-Z0-9]/g, "");
    const zipToken = (input: string) => input.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5) ?? "";
    const streetNumber = (input: string) => input.match(/^\s*(\d+[A-Z]?)/i)?.[1]?.toUpperCase() ?? "";
    const deliveryAddress = addressToken(delivery.address);
    const deliveryZip = zipToken(delivery.address);
    const deliveryStreetNumber = streetNumber(delivery.address);
    let pickupIndex = deliveryAddress
      ? unmatchedPickups.findIndex((pickup) => {
          const pickupAddress = addressToken(pickup.address);
          if (pickupAddress === deliveryAddress) return true;
          const pickupZip = zipToken(pickup.address);
          const pickupStreetNumber = streetNumber(pickup.address);
          return Boolean(
            deliveryZip &&
            pickupZip === deliveryZip &&
            deliveryStreetNumber &&
            pickupStreetNumber === deliveryStreetNumber
          );
        })
      : -1;

    if (pickupIndex < 0 && delivery.collection && unmatchedPickups.length > 0) {
      pickupIndex = 0;
    }

    if (pickupIndex < 0) {
      remainingDeliveries.push(delivery);
      return;
    }

    const [pickup] = unmatchedPickups.splice(pickupIndex, 1);
    combined.push({
      ...delivery,
      key: `combined-${delivery.key}-${pickup.key}`,
      kind: "combined",
      title: `${delivery.title} · Delivery + Pickup`,
      subtitle: `${delivery.subtitle} · ${pickup.subtitle}`,
      window: `${delivery.window} · Pickup ${pickup.window}`,
      pickupPackageCount: pickup.packageCount,
      pickupExpectedCount: pickup.expectedCount,
      complete: !delivery.attention && delivery.complete && pickup.complete,
      open:
        !delivery.attention &&
        !delivery.unmanifested &&
        !delivery.packageMismatch &&
        (delivery.open || pickup.open),
      coded:
        !delivery.attention &&
        !delivery.unmanifested &&
        !delivery.packageMismatch &&
        delivery.coded,
      attention: delivery.attention,
      collection: delivery.collection,
      instructions: [delivery.instructions, pickup.instructions]
        .filter((part) => part !== "—")
        .join(" · ") || "—",
      contact: [delivery.contact, pickup.contact]
        .filter((part) => part !== "—")
        .join(" · ") || "—",
    });
  });

  return [...remainingDeliveries, ...combined, ...unmatchedPickups].sort(
    (left, right) => left.sequence - right.sequence
  );
}

function RouteManifestDetail(props: {
  detail: RouteDetailPayload | null;
  dsw: Props["dsw"];
  loading: boolean;
  error: string | null;
}) {
  const [completionFilter, setCompletionFilter] = useState<
    "all" | "open" | "coded" | "completed" | "attention"
  >("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "delivery" | "express" | "pickup" | "combined" | "unmanifested" | "package_mismatch" | "signature" | "hazmat">("all");
  const items = useMemo(
    () => (props.detail ? buildCombinedManifest(props.detail) : []),
    [props.detail]
  );
  const manifestLatestAt = useMemo(
    () => latestManifestTimestamp(props.detail),
    [props.detail]
  );
  const dswGeneratedAt = timestamp(props.dsw?.generated_at_text);
  const useDswFallback = Boolean(
    props.dsw &&
      dswGeneratedAt !== null &&
      (manifestLatestAt === null ||
        dswGeneratedAt - manifestLatestAt > MANIFEST_FALLBACK_LAG_MS)
  );

  if (props.loading) return <div style={{ padding: 12, color: "#64748b" }}>Loading manifest rows…</div>;
  if (props.error) return <div style={{ padding: 12, color: "#991b1b" }}>{props.error}</div>;
  if (!props.detail) return null;

  const evidenceItems = useDswFallback ? [] : items;
  const visibleItems = evidenceItems.filter((item) => {
    const completionMatches =
      completionFilter === "all" ||
      (completionFilter === "open" && item.open) ||
      (completionFilter === "coded" && item.coded) ||
      (completionFilter === "completed" && item.complete) ||
      (completionFilter === "attention" && item.attention);
    const typeMatches =
      typeFilter === "all" ||
      (typeFilter === "delivery" && item.kind === "delivery") ||
      (typeFilter === "pickup" && item.kind === "pickup") ||
      (typeFilter === "combined" && item.kind === "combined") ||
      (typeFilter === "unmanifested" && item.unmanifested) ||
      (typeFilter === "package_mismatch" && item.packageMismatch) ||
      (typeFilter === "express" && item.express) ||
      (typeFilter === "signature" && item.signature) ||
      (typeFilter === "hazmat" && item.hazmat);
    return completionMatches && typeMatches;
  });
  const manifestOpenCount = evidenceItems.filter((item) => item.open).length;
  const manifestCodedCount = evidenceItems.filter((item) => item.coded).length;
  const manifestClosedCount = evidenceItems.filter((item) => item.complete).length;
  const manifestAttentionCount = evidenceItems.filter(
    (item) => item.attention
  ).length;
  const fallbackAllCount = props.dsw
    ? Math.max(
        props.dsw.planned_delivery_stops,
        props.dsw.actual_delivery_stops
      )
    : 0;
  const fallbackOpenCount = props.dsw
    ? Math.max(
        props.dsw.planned_delivery_stops -
          props.dsw.actual_delivery_stops,
        0
      )
    : 0;
  const fallbackCompletedCount = props.dsw
    ? Math.max(props.dsw.actual_delivery_stops, 0)
    : 0;
  const allCount = useDswFallback ? fallbackAllCount : items.length;
  const openCount = useDswFallback ? fallbackOpenCount : manifestOpenCount;
  const codedCount = useDswFallback ? 0 : manifestCodedCount;
  const closedCount = useDswFallback
    ? fallbackCompletedCount
    : manifestClosedCount;
  const attentionCount = useDswFallback ? 0 : manifestAttentionCount;
  const packageCount = useDswFallback
    ? Math.max(props.dsw?.vscan_packages ?? 0, 0)
    : props.detail.packages.length;
  const remainingStops = props.dsw
    ? Math.max(
        props.dsw.planned_delivery_stops -
          props.dsw.actual_delivery_stops,
        0
      )
    : null;
  const remainingPackages = props.dsw
    ? Math.max(
        props.dsw.vscan_packages -
          props.dsw.actual_delivery_packages,
        0
      )
    : null;
  const typeOptions = [
    { key: "delivery", label: "Delivery", count: evidenceItems.filter((item) => item.kind === "delivery").length, color: "#166534", bg: "#ecfdf5" },
    { key: "express", label: "Express", count: evidenceItems.filter((item) => item.express).length, color: "#9a3412", bg: "#fff7ed" },
    { key: "pickup", label: "Pickup", count: evidenceItems.filter((item) => item.kind === "pickup").length, color: "#1d4ed8", bg: "#eff6ff" },
    { key: "combined", label: "Combined", count: evidenceItems.filter((item) => item.kind === "combined").length, color: "#7c3aed", bg: "#f5f3ff" },
    { key: "unmanifested", label: "Unmanifested", count: evidenceItems.filter((item) => item.unmanifested).length, color: "#b91c1c", bg: "#fef2f2" },
    { key: "package_mismatch", label: "Package Link Failure", count: evidenceItems.filter((item) => item.packageMismatch).length, color: "#be123c", bg: "#fff1f2" },
    { key: "signature", label: "Signature", count: evidenceItems.filter((item) => item.signature).length, color: "#6d28d9", bg: "#f5f3ff" },
    { key: "hazmat", label: "Hazmat", count: evidenceItems.filter((item) => item.hazmat).length, color: "#991b1b", bg: "#fef2f2" },
  ].filter((option) => option.count > 0) as Array<{
    key: Exclude<typeof typeFilter, "all">;
    label: string;
    count: number;
    color: string;
    bg: string;
  }>;

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div>
        <strong style={{ fontSize: 18 }}>Route execution sequence</strong>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>
          {allCount} stops · {packageCount} packages · {codedCount} attempted/coded · {openCount} open · {attentionCount} need attention
        </div>
      </div>

      {useDswFallback ? (
        <div
          style={{
            border: "1px solid #93c5fd",
            borderRadius: 12,
            background: "#eff6ff",
            color: "#1e40af",
            padding: "10px 12px",
            display: "grid",
            gap: 4,
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          <span>
            DSW fallback active · {closedCount} completed · {openCount} open
          </span>
          <span style={{ color: "#64748b" }}>
            DSW is newer than the available manifest detail. Stale item rows are
            withheld until the runner refreshes this route.
            {manifestLatestAt !== null
              ? ` Last manifest refresh ${formatAsOf(
                  new Date(manifestLatestAt).toISOString()
                )}.`
              : ""}
          </span>
        </div>
      ) : remainingStops !== null && remainingPackages !== null ? (
        <div
          style={{
            border: "1px solid #fed7aa",
            borderRadius: 12,
            background: "#fff7ed",
            color: "#9a3412",
            padding: "10px 12px",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          <span>
            Open by DSW · {remainingStops} stops · {remainingPackages} packages
          </span>
          <span style={{ color: "#64748b" }}>
            Manifest rows below provide item-level delivery and attempt evidence.
          </span>
        </div>
      ) : null}

      <div style={{ border: "1px solid #dbe4ef", borderRadius: 14, background: "#fff", padding: 8, display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
          {([[
            "all", "All", allCount,
          ], ["open", "Open", openCount], ["coded", "Attempted", codedCount], ["completed", "Completed", closedCount], ["attention", "Inspect", attentionCount]] as const).map(([key, label, count]) => (
            <button key={key} type="button" onClick={() => setCompletionFilter(key)} style={{ border: `1px solid ${completionFilter === key ? "#0f172a" : "transparent"}`, borderRadius: 9, background: completionFilter === key ? "#0f172a" : "#f8fafc", color: completionFilter === key ? "#fff" : "#475569", minHeight: 36, fontSize: 11, fontWeight: 950 }}>
              {label} · {count}
            </button>
          ))}
        </div>

        {typeOptions.length ? (
          <div style={{ borderTop: "1px solid #eef2f7", paddingTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {typeOptions.length > 1 ? (
              <button type="button" onClick={() => setTypeFilter("all")} style={{ border: `1px solid ${typeFilter === "all" ? "#64748b" : "#dbe4ef"}`, borderRadius: 999, background: typeFilter === "all" ? "#f1f5f9" : "#fff", color: "#475569", padding: "6px 9px", fontSize: 10, fontWeight: 950 }}>
                All types · {allCount}
              </button>
            ) : null}
            {typeOptions.map((option) => (
              <button key={option.key} type="button" onClick={() => setTypeFilter((current) => current === option.key ? "all" : option.key)} style={{ border: `1px solid ${option.color}`, borderRadius: 999, background: option.bg, color: option.color, boxShadow: typeFilter === option.key ? `0 0 0 2px ${option.color}33` : "none", opacity: typeFilter === "all" || typeFilter === option.key ? 1 : 0.55, padding: "6px 9px", fontSize: 10, fontWeight: 950 }}>
                {option.label} · {option.count}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {useDswFallback ? (
          <div style={{ border: "1px solid #bfdbfe", borderRadius: 14, background: "#fff", padding: 14, color: "#475569", fontSize: 13 }}>
            Current route totals are supplied by DSW. Item-level manifest
            evidence will return automatically after this route receives a
            newer manifest refresh.
          </div>
        ) : visibleItems.length === 0 ? (
          <div style={{ border: "1px solid #e5ecf6", borderRadius: 14, background: "#fff", padding: 14, color: "#64748b", fontSize: 13 }}>No combined-manifest stops match this view.</div>
        ) : visibleItems.map((item) => {
          const itemColor = item.unmanifested ? "#b91c1c" : item.hazmat ? "#dc2626" : item.kind === "combined" ? "#7c3aed" : item.kind === "pickup" ? "#2563eb" : item.express ? "#f97316" : item.collection ? "#0284c7" : "#16a34a";
          const itemTint = item.unmanifested ? "#fef2f2" : item.hazmat ? "#fef2f2" : item.kind === "combined" ? "#f5f3ff" : item.kind === "pickup" ? "#eff6ff" : item.express ? "#fff7ed" : item.collection ? "#f0f9ff" : "#ecfdf5";
          return (
          <details key={item.key} style={{ border: `1px solid ${item.attention ? "#ef4444" : item.coded ? "#f97316" : item.open ? "#fbbf24" : itemColor}`, borderLeft: `6px solid ${itemColor}`, borderRadius: 14, background: "#fff", overflow: "hidden" }}>
            <summary style={{ listStyle: "none", cursor: "pointer", padding: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
              <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ color: itemColor, background: itemTint, borderRadius: 999, padding: "3px 6px", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>{item.kind === "delivery" && item.express ? "Express delivery" : item.kind}</span>
                  <strong style={{ fontSize: 13 }}>{item.title}</strong>
                </div>
                <span style={{ color: "#64748b", fontSize: 11 }}>{item.subtitle} · {item.address || "Address unavailable"}</span>
                <span style={{ color: "#475569", fontSize: 10, fontWeight: 850 }}>Window {item.window} · {item.instructions === "—" ? "No stop instructions" : item.instructions}</span>
              </div>
              <div style={{ textAlign: "right", display: "grid", gap: 2 }}>
                <strong style={{ fontSize: 12 }}>
                  {item.kind === "combined"
                    ? `D ${item.packageCount} · P ${item.pickupPackageCount}${item.pickupExpectedCount !== null ? ` / ${item.pickupExpectedCount}` : ""}`
                    : `${item.packageCount}${item.expectedCount !== null ? ` / ${item.expectedCount}` : ""} pkg`}
                </strong>
                <span style={{ color: item.attention ? "#b91c1c" : item.complete ? "#166534" : item.coded ? "#c2410c" : "#92400e", fontSize: 10, fontWeight: 950 }}>
                  {item.unmanifested ? "UNMANIFESTED" : item.packageMismatch ? "PACKAGE LINK FAILURE" : item.attention ? "NEEDS ATTENTION" : item.complete ? "COMPLETED" : item.coded ? "ATTEMPTED · CODED" : "OPEN"}
                </span>
              </div>
            </summary>
            <div style={{ borderTop: "1px solid #eef2f7", padding: 12, display: "grid", gap: 8, fontSize: 12 }}>
              <div><strong>Window:</strong> {item.window}</div>
              <div><strong>Contact:</strong> {item.contact} · <strong>Instructions:</strong> {item.instructions}</div>
              {item.unmanifested ? (
                <div style={{ border: "1px solid #fecaca", borderRadius: 10, background: "#fef2f2", color: "#991b1b", padding: 8, fontWeight: 900 }}>
                  Terminal scan/tender missing. No SID was assigned before the parcel was loaded to the route.
                </div>
              ) : null}
              {item.packageMismatch ? (
                <div style={{ border: "1px solid #fecdd3", borderRadius: 10, background: "#fff1f2", color: "#9f1239", padding: 8, fontWeight: 900 }}>
                  SID exists, but no package facts link to this stop. Open/completed status is withheld until the package contract reconciles.
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {item.express ? <span style={{ borderRadius: 999, background: "#fff7ed", color: "#9a3412", padding: "4px 7px", fontWeight: 900 }}>Express</span> : null}
                {item.signature ? <span style={{ borderRadius: 999, background: "#f5f3ff", color: "#6d28d9", padding: "4px 7px", fontWeight: 900 }}>Signature</span> : null}
                {item.hazmat ? <span style={{ borderRadius: 999, background: "#fef2f2", color: "#991b1b", padding: "4px 7px", fontWeight: 900 }}>Hazmat</span> : null}
                {item.collection ? <span style={{ borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", padding: "4px 7px", fontWeight: 900 }}>Collection</span> : null}
              </div>
              {item.packages.length ? (
                <div style={{ display: "grid", gap: 4 }}>
                  {item.packages.map((packageRow, index) => {
                    const evidenceState = rawValue(
                      packageRow,
                      "delivery_evidence_state"
                    );
                    const codeParts = [
                      rawValue(packageRow, "vsa_status_code")
                        ? `VSA ${rawValue(packageRow, "vsa_status_code")}`
                        : "",
                      rawValue(packageRow, "star_status_code")
                        ? `STAR ${rawValue(packageRow, "star_status_code")}`
                        : "",
                    ].filter(Boolean);
                    const evidenceLabel =
                      evidenceState === "CODED_ATTEMPT"
                        ? `ATTEMPTED${codeParts.length ? ` · ${codeParts.join(" · ")}` : " · CODED"}`
                        : evidenceState === "OPEN"
                          ? "OPEN"
                        : evidenceState === "COMPLETED"
                          ? "COMPLETED"
                          : "NEEDS ATTENTION";
                    const evidenceColor =
                      evidenceState === "CODED_ATTEMPT"
                        ? "#c2410c"
                        : evidenceState === "OPEN"
                          ? "#92400e"
                        : evidenceState === "COMPLETED"
                          ? "#166534"
                          : "#b91c1c";
                    return (
                      <div key={`${value(packageRow, "tracking_id")}-${index}`} style={{ borderTop: "1px solid #eef2f7", paddingTop: 6, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                          <span>{value(packageRow, "tracking_id")}</span>
                          <span style={{ color: "#64748b", fontSize: 10 }}>
                            {value(packageRow, "prem_svc_raw")}
                          </span>
                        </div>
                        <span style={{ color: evidenceColor, fontSize: 10, fontWeight: 950, textAlign: "right" }}>
                          {evidenceLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </details>
          );
        })}
      </div>
    </section>
  );
}
