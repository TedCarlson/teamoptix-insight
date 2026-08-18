export type InsightProductKey =
  | "insight-pd-last-mile"
  | "insight-telecom-fulfillment"
  | "utility-locate-service";

export function productKeyFromPathname(pathname: string): InsightProductKey | null {
  if (pathname.startsWith("/insight/telecom-fulfillment/")) {
    return "insight-telecom-fulfillment";
  }

  if (pathname.startsWith("/teamoptix/products/itg")) {
    return "insight-telecom-fulfillment";
  }

  if (pathname.startsWith("/teamoptix/products/insight")) {
    return "insight-pd-last-mile";
  }

  if (pathname.startsWith("/teamoptix/products/uls")) {
    return "utility-locate-service";
  }

  return null;
}

export function companyProductHref(
  productKey: InsightProductKey,
  companySlug: string
) {
  if (productKey === "insight-telecom-fulfillment") {
    return `/insight/telecom-fulfillment/${companySlug}`;
  }

  return `/company/${companySlug}`;
}
