import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

const filePath = argument("file");
const storageKey = argument("key");

if (!filePath || !storageKey) {
  throw new Error("Provide --file=/absolute/path/archive.pmtiles and --key=storage/object.pmtiles.");
}
if (!storageKey.endsWith(".pmtiles") || storageKey.startsWith("/") || storageKey.includes("..")) {
  throw new Error("--key must be a relative .pmtiles object key without parent traversal.");
}

const endpoint = process.env.B2_S3_ENDPOINT;
const configuredRegion = process.env.B2_S3_REGION;
const accessKeyId = process.env.B2_KEY_ID;
const secretAccessKey = process.env.B2_APPLICATION_KEY;
const bucket = process.env.B2_MAP_REFERENCE_BUCKET || process.env.B2_FLEET_EVIDENCE_BUCKET;

if (!endpoint || !configuredRegion || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error("Private map-reference object storage is not configured.");
}

const file = await stat(filePath);
if (!file.isFile() || file.size <= 0) throw new Error("The PMTiles archive is missing or empty.");

const checksum = createHash("sha256");
for await (const chunk of createReadStream(filePath)) checksum.update(chunk);
const sha256 = checksum.digest("hex");
const region = configuredRegion
  .replace(/^https?:\/\//, "")
  .replace(/^s3\./, "")
  .replace(/\.backblazeb2\.com\/?$/, "");
const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

try {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    Body: createReadStream(filePath),
    ContentLength: file.size,
    ContentType: "application/vnd.pmtiles",
    CacheControl: "private, max-age=604800, immutable",
    Metadata: { sha256 },
  }));
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
  if (Number(head.ContentLength ?? -1) !== file.size || head.Metadata?.sha256 !== sha256) {
    throw new Error("Uploaded regional map archive failed length or checksum-metadata verification.");
  }
} catch (error) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey })).catch(() => undefined);
  throw error;
}

process.stdout.write(JSON.stringify({ bucket, storage_key: storageKey, byte_length: file.size, sha256 }) + "\n");

function argument(name) {
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}
