import "server-only";

import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type ServiceKey = "VERCEL" | "SUPABASE" | "DIGITALOCEAN" | "BACKBLAZE" | "RESEND";
type CheckResult = {
  serviceKey: ServiceKey;
  checkKey: string;
  checkName: string;
  status: "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN";
  latencyMs?: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

async function timedFetch(url: string, init?: RequestInit) {
  const started = Date.now();
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  return { response, latencyMs: Date.now() - started };
}

async function vercelCheck(): Promise<CheckResult> {
  const token = process.env.VERCEL_ACCESS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) return { serviceKey: "VERCEL", checkKey: "production_deployment", checkName: "Production deployment", status: "UNKNOWN", errorCode: "NOT_CONFIGURED", errorMessage: "Vercel telemetry credentials are not configured." };
  const query = new URLSearchParams({ projectId, target: "production", limit: "1" });
  if (teamId) query.set("teamId", teamId);
  const { response, latencyMs } = await timedFetch(`https://api.vercel.com/v6/deployments?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json() as { deployments?: Array<{ uid?: string; state?: string; readyState?: string; createdAt?: number; url?: string; meta?: Record<string, unknown> }> };
  const deployment = payload.deployments?.[0];
  const state = String(deployment?.readyState ?? deployment?.state ?? "UNKNOWN").toUpperCase();
  return { serviceKey: "VERCEL", checkKey: "production_deployment", checkName: "Production deployment", status: response.ok && state === "READY" ? "HEALTHY" : response.ok ? "DEGRADED" : "FAILED", latencyMs, statusCode: response.status, metadata: { deployment_id: deployment?.uid, deployment_state: state, deployment_url: deployment?.url, created_at: deployment?.createdAt } };
}

async function supabaseCheck(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { serviceKey: "SUPABASE", checkKey: "rest_api", checkName: "Database API", status: "UNKNOWN", errorCode: "NOT_CONFIGURED", errorMessage: "Supabase server credentials are not configured." };
  const { response, latencyMs } = await timedFetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return { serviceKey: "SUPABASE", checkKey: "rest_api", checkName: "Database API", status: response.ok ? (latencyMs > 1500 ? "DEGRADED" : "HEALTHY") : "FAILED", latencyMs, statusCode: response.status };
}

async function digitalOceanCheck(): Promise<CheckResult> {
  const token = process.env.DIGITALOCEAN_ACCESS_TOKEN;
  const dropletId = process.env.DIGITALOCEAN_DROPLET_ID;
  if (!token || !dropletId) return { serviceKey: "DIGITALOCEAN", checkKey: "droplet", checkName: "Runner host", status: "UNKNOWN", errorCode: "NOT_CONFIGURED", errorMessage: "DigitalOcean monitoring credentials are not configured." };
  const { response, latencyMs } = await timedFetch(`https://api.digitalocean.com/v2/droplets/${encodeURIComponent(dropletId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json() as { droplet?: { id?: number; name?: string; status?: string; region?: { slug?: string }; size_slug?: string } };
  const state = String(payload.droplet?.status ?? "unknown").toLowerCase();
  return { serviceKey: "DIGITALOCEAN", checkKey: "droplet", checkName: "Runner host", status: response.ok && state === "active" ? "HEALTHY" : response.ok ? "DEGRADED" : "FAILED", latencyMs, statusCode: response.status, metadata: { droplet_id: payload.droplet?.id, name: payload.droplet?.name, state, region: payload.droplet?.region?.slug, size: payload.droplet?.size_slug } };
}

async function backblazeCheck(): Promise<CheckResult> {
  const endpoint = process.env.B2_S3_ENDPOINT;
  const configuredRegion = process.env.B2_S3_REGION;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_FLEET_EVIDENCE_BUCKET;
  if (!endpoint || !configuredRegion || !accessKeyId || !secretAccessKey || !bucket) return { serviceKey: "BACKBLAZE", checkKey: "bucket_access", checkName: "Evidence archive", status: "UNKNOWN", errorCode: "NOT_CONFIGURED", errorMessage: "Backblaze telemetry credentials are not configured." };
  const region = configuredRegion.replace(/^https?:\/\//, "").replace(/^s3\./, "").replace(/\.backblazeb2\.com\/?$/, "");
  const started = Date.now();
  const s3 = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  return { serviceKey: "BACKBLAZE", checkKey: "bucket_access", checkName: "Evidence archive", status: "HEALTHY", latencyMs: Date.now() - started, metadata: { bucket } };
}

type ResendDomain = {
  id?: string;
  name?: string;
  status?: string;
  region?: string;
  capabilities?: { sending?: string; receiving?: string };
};

async function resendCheck(): Promise<CheckResult> {
  const token = process.env.RESEND_API_KEY;
  if (!token) return { serviceKey: "RESEND", checkKey: "domain_readiness", checkName: "Sending domains", status: "UNKNOWN", errorCode: "NOT_CONFIGURED", errorMessage: "Resend telemetry credentials are not configured." };

  const { response, latencyMs } = await timedFetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "TeamOptix-Insight/engineering-telemetry" },
  });
  const payload = await response.json() as { data?: ResendDomain[]; message?: string; name?: string };
  if (!response.ok) {
    return { serviceKey: "RESEND", checkKey: "domain_readiness", checkName: "Sending domains", status: "FAILED", latencyMs, statusCode: response.status, errorCode: payload.name ?? "RESEND_API_ERROR", errorMessage: payload.message ?? "Resend domain check failed." };
  }

  const domains = payload.data ?? [];
  const verified = domains.filter((domain) => domain.status === "verified").length;
  const failed = domains.filter((domain) => ["failed", "temporary_failure", "partially_failed"].includes(String(domain.status))).length;
  const status = domains.length > 0 && verified === domains.length ? "HEALTHY" : failed > 0 ? "FAILED" : "DEGRADED";
  return {
    serviceKey: "RESEND",
    checkKey: "domain_readiness",
    checkName: "Sending domains",
    status,
    latencyMs,
    statusCode: response.status,
    errorCode: domains.length ? undefined : "NO_DOMAINS",
    errorMessage: domains.length ? undefined : "No sending domains are configured in Resend.",
    metadata: {
      domain_count: domains.length,
      verified_domain_count: verified,
      domains: domains.map((domain) => ({ id: domain.id, name: domain.name, status: domain.status, region: domain.region, sending: domain.capabilities?.sending, receiving: domain.capabilities?.receiving })),
    },
  };
}

