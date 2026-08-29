import { describe, expect, it } from "vitest";
import { presentRouteGpx } from "./routeGpxPresentation";

describe("route GPX presentation", () => {
  it("links a GPX stop to current express completion evidence", () => {
    const presentation = presentRouteGpx({
      geometry: {
        route_key: "42",
        route_label: "WA 42",
        track_name: "Route 42",
        source_point_count: 2,
        retained_point_count: 2,
        stop_point_count: 1,
        processed_at: "2026-08-28T10:00:00Z",
        points: [
          { sequence_number: 1, point_kind: "RTEPT", latitude: 39.1, longitude: -76.7, elevation_meters: null, observed_at: null, point_name: "Stop 15", point_description: null, is_stop: true },
          { sequence_number: 2, point_kind: "RTEPT", latitude: 39.2, longitude: -76.8, elevation_meters: null, observed_at: null, point_name: null, point_description: null, is_stop: false },
        ],
      },
      deliveryStops: [{ st_number: "15", sid: "A", completed: "Y", recipient: "Private Recipient", address_line_1: "100 Private Street", _route_map_ref: "D:0" }],
      packages: [{ st_number: "15", sid: "A", tracking_id: "PRIVATE-TRACKING-ID", is_express: true, delivery_evidence_state: "COMPLETED", star_scan_at_local: "10:42" }],
      pickups: [],
    });
    expect(presentation?.stop_clusters[0]).toMatchObject({
      execution_status: "CLOSED",
      stop_type: "EXPRESS",
      status_observed_at_local: "10:42",
      manifest_linked: true,
      manifest_ref: "D:0",
      package_count: 1,
    });
    expect(presentation?.stop_clusters[0]).not.toHaveProperty("labels");
    expect(JSON.stringify(presentation)).not.toContain("Private Recipient");
    expect(JSON.stringify(presentation)).not.toContain("100 Private Street");
    expect(JSON.stringify(presentation)).not.toContain("PRIVATE-TRACKING-ID");
  });

  it("does not invent a manifest link when GPX identity is ambiguous", () => {
    const presentation = presentRouteGpx({
      geometry: {
        route_key: "42", route_label: null, track_name: null,
        source_point_count: 1, retained_point_count: 1, stop_point_count: 1,
        processed_at: "2026-08-28T10:00:00Z",
        points: [{ sequence_number: 1, point_kind: "WPT", latitude: 39.1, longitude: -76.7, elevation_meters: null, observed_at: null, point_name: "House", point_description: null, is_stop: true }],
      },
      deliveryStops: [{ st_number: "15", address_line_1: "1 Main St" }],
      packages: [], pickups: [],
    });
    expect(presentation?.stop_clusters[0]).toMatchObject({
      execution_status: "UNKNOWN",
      manifest_linked: false,
    });
  });

  it("does not interpret a Combined GPX SID 0 as pickup PUID 0", () => {
    const presentation = presentRouteGpx({
      geometry: {
        route_key: "481", route_label: "WA 481", track_name: "WA 0481",
        source_point_count: 1, retained_point_count: 1, stop_point_count: 1,
        processed_at: "2026-08-28T10:00:00Z",
        points: [{
          sequence_number: 1,
          point_kind: "RTEPT",
          latitude: 39.1,
          longitude: -76.7,
          elevation_meters: null,
          observed_at: null,
          point_name: "Seq 12:SID 0:100 Main St:Ready 12:57:Close 17:00",
          point_description: null,
          is_stop: true,
        }],
      },
      deliveryStops: [],
      packages: [],
      pickups: [
        {
          puid: "0",
          address_line_1: "900 Other St",
          ready_at: "09:00",
          close_at: "10:00",
          pu_closed_at: "09:45",
        },
        {
          puid: "123",
          address_line_1: "100 Main St",
          ready_at: "12:57",
          close_at: "17:00",
          pu_closed_at: "",
        },
      ],
    });
    expect(presentation?.stop_clusters[0]).toMatchObject({
      execution_status: "OPEN",
      stop_type: "PICKUP",
      manifest_linked: true,
    });
  });

  it("leaves a Combined GPX pickup unlinked when its fallback window is ambiguous", () => {
    const presentation = presentRouteGpx({
      geometry: {
        route_key: "481", route_label: "WA 481", track_name: "WA 0481",
        source_point_count: 1, retained_point_count: 1, stop_point_count: 1,
        processed_at: "2026-08-28T10:00:00Z",
        points: [{
          sequence_number: 1,
          point_kind: "RTEPT",
          latitude: 39.1,
          longitude: -76.7,
          elevation_meters: null,
          observed_at: null,
          point_name: "Seq 12:SID 0:Unknown Site:Ready 12:57:Close 17:00",
          point_description: null,
          is_stop: true,
        }],
      },
      deliveryStops: [],
      packages: [],
      pickups: [
        { puid: "123", address_line_1: "100 Main St", ready_at: "12:57", close_at: "17:00" },
        { puid: "456", address_line_1: "200 Main St", ready_at: "12:57", close_at: "17:00" },
      ],
    });
    expect(presentation?.stop_clusters[0]).toMatchObject({
      execution_status: "UNKNOWN",
      stop_type: "UNKNOWN",
      manifest_linked: false,
    });
  });
});
