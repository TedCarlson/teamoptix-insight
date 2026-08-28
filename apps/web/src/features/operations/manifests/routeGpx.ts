export type RouteGpxPoint = {
  sequence_number: number;
  point_kind: "WPT" | "RTEPT" | "TRKPT";
  latitude: number;
  longitude: number;
  elevation_meters: number | null;
  observed_at: string | null;
  point_name: string | null;
  point_description: string | null;
  is_stop: boolean;
};

export type RouteGpxGeometry = {
  route_key: string;
  route_label: string | null;
  track_name: string | null;
  source_point_count: number;
  retained_point_count: number;
  stop_point_count: number;
  processed_at: string;
  points: RouteGpxPoint[];
};

const MAX_GPX_BYTES = 10_000_000;
const MAX_RETAINED_POINTS = 2_000;

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function xmlAttribute(attributes: string, name: string) {
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i")
  );
  return match ? decodeXmlText(match[2]) : null;
}

function xmlChildText(body: string, name: string) {
  const match = body.match(
    new RegExp(
      `<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>`,
      "i"
    )
  );
  return match ? decodeXmlText(match[1].replace(/<[^>]+>/g, " ")) : null;
}

function finiteCoordinate(value: string | null, minimum: number, maximum: number) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function downsamplePoints(points: RouteGpxPoint[]) {
  if (points.length <= MAX_RETAINED_POINTS) return points;
  const stops = points.filter((point) => point.is_stop);
  if (stops.length >= MAX_RETAINED_POINTS) {
    return stops.slice(0, MAX_RETAINED_POINTS).map((point, index) => ({
      ...point,
      sequence_number: index + 1,
    }));
  }

  const stopSequences = new Set(stops.map((point) => point.sequence_number));
  const path = points.filter((point) => !stopSequences.has(point.sequence_number));
  const remaining = MAX_RETAINED_POINTS - stops.length;
  const sampled = path.filter((_, index) =>
    index === 0 ||
    index === path.length - 1 ||
    Math.floor((index * remaining) / path.length) !==
      Math.floor(((index - 1) * remaining) / path.length)
  ).slice(0, remaining);

  return [...stops, ...sampled]
    .sort((left, right) => left.sequence_number - right.sequence_number)
    .map((point, index) => ({ ...point, sequence_number: index + 1 }));
}

export function parseRouteGpx(buffer: Buffer) {
  if (!buffer.length) throw new Error("Route GPX is empty.");
  if (buffer.length > MAX_GPX_BYTES) {
    throw new Error("Route GPX exceeds the 10 MB processing limit.");
  }
  const xml = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (!/<(?:[\w.-]+:)?gpx\b/i.test(xml)) {
    throw new Error("Route artifact is not a GPX document.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("Route GPX contains unsupported document declarations.");
  }

  const points: RouteGpxPoint[] = [];
  const pointPattern = /<(?:[\w.-]+:)?(wpt|rtept|trkpt)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?\1\s*>)/gi;
  let match: RegExpExecArray | null;
  while ((match = pointPattern.exec(xml))) {
    const pointKind = match[1].toUpperCase() as RouteGpxPoint["point_kind"];
    const latitude = finiteCoordinate(xmlAttribute(match[2], "lat"), -90, 90);
    const longitude = finiteCoordinate(xmlAttribute(match[2], "lon"), -180, 180);
    if (latitude === null || longitude === null) continue;
    const body = match[3] ?? "";
    const elevationText = xmlChildText(body, "ele");
    const elevation = elevationText === null ? null : Number(elevationText);
    const observedAt = xmlChildText(body, "time");
    const pointName = xmlChildText(body, "name");
    const pointDescription = xmlChildText(body, "desc");
    const stopSemantic = `${pointName ?? ""} ${pointDescription ?? ""}`;
    points.push({
      sequence_number: points.length + 1,
      point_kind: pointKind,
      latitude,
      longitude,
      elevation_meters:
        elevation !== null && Number.isFinite(elevation) ? elevation : null,
      observed_at:
        observedAt && Number.isFinite(Date.parse(observedAt))
          ? new Date(observedAt).toISOString()
          : null,
      point_name: pointName,
      point_description: pointDescription,
      is_stop:
        pointKind === "WPT" ||
        pointKind === "RTEPT" ||
        /\bstop\b|delivery|pickup/i.test(stopSemantic),
    });
  }

  if (!points.length) {
    throw new Error("Route GPX does not contain valid waypoint, route, or track coordinates.");
  }

  const trackBody = xml.match(
    /<(?:[\w.-]+:)?(?:trk|rte)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:trk|rte)\s*>/i
  )?.[1] ?? "";
  const retainedPoints = downsamplePoints(points);
  return {
    trackName: xmlChildText(trackBody, "name"),
    sourcePointCount: points.length,
    retainedPoints,
    stopPointCount: retainedPoints.filter((point) => point.is_stop).length,
  };
}

