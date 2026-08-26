export type PersistenceFieldKind =
  | "text"
  | "email"
  | "date"
  | "number";

type VerificationInput = {
  submitted: Record<string, unknown>;
  persisted: Record<string, unknown>;
  fields: Record<string, PersistenceFieldKind>;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function normalizeValue(value: unknown, kind: PersistenceFieldKind) {
  if (kind === "number") {
    if (value == null || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : "__invalid_number__";
  }

  const text = normalizeText(value);
  if (text == null) return null;

  if (kind === "email") return text.toLowerCase();
  if (kind === "date") {
    const date = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    return date ?? text;
  }

  return text;
}

export function findPersistenceMismatches({
  submitted,
  persisted,
  fields,
}: VerificationInput) {
  return Object.entries(fields)
    .filter(([field]) =>
      Object.prototype.hasOwnProperty.call(submitted, field),
    )
    .filter(
      ([field, kind]) =>
        normalizeValue(submitted[field], kind) !==
        normalizeValue(persisted[field], kind),
    )
    .map(([field]) => field);
}

