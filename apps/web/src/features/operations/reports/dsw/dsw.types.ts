export type ParsedRow = Record<string, unknown>;

export type DswRowKind = "ROUTE" | "ROUTE_BREAKOUT" | "ROUTE_CANDIDATE" | "SUMMARY";

export type DswRouteMatch = {
  id: string | null;
  method: string;
};

export type DswMeta = {
  terminal_identity: string | null;
  contract_filter: string | null;
  service_date_text: string | null;
  generated_at_text: string | null;
};
