import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function configuration() {
  const endpoint = process.env.B2_S3_ENDPOINT;
  const region = process.env.B2_S3_REGION;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_FLEET_EVIDENCE_BUCKET;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Fleet inspection evidence storage is not configured.");
  }
  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
}

function client() {
  const config = configuration();
  return {
    bucket: config.bucket,
    s3: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

export async function storeFleetInspectionEvidence(input: {
  body: Buffer;
  key: string;
  sha256: string;
}) {
  const { bucket, s3 } = client();
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: input.body,
    ContentType: "image/webp",
    Metadata: { sha256: input.sha256 },
  }));
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: input.key }));
  if (Number(head.ContentLength ?? -1) !== input.body.length || head.Metadata?.sha256 !== input.sha256) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: input.key }));
    throw new Error("Fleet inspection evidence verification failed.");
  }
  return { bucket, etag: head.ETag ?? null, key: input.key };
}

export async function removeFleetInspectionEvidence(key: string) {
  const { bucket, s3 } = client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
