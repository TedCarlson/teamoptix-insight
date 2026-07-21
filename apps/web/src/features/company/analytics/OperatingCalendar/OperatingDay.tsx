import type { CalendarDay } from "./operatingCalendarModel";

export const DAY_TOKENS = ["S", "U", "M", "T", "W", "H", "F"] as const;

const MODE_LABEL = {
  standard: "Standard",
  heavy: "Heavy",
  supplemental: "Supplemental",
  exceptional: "Exceptional",
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function visualStyle(day: CalendarDay): React.CSSProperties {
  if (day.hasHistory && day.operatingMode === "supplemental") {
    return { background: "#2563eb", border: "1px solid #1d4ed8" };
  }

  if (day.hasHistory && day.operatingMode === "heavy") {
    return {
      background:
        "repeating-linear-gradient(135deg, #312e81 0, #312e81 4px, #4338ca 4px, #4338ca 8px)",
      border: "1px solid #312e81",
    };
  }

  if (day.hasHistory && day.operatingMode === "exceptional") {
    return { background: "transparent", border: "2px solid #dc2626" };
  }

  if (day.hasHistory) {
    return { background: "#64748b", border: "1px solid #475569" };
  }

  if (day.missingFinal) {
    return { background: "transparent", border: "2px dashed #f59e0b" };
  }

  return {
    background:
      "repeating-linear-gradient(135deg, #f1f5f9 0, #f1f5f9 4px, #e2e8f0 4px, #e2e8f0 8px)",
    border: "1px solid #e2e8f0",
  };
}

export function operatingDayLabel(day: CalendarDay): string {
  if (day.hasHistory && day.operatingMode) return MODE_LABEL[day.operatingMode];
  if (day.missingFinal) return "Missing FINAL";
  return "Non-operating";
}

export function OperatingDay({
  day,
  active,
  onActivate,
  onDeactivate,
}: {
  day: CalendarDay;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const label = operatingDayLabel(day);
  const tooltip = `${formatDate(day.date)}\n${label}\nRoutes: ${formatNumber(day.routes)}\nStops: ${formatNumber(day.stops)}\nPackages: ${formatNumber(day.packages)}`;

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip.replaceAll("\n", ", ")}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onMouseLeave={onDeactivate}
      onBlur={onDeactivate}
      style={{
        ...visualStyle(day),
        width: 26,
        height: 42,
        borderRadius: day.operatingMode === "exceptional" ? 5 : 4,
        boxShadow: active ? "0 0 0 3px rgba(37, 99, 235, 0.18)" : "none",
        opacity: active ? 1 : 0.92,
        cursor: "default",
        padding: 0,
      }}
    />
  );
}
