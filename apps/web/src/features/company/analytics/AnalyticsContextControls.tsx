"use client";

import { useAnalyticsData } from "./AnalyticsDataProvider";
import type {
  AnalyticsComparisonMode,
  AnalyticsRangePreset,
} from "./analyticsContext";
import styles from "./analytics-controls.module.css";

const PRESET_LABELS: Record<AnalyticsRangePreset, string> = {
  calendar_year: "Calendar year",
  q1: "Q1 · Jan–Mar",
  q2: "Q2 · Apr–Jun",
  q3: "Q3 · Jul–Sep",
  q4: "Q4 · Oct–Dec",
  last_30_days: "Previous 30 days",
  last_60_days: "Previous 60 days",
  last_90_days: "Previous 90 days",
};

const COMPARISON_LABELS: Record<
  AnalyticsComparisonMode,
  string
> = {
  none: "No comparison",
  previous_period: "Previous period",
  prior_year: "Prior year",
};

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function contractLabel({
  contract_number,
  terminal_identity,
  service_area,
}: {
  contract_number: string | null;
  terminal_identity: string | null;
  service_area: string | null;
}) {
  return [
    contract_number ?? "Unnumbered contract",
    terminal_identity,
    service_area,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function AnalyticsContextControls() {
  const {
    selectedYear,
    selectedPreset,
    selectedContractId,
    comparisonMode,
    contractOptions,
    yearOptions,
    payload,
    comparisonPayload,
    yearsLoading,
    payloadLoading,
    comparisonLoading,
    error,
    comparisonError,
    selectYear,
    selectPreset,
    selectContract,
    selectComparisonMode,
  } = useAnalyticsData();
  const metadata = payload?.metadata ?? null;
  const contractIsAutomatic = contractOptions.length === 1;
  const automaticContract = contractIsAutomatic
    ? contractOptions[0]
    : null;

  return (
    <div className="workspace-shell" style={{ paddingBottom: 0 }}>
      <section
        className="workspace-main"
        style={{ paddingTop: 12, paddingBottom: 0 }}
      >
        <article className={`app-card ${styles.contextCard}`}>
          <div className={styles.contextHeader}>
            <div className={styles.contextHeading}>
              <p className="value-card__eyebrow">Analytics context</p>
              <h2 className="app-card__title">Choose the operating slice</h2>
            </div>

            <div className={styles.controlGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Calendar year</span>
                <span className={styles.selectShell}>
                  <select
                    aria-label="Calendar year"
                    className={styles.select}
                    disabled={yearsLoading || payloadLoading}
                    value={selectedYear ?? ""}
                    onChange={(event) => selectYear(Number(event.target.value))}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </span>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Range</span>
                <span className={styles.selectShell}>
                  <select
                    aria-label="Analytics range"
                    className={styles.select}
                    disabled={payloadLoading}
                    value={selectedPreset}
                    onChange={(event) =>
                      selectPreset(event.target.value as AnalyticsRangePreset)
                    }
                  >
                    {Object.entries(PRESET_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>

              {automaticContract ? (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Viewing contract</span>
                  <div
                    aria-label={`Viewing contract: ${contractLabel(automaticContract)}, locked`}
                    className={styles.lockValue}
                    role="status"
                    title={contractLabel(automaticContract)}
                  >
                    <span aria-hidden="true" className={styles.lockDot} />
                    <span className={styles.lockText}>
                      {contractLabel(automaticContract)}
                    </span>
                    <span className={styles.lockBadge}>Locked</span>
                  </div>
                </div>
              ) : (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Viewing contract</span>
                  <span className={styles.selectShell}>
                    <select
                      aria-label="Viewing contract"
                      className={styles.select}
                      disabled={payloadLoading || contractOptions.length === 0}
                      value={selectedContractId ?? ""}
                      onChange={(event) =>
                        selectContract(event.target.value || null)
                      }
                    >
                      {contractOptions.length > 1 ? (
                        <option value="">All attributed contracts</option>
                      ) : null}
                      {contractOptions.map((contract) => (
                        <option
                          key={contract.contract_id}
                          value={contract.contract_id}
                        >
                          {contractLabel(contract)}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              )}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Compare</span>
                <span className={styles.selectShell}>
                  <select
                    aria-label="Analytics comparison"
                    className={styles.select}
                    disabled={payloadLoading || comparisonLoading}
                    value={comparisonMode}
                    onChange={(event) =>
                      selectComparisonMode(
                        event.target.value as AnalyticsComparisonMode
                      )
                    }
                  >
                    {Object.entries(COMPARISON_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            </div>
          </div>

          <div aria-live="polite" className={styles.statusRail}>
            {payloadLoading || yearsLoading ? (
              <span className={styles.statusChip}>Preparing the selected operating slice…</span>
            ) : error ? (
              <span className={styles.statusChip} data-tone="error">{error}</span>
            ) : metadata ? (
              <>
                <span className={styles.statusChip} data-tone="brand">
                  {displayDate(metadata.start_date)}–{displayDate(metadata.end_date)}
                </span>
                <span className={styles.statusChip}>
                  {metadata.finalized_operating_day_count} operating days
                </span>
                <span className={styles.statusChip} data-tone="good">
                  {selectedContractId ? "Contract locked" : "All attributed contracts"}
                </span>
                {comparisonMode !== "none" ? (
                  <span
                    className={styles.statusChip}
                    data-tone={comparisonPayload ? "brand" : undefined}
                  >
                    {comparisonLoading
                      ? "Loading comparison sequentially…"
                      : comparisonPayload
                        ? `${comparisonPayload.metadata.finalized_operating_day_count} comparison days ready`
                        : comparisonError ?? "Comparison unavailable"}
                  </span>
                ) : null}
              </>
            ) : (
              <span className={styles.statusChip}>Select a calendar range to begin.</span>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
