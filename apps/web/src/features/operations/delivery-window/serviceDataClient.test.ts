import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchServiceJsonOnce } from "./serviceDataClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Service call-once reads", () => {
  it("shares rerenders but keeps selected dates isolated", async () => {
    const request = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ url }),
    }));
    vi.stubGlobal("fetch", request);

    const today = "/service?date=2026-08-25";
    const history = "/service?date=2026-08-18";
    const [first, repeated, selected] = await Promise.all([
      fetchServiceJsonOnce(today, 0),
      fetchServiceJsonOnce(today, 0),
      fetchServiceJsonOnce(history, 0),
    ]);

    expect(request).toHaveBeenCalledTimes(2);
    expect(first.data).toEqual(repeated.data);
    expect(selected.data).toEqual({ url: history });

    await fetchServiceJsonOnce(today, 1);
    expect(request).toHaveBeenCalledTimes(3);
  });
});