export type RouteGpxStopCluster = {
  cluster_key: string;
  latitude: number;
  longitude: number;
  stop_count: number;
  first_sequence: number;
  last_sequence: number;
  labels: string[];
};

export function clusterRouteGpxStops(points: RouteGpxPoint[]) {
  const clusters = new Map<string, RouteGpxStopCluster>();
  for (const point of points.filter((candidate) => candidate.is_stop)) {
    const key = `${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}`;
    const current = clusters.get(key);
    const label = point.point_name ?? point.point_description;
    if (!current) {
      clusters.set(key, {
        cluster_key: key,
        latitude: point.latitude,
        longitude: point.longitude,
        stop_count: 1,
        first_sequence: point.sequence_number,
        last_sequence: point.sequence_number,
        labels: label ? [label] : [],
      });
      continue;
    }
    const count = current.stop_count + 1;
    current.latitude =
      (current.latitude * current.stop_count + point.latitude) / count;
    current.longitude =
      (current.longitude * current.stop_count + point.longitude) / count;
    current.stop_count = count;
    current.last_sequence = point.sequence_number;
    if (label && !current.labels.includes(label) && current.labels.length < 3) {
      current.labels.push(label);
    }
  }
  return [...clusters.values()].sort(
    (left, right) => left.first_sequence - right.first_sequence
  );
}

export function routeKeyFromGpxText(value: unknown) {
  const match = String(value ?? "").match(/(?<!\d)0*(\d{1,4})(?!\d)/);
  return match?.[1] ?? null;
}

function selectedRouteKey(artifact: any) {
  return routeKeyFromGpxText(
    artifact.runner_artifact_json?.collection_context?.selected_work_area ??
      artifact.runner_artifact_json?.route_identity
  );
}

export function isRouteGpxCollectionArtifact(artifact: any) {
  return (
    String(artifact?.runner_artifact_json?.artifact_key ?? "").toUpperCase() ===
      "ROUTE_GPX" ||
    String(artifact?.report_shape_key ?? "").toUpperCase() === "FCC_ROUTE_GPX" ||
    String(artifact?.normalized_filename ?? "").toLowerCase().endsWith(".gpx")
  );
}

export type RouteGpxManifestReadiness =
  | { status: "READY"; manifest: any }
  | { status: "PENDING"; manifest: null }
  | { status: "INVALID"; manifest: null };

