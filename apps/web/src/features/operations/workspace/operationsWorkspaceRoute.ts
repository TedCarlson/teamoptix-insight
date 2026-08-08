export type PersistentOperationsSurface =
  | "operations"
  | "dispatch"
  | "service"
  | "planning";

export function persistentOperationsSurface(
  pathname: string,
  slug: string
): PersistentOperationsSurface | null {
  const base = `/company/${slug}/operations`;
  const normalized = pathname.length > 1
    ? pathname.replace(/\/+$/, "")
    : pathname;

  if (normalized === base) return "operations";
  if (normalized === `${base}/dispatch`) return "dispatch";
  if (normalized === `${base}/service`) return "service";
  if (normalized === `${base}/planning`) return "planning";
  return null;
}