function failedResult(serviceKey: ServiceKey, error: unknown): CheckResult {
  return { serviceKey, checkKey: "provider_access", checkName: "Provider access", status: "FAILED", errorCode: error instanceof Error ? error.name : "PROVIDER_ERROR", errorMessage: error instanceof Error ? error.message : "Provider check failed." };
}

export async function collectPlatformTelemetry() {
  const checks = await Promise.all([
    vercelCheck().catch((error) => failedResult("VERCEL", error)),
    supabaseCheck().catch((error) => failedResult("SUPABASE", error)),
    digitalOceanCheck().catch((error) => failedResult("DIGITALOCEAN", error)),
    backblazeCheck().catch((error) => failedResult("BACKBLAZE", error)),
    resendCheck().catch((error) => failedResult("RESEND", error)),
  ]);
  const db = createSupabaseServiceRoleClient();
  const completedAt = new Date().toISOString();
  const rows = checks.map((check) => ({
    service_key: check.serviceKey,
    check_key: check.checkKey,
    check_name: check.checkName,
    started_at: completedAt,
    completed_at: completedAt,
    status: check.status,
    latency_ms: check.latencyMs,
    status_code: check.statusCode,
    error_code: check.errorCode,
    error_message: check.errorMessage,
    metadata: check.metadata ?? {},
  }));
  const { error } = await db.rpc("record_platform_service_checks", { p_checks: rows });
  if (error) throw new Error(error.message);
  return checks;
}

export async function getPlatformHealth() {
  const db = createSupabaseServiceRoleClient();
  const [{ data: services, error }, { data: checks }] = await Promise.all([
    db.from("platform_service_health_v").select("*").order("display_order"),
    db.from("platform_service_check_run_v").select("*").order("started_at", { ascending: false }).limit(40),
  ]);
  if (error) {
    return {
      services: [
        { service_key: "VERCEL", service_name: "Vercel", service_role: "APPLICATION", health_state: "UNKNOWN", last_observed_at: null, max_latency_ms: null, check_count: 0 },
        { service_key: "SUPABASE", service_name: "Supabase", service_role: "DATA", health_state: "UNKNOWN", last_observed_at: null, max_latency_ms: null, check_count: 0 },
        { service_key: "DIGITALOCEAN", service_name: "DigitalOcean", service_role: "COMPUTE", health_state: "UNKNOWN", last_observed_at: null, max_latency_ms: null, check_count: 0 },
        { service_key: "BACKBLAZE", service_name: "Backblaze B2", service_role: "ARCHIVE", health_state: "UNKNOWN", last_observed_at: null, max_latency_ms: null, check_count: 0 },
        { service_key: "RESEND", service_name: "Resend", service_role: "COMMUNICATIONS", health_state: "UNKNOWN", last_observed_at: null, max_latency_ms: null, check_count: 0 },
      ],
      checks: [],
      foundationReady: false,
    };
  }
  return { services: services ?? [], checks: checks ?? [], foundationReady: true };
}
