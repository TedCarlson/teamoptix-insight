import { DAY_TOKENS, OperatingDay } from "./OperatingDay";
import type { CalendarDay, CalendarWeek } from "./operatingCalendarModel";

export function OperatingWeek({
  week,
  activeDate,
  onActivate,
  onDeactivate,
}: {
  week: CalendarWeek;
  activeDate: string | null;
  onActivate: (day: CalendarDay) => void;
  onDeactivate: () => void;
}) {
  return (
    <section
      aria-label={`Week ${week.label}`}
      style={{
        flex: "0 0 auto",
        scrollSnapAlign: "start",
        width: 244,
        padding: 12,
        border: "1px solid #dbe3ee",
        borderRadius: 12,
        background: week.peakSeason ? "rgba(245, 158, 11, 0.08)" : "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <strong style={{ color: "#334155", fontSize: 12 }}>Week {week.label}</strong>
        {week.peakSeason ? (
          <span style={{ color: "#a16207", fontSize: 9, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Peak
          </span>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 26px)", gap: 6 }}>
        {DAY_TOKENS.map((token, index) => (
          <span
            key={`${week.key}-${token}-${index}`}
            aria-hidden="true"
            style={{ textAlign: "center", color: "#64748b", fontSize: 10, fontWeight: 900 }}
          >
            {token}
          </span>
        ))}
        {week.days.map((day) => (
          <OperatingDay
            key={day.date}
            day={day}
            active={activeDate === day.date}
            onActivate={() => onActivate(day)}
            onDeactivate={onDeactivate}
          />
        ))}
      </div>
    </section>
  );
}
