import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const ARTIFACT_BUCKET = "automation-artifacts";

function sanitize(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export async function uploadAutomationArtifact(input: {
  savedPath: string;
  suggestedFilename: string;
  reportType: "DSW" | "FCC";
  companyId: string;
  runId: string;
  serviceDate?: string;
}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const buffer = await readFile(input.savedPath);
  const fileStat = await stat(input.savedPath);

  const hash = createHash("sha256")
    .update(buffer)
    .digest("hex");

  const serviceDate =
    input.serviceDate ??
    new Date().toISOString().slice(0, 10);

  const artifactPath = [
    "company",
    input.companyId,
    "service-date",
    serviceDate,
    "run",
    input.runId,
    `${input.reportType.toLowerCase()}-${Date.now()}-${sanitize(input.suggestedFilename)}`
  ].join("/");

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error } = await supabase.storage
    .from(ARTIFACT_BUCKET)
    .upload(artifactPath, buffer, {
      upsert: false,
      contentType: "application/vnd.ms-excel",
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data: verificationBlob, error: verificationError } = await supabase.storage
    .from(ARTIFACT_BUCKET)
    .download(artifactPath);

  if (verificationError || !verificationBlob) {
    throw new Error(
      `Artifact upload could not be verified in storage: ${verificationError?.message ?? "object was not readable"}`
    );
  }

  const verificationBuffer = Buffer.from(await verificationBlob.arrayBuffer());
  const verificationHash = createHash("sha256")
    .update(verificationBuffer)
    .digest("hex");

  if (verificationHash !== hash) {
    throw new Error(`Artifact storage verification failed for ${artifactPath}: source and stored hashes differ.`);
  }

  return {
    artifactBucket: ARTIFACT_BUCKET,
    artifactPath,
    artifactFilename: input.suggestedFilename,
    artifactSize: fileStat.size,
    artifactHash: hash,
    artifactStorageVerified: true,
    artifactStorageVerifiedAt: new Date().toISOString(),
    artifactUploadedAt: new Date().toISOString(),
  };
}
