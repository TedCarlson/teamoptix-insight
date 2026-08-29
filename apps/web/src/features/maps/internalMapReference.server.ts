import "server-only";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { InternalMapReferencePack } from "./internalMapReference";

let configuredClient: { bucket: string; s3: S3Client } | null = null;

function client() {
  if (configuredClient) return configuredClient;
  const endpoint = process.env.B2_S3_ENDPOINT;
  const configuredRegion = process.env.B2_S3_REGION;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_MAP_REFERENCE_BUCKET || process.env.B2_FLEET_EVIDENCE_BUCKET;
  if (!endpoint || !configuredRegion || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Private map-reference object storage is not configured.");
  }
  const region = configuredRegion
    .replace(/^https?:\/\//, "")
    .replace(/^s3\./, "")
    .replace(/\.backblazeb2\.com\/?$/, "");
  configuredClient = {
    bucket,
    s3: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return configuredClient;
}

export async function readInternalMapArchiveRange(
  pack: InternalMapReferencePack,
  range: { start: number; end: number; length: number },
) {
  const { bucket, s3 } = client();
  const response = await s3.send(new GetObjectCommand({
    Bucket: bucket,
    Key: pack.storage_key,
    Range: `bytes=${range.start}-${range.end}`,
  }));
  if (!response.Body) throw new Error("Regional map archive returned no data.");
  const bytes = await response.Body.transformToByteArray();
  if (bytes.byteLength !== range.length) {
    throw new Error("Regional map archive returned an incomplete byte range.");
  }
  return bytes;
}

