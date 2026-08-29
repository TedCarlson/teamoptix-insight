export type ManifestCollectionArtifact = {
  created_at: string;
  ingest_completed_at?: string | null;
  runner_artifact_json?: Record<string, unknown> | null;
  ingest_metadata_json?: Record<string, unknown> | null;
};

export type ManifestCollectionInterval = {
  captured_at: string;
  completed_stops: number;
  total_stops: number;
  completed_since_prior: number | null;
  minutes_since_prior: number | null;
  stops_per_hour: number | null;
};

export type ManifestCollectionReceipt = {
  captured_at: string;
  completed_stops: number | null;
  total_stops: number | null;
};

export type ManifestCollectionPace = {
  capture_count: number;
  measured_capture_count: number;
  first_capture_at: string | null;
  last_capture_at: string | null;
  median_cadence_minutes: number | null;
  receipts: ManifestCollectionReceipt[];
  intervals: ManifestCollectionInterval[];
};

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function capturedAt(artifact: ManifestCollectionArtifact) {
  const runner = objectValue(artifact.runner_artifact_json);
  const candidate = String(
    runner.downloaded_at ?? runner.captured_at ?? artifact.ingest_completed_at ?? artifact.created_at
  ).trim();
  return Number.isNaN(Date.parse(candidate)) ? artifact.created_at : candidate;
}

export function isManifestStopCompleted(value: unknown) {
  return ["Y", "YES", "TRUE", "COMPLETE", "COMPLETED", "CLOSED"].includes(
    String(value ?? "").trim().toUpperCase()
  );
}

export function summarizeManifestStops(
  stops: Array<{ completed?: unknown }>
) {
  const completedStopCount = stops.filter((stop) =>
    isManifestStopCompleted(stop.completed)
  ).length;
  return {
    total_stop_count: stops.length,
    completed_stop_count: completedStopCount,
    open_stop_count: Math.max(0, stops.length - completedStopCount),
  };
}

export function buildManifestCollectionPace(
  artifacts: ManifestCollectionArtifact[]
): ManifestCollectionPace {
  const receipts = artifacts
    .map((artifact) => {
      const metadata = objectValue(artifact.ingest_metadata_json);
      const ingest = objectValue(metadata.ingest);
      const completedStops = finiteNumber(ingest.completed_stop_count);
      const totalStops = finiteNumber(ingest.inserted_stop_count);
      return {
        captured_at: capturedAt(artifact),
        completed_stops: completedStops,
        total_stops: totalStops,
      };
    })
    .sort((left, right) => left.captured_at.localeCompare(right.captured_at));

  const captures = receipts.filter(
    (receipt): receipt is ManifestCollectionReceipt & {
      completed_stops: number;
      total_stops: number;
    } => receipt.completed_stops !== null && receipt.total_stops !== null
  );

  const intervals = captures.map<ManifestCollectionInterval>((capture, index) => {
    const prior = captures[index - 1];
    if (!prior) {
      return {
        ...capture,
        completed_since_prior: null,
        minutes_since_prior: null,
        stops_per_hour: null,
      };
    }
    const elapsedMinutes = Math.max(
      0,
      (Date.parse(capture.captured_at) - Date.parse(prior.captured_at)) / 60_000
    );
    const completedSincePrior = Math.max(
      0,
      capture.completed_stops - prior.completed_stops
    );
    return {
      ...capture,
      completed_since_prior: completedSincePrior,
      minutes_since_prior: Math.round(elapsedMinutes * 10) / 10,
      stops_per_hour:
        elapsedMinutes > 0
          ? Math.round((completedSincePrior / elapsedMinutes) * 600) / 10
          : null,
    };
  });

  const cadenceMinutes = receipts
    .slice(1)
    .map((receipt, index) =>
      Math.max(
        0,
        (Date.parse(receipt.captured_at) - Date.parse(receipts[index].captured_at)) /
          60_000
      )
    )
    .sort((left, right) => left - right);
  const cadenceMiddle = Math.floor(cadenceMinutes.length / 2);
  const medianCadence = cadenceMinutes.length === 0
    ? null
    : cadenceMinutes.length % 2 === 1
      ? cadenceMinutes[cadenceMiddle]
      : (cadenceMinutes[cadenceMiddle - 1] + cadenceMinutes[cadenceMiddle]) / 2;

  return {
    capture_count: artifacts.length,
    measured_capture_count: captures.length,
    first_capture_at: receipts[0]?.captured_at ?? null,
    last_capture_at: receipts.at(-1)?.captured_at ?? null,
    median_cadence_minutes:
      medianCadence === null ? null : Math.round(medianCadence * 10) / 10,
    receipts,
    intervals,
  };
}

export function manifestCollectionPaceFromDayFact(
  value: unknown
): ManifestCollectionPace | null {
  const summary = objectValue(value);
  const captureCount = finiteNumber(summary.capture_count);
  const measuredCaptureCount = finiteNumber(summary.measured_capture_count);
  if (captureCount === null || measuredCaptureCount === null) return null;
  const sourceIntervals = Array.isArray(summary.intervals)
    ? summary.intervals
    : [];
  const intervals = sourceIntervals.flatMap((value) => {
    const interval = objectValue(value);
    const completedStops = finiteNumber(interval.completed_stops);
    const totalStops = finiteNumber(interval.total_stops);
    const captured = String(interval.captured_at ?? "").trim();
    if (
      completedStops === null ||
      totalStops === null ||
      !captured ||
      Number.isNaN(Date.parse(captured))
    ) {
      return [];
    }
    return [{
      captured_at: captured,
      completed_stops: completedStops,
      total_stops: totalStops,
      completed_since_prior: finiteNumber(interval.completed_since_prior),
      minutes_since_prior: finiteNumber(interval.minutes_since_prior),
      stops_per_hour: finiteNumber(interval.stops_per_hour),
    } satisfies ManifestCollectionInterval];
  });
  const firstCaptureAt = String(summary.first_capture_at ?? "").trim();
  const lastCaptureAt = String(summary.last_capture_at ?? "").trim();
  return {
    capture_count: captureCount,
    measured_capture_count: measuredCaptureCount,
    first_capture_at: firstCaptureAt || null,
    last_capture_at: lastCaptureAt || null,
    median_cadence_minutes: finiteNumber(summary.median_cadence_minutes),
    receipts: [],
    intervals,
  };
}
