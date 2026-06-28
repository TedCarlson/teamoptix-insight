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
      upsert: true,
      contentType: "application/vnd.ms-excel",
    });

  if (error) {
    throw new Error(error.message);
  }

  return {
    artifactBucket: ARTIFACT_BUCKET,
    artifactPath,
    artifactFilename: input.suggestedFilename,
    artifactSize: fileStat.size,
    artifactHash: hash,
    artifactUploadedAt: new Date().toISOString(),
  };
}
