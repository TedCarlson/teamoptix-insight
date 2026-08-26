type ServiceJsonResult<T = any> = {
  ok: boolean;
  status: number;
  data: T;
};

const serviceRequests = new Map<string, Promise<ServiceJsonResult>>();
const MAX_REQUESTS = 64;

/**
 * Shares one read per URL and refresh version. The URL carries the selected
 * service date, so moving the date picker can never reuse another day's data.
 */
export function fetchServiceJsonOnce<T = any>(
  url: string,
  refreshVersion = 0
): Promise<ServiceJsonResult<T>> {
  const key = `${refreshVersion}:${url}`;
  const existing = serviceRequests.get(key);
  if (existing) return existing as Promise<ServiceJsonResult<T>>;

  const request = fetch(url, {
    credentials: "include",
    cache: "no-store",
  })
    .then(async (response) => ({
      ok: response.ok,
      status: response.status,
      data: await response.json(),
    }))
    .catch((error) => {
      serviceRequests.delete(key);
      throw error;
    });

  serviceRequests.set(key, request);
  if (serviceRequests.size > MAX_REQUESTS) {
    const oldest = serviceRequests.keys().next().value;
    if (oldest) serviceRequests.delete(oldest);
  }

  return request as Promise<ServiceJsonResult<T>>;
}