export function routeGpxManifestReadiness(
  siblings: any[],
  routeKey: string
): RouteGpxManifestReadiness {
  const manifests = siblings.filter((sibling: any) => {
    const key = String(
      sibling?.runner_artifact_json?.artifact_key ?? ""
    ).toUpperCase();
    return ["DELIVERY_MANIFEST", "PICKUP_MANIFEST"].includes(key);
  });
  const verifiedManifest = manifests.find((sibling: any) => {
    const status = String(sibling.artifact_status ?? "").toUpperCase();
    return (
      ["READY_FOR_INGEST", "INGESTING", "INGESTED", "IGNORED"].includes(status) &&
      sibling.runner_artifact_json?.identity_authority === "INGESTION_PIPELINE" &&
      String(sibling.runner_artifact_json?.route_key ?? "") === routeKey
    );
  });
  if (verifiedManifest) {
    return { status: "READY", manifest: verifiedManifest };
  }
  const manifestStillProcessing = manifests.some((sibling: any) =>
    ["ARTIFACTS_READY", "READY_FOR_INGEST", "INGESTING"].includes(
      String(sibling.artifact_status ?? "").toUpperCase()
    )
  );
  return manifestStillProcessing
    ? { status: "PENDING", manifest: null }
    : { status: "INVALID", manifest: null };
}

export async function resolveRouteGpxManifestReadiness(params: {
  supabase: any;
  artifact: any;
  routeKey?: string;
}) {
  const routeKey = params.routeKey ?? selectedRouteKey(params.artifact);
  if (!routeKey) {
    return { status: "INVALID", manifest: null } as const;
  }
  const { data: routeDayManifests, error } = await params.supabase
    .from("operations_collection_artifact_v")
    .select("runner_artifact_json,artifact_status,service_date")
    .eq("company_id", params.artifact.company_id)
    .eq("service_date", params.artifact.service_date);
  if (error) throw new Error(error.message);
  return routeGpxManifestReadiness(routeDayManifests ?? [], routeKey);
}

export async function ingestRouteGpxArtifact(params: {
  supabase: any;
  artifact: any;
  buffer?: Buffer;
  verifiedManifest?: any;
}) {
  const { supabase, artifact } = params;
  const routeKey = selectedRouteKey(artifact);
  if (!routeKey) {
    throw new Error("Route GPX is missing its manifest-search route context.");
  }

  let verifiedManifest = params.verifiedManifest;
  if (!verifiedManifest) {
    const readiness = await resolveRouteGpxManifestReadiness({
      supabase,
      artifact,
      routeKey,
    });
    verifiedManifest = readiness.status === "READY"
      ? readiness.manifest
      : null;
  }
  if (!verifiedManifest) {
    throw new Error(
      "Route GPX requires a workbook-verified manifest for the same company, route, and service date."
    );
  }

  let buffer = params.buffer;
  if (!buffer) {
    const { data: blob, error } = await supabase.storage
      .from(artifact.storage_bucket)
      .download(artifact.storage_path);
    if (error || !blob) {
      throw new Error(error?.message ?? "Route GPX artifact was not readable.");
    }
    buffer = Buffer.from(await blob.arrayBuffer());
  }
  const parsed = parseRouteGpx(buffer);
  const documentRouteKey = routeKeyFromGpxText(parsed.trackName);
  if (documentRouteKey && documentRouteKey !== routeKey) {
    throw new Error(
      `Route GPX identity mismatch: manifest route ${routeKey}, GPX route ${documentRouteKey}.`
    );
  }
  const routeLabel =
    verifiedManifest.runner_artifact_json?.route_label ??
    verifiedManifest.runner_artifact_json?.header_work_area ??
    `WA ${routeKey}`;
  const { data, error } = await supabase.rpc(
    "replace_operations_route_gpx_points",
    {
      p_collection_artifact_id: artifact.id,
      p_route_key: routeKey,
      p_route_label: routeLabel,
      p_track_name: parsed.trackName,
      p_source_point_count: parsed.sourcePointCount,
      p_points: parsed.retainedPoints,
      p_metadata_json: {
        source: "route_gpx_parser",
        identity_authority: "ROUTE_DAY_MANIFEST_WORKBOOK",
        parsed_at: new Date().toISOString(),
      },
    }
  );
  if (error) throw new Error(error.message);
  return data;
}
