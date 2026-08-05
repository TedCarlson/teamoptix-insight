"use client";

import { useId, useState } from "react";
import type {
  CalendarOverlay,
  OperatingMode,
  OperatingWeekPoint,
} from "./operatingIntelligence";

const MODE_STYLE: Record<
  OperatingMode,
  { label: string; color: string; background: string }
> = {
  STANDARD: {
    label: "Standard",
    color: "#2563eb",
    background: "#dbeafe",
  },
  SUPPLEMENTAL: {
    label: "Supplemental",
    color: "#d97706",
    background: "#fef3c7",
  },
  HEAVY: {
    label: "Heavy",
    color: "#7c3aed",
    background: "#ede9fe",
  },
  EXCEPTIONAL: {
    label: "Exceptional",
    color: "#dc2626",
    background: "#fee2e2",
  },
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function ChartFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="app-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "18px 18px 0" }}>
        <p className="value-card__eyebrow">{eyebrow}</p>
        <h3 className="app-card__title" style={{ fontSize: 19 }}>
          {title}
        </h3>
        <p className="app-card__body" style={{ marginTop: 6 }}>
          {description}
        </p>
      </div>
      {children}
    </article>
  );
}

function WeeklyLineChart({
  weeks,
  metric,
  label,
  unit,
  overlays,
}: {
  weeks: OperatingWeekPoint[];
  metric: (week: OperatingWeekPoint) => number;
  label: string;
  unit: string;
  overlays: CalendarOverlay[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId().replaceAll(":", "");
  const width = 1100;
  const height = 340;
  const margin = { top: 28, right: 26, bottom: 54, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = weeks.map(metric);
  const maximum = Math.max(...values, 1);
  const yMax = Math.ceil(maximum * 1.12);
  const x = (index: number) =>
    margin.left +
    (weeks.length <= 1 ? plotWidth / 2 : (index / (weeks.length - 1)) * plotWidth);
  const y = (value: number) =>
    margin.top + plotHeight - (value / yMax) * plotHeight;
  const points = weeks
    .map((week, index) => `${x(index)},${y(metric(week))}`)
    .join(" ");
  const areaPoints = `${margin.left},${margin.top + plotHeight} ${points} ${x(
    weeks.length - 1
  )},${margin.top + plotHeight}`;
  const yTicks = Array.from({ length: 5 }, (_, index) =>
    Math.round((yMax / 4) * index)
  );
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 10));
  const activeWeek = activeIndex === null ? null : weeks[activeIndex];

  return (
    <div style={{ position: "relative", padding: "8px 12px 14px" }}>
      {activeWeek ? (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 20,
            zIndex: 2,
            minWidth: 190,
            padding: "10px 12px",
            border: "1px solid #dbe3ee",
            borderRadius: 12,
            background: "rgba(255, 255, 255, 0.96)",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.12)",
          }}
        >
          <strong style={{ display: "block", fontSize: 12 }}>
            {formatDate(activeWeek.weekStart)} – {formatDate(activeWeek.weekEnd)}
          </strong>
          <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#475569" }}>
            {label}: {formatNumber(metric(activeWeek), 1)} {unit}
          </span>
          <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "#64748b" }}>
            {activeWeek.operatingDays} operating days
          </span>
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label} by operating week`}
        style={{ width: "100%", minHeight: 270, display: "block" }}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {overlays.map((overlay) => {
          const matchingIndexes = weeks
            .map((week, index) =>
              week.weekEnd >= overlay.startDate && week.weekStart <= overlay.endDate
                ? index
                : -1
            )
            .filter((index) => index >= 0);

          if (matchingIndexes.length === 0) return null;

          const firstIndex = matchingIndexes[0];
          const lastIndex = matchingIndexes[matchingIndexes.length - 1];
          const step = weeks.length <= 1 ? plotWidth : plotWidth / (weeks.length - 1);
          const left = Math.max(margin.left, x(firstIndex) - step / 2);
          const right = Math.min(margin.left + plotWidth, x(lastIndex) + step / 2);

          return (
            <g key={overlay.key}>
              <rect
                x={left}
                y={margin.top}
                width={Math.max(0, right - left)}
                height={plotHeight}
                fill="#7c3aed"
                opacity="0.08"
              />
              <text
                x={(left + right) / 2}
                y={margin.top + 14}
                textAnchor="middle"
                fontSize="10"
                fontWeight="800"
                fill="#6d28d9"
              >
                Peak Season
              </text>
            </g>
          );
        })}

        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text
              x={margin.left - 12}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#64748b"
            >
              {formatNumber(tick)}
            </text>
          </g>
        ))}

        {weeks.length > 1 ? (
          <>
            <polygon points={areaPoints} fill={`url(#${gradientId})`} />
            <polyline
              points={points}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : null}

        {weeks.map((week, index) => {
          const value = metric(week);
          const selected = activeIndex === index;

          return (
            <g key={week.weekKey}>
              <rect
                x={x(index) - Math.max(5, plotWidth / Math.max(weeks.length, 1) / 2)}
                y={margin.top}
                width={Math.max(10, plotWidth / Math.max(weeks.length, 1))}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setActiveIndex(index)}
              />
              <circle
                cx={x(index)}
                cy={y(value)}
                r={selected ? 6 : 3.5}
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth={selected ? 3 : 2}
                pointerEvents="none"
              />
              {index % labelEvery === 0 || index === weeks.length - 1 ? (
                <text
                  x={x(index)}
                  y={height - 20}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#64748b"
                >
                  {week.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function WeeklyRouteTrend({
  weeks,
  overlays,
}: {
  weeks: OperatingWeekPoint[];
  overlays: CalendarOverlay[];
}) {
  return (
    <ChartFrame
      eyebrow="Contract-year trend"
      title="Weekly Route Trend"
      description="Average dispatched routes per operating day, grouped by Saturday–Friday operating week."
    >
      <WeeklyLineChart
        weeks={weeks}
        metric={(week) => week.averageRoutes}
        label="Average routes"
        unit="routes/day"
        overlays={overlays}
      />
    </ChartFrame>
  );
}

export function WeeklyStopVolume({
  weeks,
  overlays,
}: {
  weeks: OperatingWeekPoint[];
  overlays: CalendarOverlay[];
}) {
  return (
    <ChartFrame
      eyebrow="Operational density"
      title="Weekly Stop Volume"
      description="Total completed delivery and pickup stops represented in each FINAL operating week."
    >
      <WeeklyLineChart
        weeks={weeks}
        metric={(week) => week.totalStops}
        label="Completed stops"
        unit="stops"
        overlays={overlays}
      />
    </ChartFrame>
  );
}

export function WeeklyPackageVolume({
  weeks,
  overlays,
}: {
  weeks: OperatingWeekPoint[];
  overlays: CalendarOverlay[];
}) {
  return (
    <ChartFrame
      eyebrow="Workload and cube"
      title="Weekly Package Volume"
      description="Total completed delivery and pickup packages represented in each FINAL operating week."
    >
      <WeeklyLineChart
        weeks={weeks}
        metric={(week) => week.totalPackages}
        label="Completed packages"
        unit="packages"
        overlays={overlays}
      />
    </ChartFrame>
  );
}
