import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import shapefile from "shapefile";

const execFileAsync = promisify(execFile);
const vintage = Number(argument("vintage") ?? "2025");
const packArguments = argumentsFor("pack");
const batchSize = 250;
const dryRun = process.argv.slice(2).includes("--dry-run");
const maximumFetchAttempts = 4;

if (!Number.isInteger(vintage) || vintage < 2020 || vintage > 2100) {
  throw new Error("--vintage must be a four-digit TIGER vintage.");
}
if (!packArguments.length) {
  throw new Error("Provide one or more broad territory packs as --pack=SS:CCC.");
}

const packs = packArguments.map((value) => {
  const match = value.match(/^(\d{2}):(\d{3})$/);
  if (!match) throw new Error(`Invalid pack ${value}; expected SS:CCC.`);
  return { stateFips: match[1], countyFips: match[2] };
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

function argument(name) {
  return process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

function argumentsFor(name) {
  return process.argv
    .slice(2)
    .filter((value) => value.startsWith(`--${name}=`))
    .map((value) => value.split("=").slice(1).join("="));
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
  if (!response.ok) {
    throw new Error(`${name} failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function download(url, destination) {
  const response = await fetchWithRetry(url, {
    headers: { "user-agent": "TeamOptix-Insight internal public-road importer" },
  });
  if (!response.ok) throw new Error(`Census download failed (${response.status}) for ${url}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function fetchWithRetry(url, options) {
  let lastError;
  for (let attempt = 1; attempt <= maximumFetchAttempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || (response.status !== 429 && response.status < 500)) {
        return response;
      }
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

async function readRoads(directory) {
  const files = await readdir(directory);
  const shp = files.find((file) => file.endsWith("_roads.shp"));
  const dbf = files.find((file) => file.endsWith("_roads.dbf"));
  if (!shp || !dbf) throw new Error("The Census road archive did not contain its SHP and DBF pair.");

  const source = await shapefile.open(join(directory, shp), join(directory, dbf), {
    encoding: "utf-8",
  });
  const roads = new Map();
  while (true) {
    const item = await source.read();
    if (item.done) break;
    const feature = item.value;
    const properties = feature.properties ?? {};
    const geometry = feature.geometry;
    const linearId = String(properties.LINEARID ?? properties.TLID ?? "").trim();
    const mtfcc = String(properties.MTFCC ?? "").trim().toUpperCase();
    if (!linearId || !/^S\d{4}$/.test(mtfcc)) continue;
    if (!geometry || !["LineString", "MultiLineString"].includes(geometry.type)) continue;
    roads.set(linearId, {
      linear_id: linearId,
      full_name: String(properties.FULLNAME ?? "").trim() || null,
      mtfcc,
      geometry,
    });
  }
  return [...roads.values()];
}

async function importPack({ stateFips, countyFips }) {
  const combinedFips = `${stateFips}${countyFips}`;
  const sourceUrl = `https://www2.census.gov/geo/tiger/TIGER${vintage}/ROADS/tl_${vintage}_${combinedFips}_roads.zip`;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `teamoptix-roads-${combinedFips}-`));
  const archivePath = join(temporaryDirectory, `${combinedFips}.zip`);
  let packId = null;

  try {
    process.stdout.write(`Downloading broad road pack ${combinedFips}...\n`);
    await download(sourceUrl, archivePath);
    await execFileAsync("unzip", ["-oq", archivePath, "-d", temporaryDirectory]);
    const roads = await readRoads(temporaryDirectory);
    if (dryRun) {
      process.stdout.write(`Validated ${roads.length} public roads for ${combinedFips}; no warehouse changes were made.\n`);
      return;
    }
    packId = await rpc("begin_internal_map_road_pack", {
      p_source_vintage: vintage,
      p_state_fips: stateFips,
      p_county_fips: countyFips,
      p_source_url: sourceUrl,
    });

    for (let offset = 0; offset < roads.length; offset += batchSize) {
      await rpc("append_internal_map_road_segments", {
        p_pack_id: packId,
        p_rows: roads.slice(offset, offset + batchSize),
      });
      process.stdout.write(`Imported ${Math.min(offset + batchSize, roads.length)}/${roads.length} roads for ${combinedFips}\r`);
    }
    await rpc("complete_internal_map_road_pack", {
      p_pack_id: packId,
      p_expected_feature_count: roads.length,
    });
    process.stdout.write(`Imported ${roads.length} public roads for ${combinedFips}.             \n`);
  } catch (error) {
    if (packId) {
      await rpc("abort_internal_map_road_pack", { p_pack_id: packId }).catch(() => undefined);
    }
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

for (const pack of packs) {
  await importPack(pack);
}
