type JsonResult<T = any> = {
  ok: boolean;
  data: T;
};

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<JsonResult<T>> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const data = await res.json();

  return {
    ok: res.ok,
    data,
  };
}

export async function loadDispatchInputs(params: {
  slug: string;
  serviceDate: string;
  droPlanServiceDate: string;
}) {
  const { slug, serviceDate, droPlanServiceDate } = params;

  const [
    schedule,
    routes,
    roster,
    dispatchDay,
    eventTypes,
    operationsConfig,
    amDroPlan,
    pmDroPlan,
    dswCurrent,
  ] = await Promise.all([
    fetchJson(`/api/company/${slug}/schedule/generated?date=${serviceDate}`),
    fetchJson(`/api/company/${slug}/routes`),
    fetchJson(`/api/company/${slug}/people/roster`),
    fetchJson(`/api/company/${slug}/dispatch/day?date=${serviceDate}`),
    fetchJson(`/api/company/${slug}/dispatch/event-types`),
    fetchJson(`/api/company/${slug}/config/operations`),
    fetchJson(`/api/company/${slug}/operations/reports/dro-plan?date=${serviceDate}&frame=AM`),
    fetchJson(`/api/company/${slug}/operations/reports/dro-plan?date=${droPlanServiceDate}&frame=PM`),
    fetchJson(`/api/company/${slug}/operations/reports/dsw-current?date=${serviceDate}`),
  ]);

  return {
    schedule,
    routes,
    roster,
    dispatchDay,
    eventTypes,
    operationsConfig,
    amDroPlan,
    pmDroPlan,
    dswCurrent,
  };
}

export async function recordDispatchEvent(params: {
  slug: string;
  dispatchDate: string;
  payload: Record<string, unknown>;
}) {
  const { slug, dispatchDate, payload } = params;

  return fetchJson(`/api/company/${slug}/dispatch/event`, {
    method: "POST",
    body: JSON.stringify({
      dispatch_date: dispatchDate,
      ...payload,
    }),
  });
}

export async function lockDispatchDay(params: {
  slug: string;
  dispatchDate: string;
  snapshotJson: Record<string, unknown>;
}) {
  const { slug, dispatchDate, snapshotJson } = params;

  return fetchJson(`/api/company/${slug}/dispatch/lock`, {
    method: "POST",
    body: JSON.stringify({
      dispatch_date: dispatchDate,
      snapshot_json: snapshotJson,
    }),
  });
}
