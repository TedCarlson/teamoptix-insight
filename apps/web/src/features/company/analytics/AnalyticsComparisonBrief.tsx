import type { AnalyticsComparisonBrief as ComparisonBrief } from "./analyticsComparison";
import type { OperationsHistoryMetadata } from "./operationsHistory.types";
import styles from "./analytics-comparison.module.css";

function date(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function range(metadata: OperationsHistoryMetadata | null): string {
  if (!metadata) return "—";
  return `${date(metadata.start_date)}–${date(metadata.end_date)}`;
}

function periodLabel(metadata: OperationsHistoryMetadata | null): string {
  if (!metadata) return "Selected range";
  const year = metadata.calendar_year;
  if (/^q[1-4]$/.test(metadata.preset)) {
    return `${metadata.preset.toUpperCase()} ${year}`;
  }
  if (metadata.preset === "calendar_year") {
    return `${year} year to date`;
  }
  const days = metadata.preset.match(/\d+/)?.[0] ?? "selected";
  return `Previous ${days} days`;
}

function comparisonPeriodLabel(
  primary: OperationsHistoryMetadata | null,
  comparison: OperationsHistoryMetadata | null
): string {
  if (!primary || !comparison) return "comparison period";
  const comparisonYear = Number(comparison.start_date.slice(0, 4));

  if (primary.comparison_mode === "prior_year") {
    return `${comparisonYear} matched dates`;
  }

  if (/^q[1-4]$/.test(primary.preset)) {
    const month = Number(comparison.start_date.slice(5, 7));
    return `Q${Math.floor((month - 1) / 3) + 1} ${comparisonYear}`;
  }

  if (primary.preset === "calendar_year") {
    return `available ${comparisonYear} period`;
  }

  const days = primary.preset.match(/\d+/)?.[0] ?? "selected";
  return `preceding ${days} days`;
}

function number(value: number | null, format: string): string {
  if (value === null) return "—";
  if (format === "percent") return `${value.toFixed(2)}%`;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: format === "decimal" ? 1 : 0,
  }).format(value);
}

function delta(value: number | null, points: boolean): string {
  if (value === null) return "—";
  if (Math.abs(value) < 0.05) return "→ flat";
  return `${value > 0 ? "↑" : "↓"} ${Math.abs(value).toFixed(1)}${points ? " pts" : "%"}`;
}

export default function AnalyticsComparisonBrief({
  brief,
  primaryMetadata,
  comparisonMetadata,
  loading,
  error,
}: {
  brief: ComparisonBrief | null;
  primaryMetadata: OperationsHistoryMetadata | null;
  comparisonMetadata: OperationsHistoryMetadata | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <article className={`app-card ${styles.card}`}>
        <div className={styles.state}>
          <strong>Building the period comparison…</strong>
          <span>The selected range is ready. Its comparison is loading second to protect the operating payload.</span>
        </div>
      </article>
    );
  }

  if (error || !brief || !comparisonMetadata) {
    return (
      <article className={`app-card ${styles.card}`}>
        <div className={styles.state} data-error={Boolean(error)}>
          <strong>{error ? "Comparison unavailable" : "No comparable operating history"}</strong>
          <span>{error ?? "The selected comparison did not return enough operating history to build a reliable reading."}</span>
        </div>
      </article>
    );
  }

  return (
    <article className={`app-card ${styles.card}`}>
      <header className={styles.header}>
        <div>
          <p className="value-card__eyebrow">Period comparison</p>
          <h2 className={`app-card__title ${styles.title}`}>
            {periodLabel(primaryMetadata)} vs {comparisonPeriodLabel(primaryMetadata, comparisonMetadata)}
          </h2>
          <p className={styles.range}>
            Current {range(primaryMetadata)} · Comparison {range(comparisonMetadata)}
          </p>
        </div>
        <div className={styles.coverage} data-coverage={brief.coverage}>
          <strong>{brief.coverageLabel}</strong>
          <span>
            {brief.currentOperatingDays} current · {brief.comparisonOperatingDays} comparison operating days
          </span>
        </div>
      </header>

      <div className={styles.metrics}>
        {brief.metrics.map((metric) => (
          <section className={styles.metric} key={metric.key}>
            <span className={styles.metricLabel}>{metric.label}</span>
            <div className={styles.metricValue}>
              <strong>{number(metric.current, metric.format)}</strong>
              <span className={styles.delta} data-tone={metric.tone}>
                {delta(metric.delta, metric.key === "ils")}
              </span>
            </div>
            <span className={styles.baseline}>
              Comparison {number(metric.comparison, metric.format)}
            </span>
          </section>
        ))}
      </div>

      <div className={styles.reading}>
        <strong>{brief.headline}</strong>
        <p>{brief.reading}</p>
      </div>
    </article>
  );
}
