export type ManifestServiceFlags = {
  is_express: boolean;
  is_residential: boolean;
  is_signature: boolean;
  is_hazmat: boolean;
  is_collection: boolean;
};

export function deriveManifestServiceFlags(premSvcRaw: string | null | undefined): ManifestServiceFlags {
  const normalized = String(premSvcRaw ?? "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const tokens = normalized.split(" ").filter(Boolean);
  const compact = tokens.join("");

  return {
    // FedEx premium-service exports use EXP as a token or terminal service
    // suffix (for example RES EXP, DSIGNEXP, HAZ ASIGNEXP). Avoid broad
    // substring matching so unrelated values such as EXPERIMENTAL cannot
    // silently inflate Express volume.
    is_express: tokens.includes("EXP") || compact.endsWith("EXP"),
    is_residential: tokens.includes("RES") || compact.includes("RES"),
    is_signature: compact.includes("DSIGN") || compact.includes("SIGN"),
    is_hazmat: tokens.includes("HAZ") || compact.includes("HAZ"),
    is_collection: tokens.includes("COLL") || compact.includes("COLL"),
  };
}
