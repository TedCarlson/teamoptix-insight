import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import shapefile from "shapefile";

const execFileAsync = promisify(execFile);
const sourceVintage = 2020;
const sourceScale = "500k";
const sourceUrl = "https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip";
const maximumFetchAttempts = 4;
const batchSize = 10;
const dryRun = process.argv.slice(2).includes("--dry-run");
const requestedCodes = new Set([
  ...argumentsFor("zcta"),
  ...argumentsFor("zctas").flatMap((value) => value.split(",")),
].map((value) => value.trim()).filter(Boolean));

if (!requestedCodes.size || [...requestedCodes].some((code) => !/^\d{5}$/.test(code))) {
  throw new Error("Provide one or more five-digit boundaries as --zcta=29801 or --zctas=29801,29803.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

function argumentsFor(name) {
  return process.argv
    .slice(2)
    .filter((value) => value.startsWith(`--${name}=`))
    .map((value) => value.split("=").slice(1).join("="));
}

async function fetchWithRetry(url, options) {
  let lastError;
  for (let attempt = 1; attempt <= maximumFetchAttempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      lastError = new Error(`Transient HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < maximumFetchAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError ?? new Error(`Request failed for ${url}`);
}

async function rpc(name, body) {
  const response = await fetchWithRetry(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

async function readRequestedBoundaries(directory) {
  const files = await readdir(directory);
  const shp = files.find((file) => file.endsWith("_zcta520_500k.shp"));
  const dbf = files.find((file) => file.endsWith("_zcta520_500k.dbf"));
  if (!shp || !dbf) throw new Error("The Census ZCTA archive did not contain its SHP and DBF pair.");

  const source = await shapefile.open(join(directory, shp), join(directory, dbf), {
    encoding: "utf-8",
  });
  const boundaries = new Map();
  while (true) {
    const item = await source.read();
    if (item.done) break;
    const feature = item.value;
    const properties = feature.properties ?? {};
    const zctaCode = String(properties.ZCTA5CE20 ?? properties.GEOID20 ?? "").trim();
    if (!requestedCodes.has(zctaCode)) continue;
    if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) continue;
    boundaries.set(zctaCode, { zcta_code: zctaCode, geometry: feature.geometry });
  }
  return [...boundaries.values()].sort((left, right) => left.zcta_code.localeCompare(right.zcta_code));
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "teamoptix-zcta-"));
const archivePath = join(temporaryDirectory, "zcta.zip");
let packId = null;

try {
  process.stdout.write(`Downloading Census ZCTA boundaries for ${requestedCodes.size} requested codes...\n`);
  const response = await fetchWithRetry(sourceUrl, {
    headers: { "user-agent": "TeamOptix-Insight internal public-geography importer" },
  });
  if (!response.ok) throw new Error(`Census download failed (${response.status}) for ${sourceUrl}`);
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  await execFileAsync("unzip", ["-oq", archivePath, "-d", temporaryDirectory]);
  const boundaries = await readRequestedBoundaries(temporaryDirectory);
  const missing = [...requestedCodes].filter(
    (code) => !boundaries.some((boundary) => boundary.zcta_code === code),
  );
  if (!boundaries.length) throw new Error("No requested Census ZCTA boundaries were found.");
  if (missing.length) {
    process.stdout.write(`No Census ZCTA polygon exists for postal ZIPs: ${missing.join(", ")}.\n`);
  }

  if (dryRun) {
    process.stdout.write(`Validated ${boundaries.length} Census ZCTA boundaries; no warehouse changes were made.\n`);
  } else {
    packId = await rpc("begin_internal_map_zcta_pack", {
      p_source_vintage: sourceVintage,
      p_source_scale: sourceScale,
      p_source_url: sourceUrl,
      p_requested_codes: [...requestedCodes].sort(),
    });
    for (let offset = 0; offset < boundaries.length; offset += batchSize) {
      await rpc("append_internal_map_zcta_boundaries", {
        p_pack_id: packId,
        p_rows: boundaries.slice(offset, offset + batchSize),
      });
      process.stdout.write(`Imported ${Math.min(offset + batchSize, boundaries.length)}/${boundaries.length} ZCTA boundaries\r`);
    }
    await rpc("complete_internal_map_zcta_pack", {
      p_pack_id: packId,
      p_expected_feature_count: boundaries.length,
    });
    process.stdout.write(`Imported ${boundaries.length} Census ZCTA boundaries.             \n`);
  }
} catch (error) {
  if (packId) await rpc("abort_internal_map_zcta_pack", { p_pack_id: packId }).catch(() => undefined);
  throw error;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
