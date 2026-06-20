export function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "$—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
