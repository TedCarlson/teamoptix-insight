import {
  createCipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function normalizeTrackingId(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function trackingReference(params: {
  companyId: string;
  trackingId: string;
}) {
  const version =
    process.env.TRACKING_REFERENCE_HMAC_VERSION?.trim() || "v1";
  const secret = requiredEnvironment("TRACKING_REFERENCE_HMAC_KEY");
  const normalized = normalizeTrackingId(params.trackingId);
  if (!normalized) throw new Error("Tracking ID is empty after normalization.");
  const digest = createHmac("sha256", secret)
    .update(`${params.companyId}:${normalized}`)
    .digest("hex");
  return { tracking_ref: `${version}_${digest}`, tracking_ref_version: version };
}

export function encryptTransientPackageIdentity(payload: {
  tracking_id: string;
  destination_address: string | null;
}) {
  const keyText = requiredEnvironment(
    "TRACKING_TRANSIENT_ENCRYPTION_KEY"
  );
  const key = Buffer.from(keyText, "base64");
  if (key.length !== 32) {
    throw new Error(
      "TRACKING_TRANSIENT_ENCRYPTION_KEY must decode to exactly 32 bytes."
    );
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const serialized = JSON.stringify(payload);
  const ciphertext = Buffer.concat([
    cipher.update(serialized, "utf8"),
    cipher.final(),
  ]);
  const fingerprint = createHmac(
    "sha256",
    requiredEnvironment("TRACKING_REFERENCE_HMAC_KEY")
  )
    .update(serialized)
    .digest("hex");

  return {
    transient_payload_ciphertext: ciphertext.toString("base64"),
    transient_payload_iv: iv.toString("base64"),
    transient_payload_auth_tag: cipher.getAuthTag().toString("base64"),
    transient_payload_fingerprint: fingerprint,
  };
}
