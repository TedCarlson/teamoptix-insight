import { describe, expect, it } from "vitest";
import {
  analyzeRouteGpxDeliveryClusters,
  clusterRouteGpxStops,
  parseRouteGpx,
  routeGpxDistanceMeters,
  routeKeyFromGpxText,
  routeGpxManifestReadiness,
} from "./routeGpx";

describe("route GPX ingestion", () => {
  it("parses route stops and track breadcrumbs", () => {
    const parsed = parseRouteGpx(Buffer.from(`<?xml version="1.0"?>
      <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
        <rte><name>WA 42</name>
          <rtept lat="39.1000" lon="-76.7000"><name>Stop 1</name></rtept>
          <rtept lat="39.10004" lon="-76.70004"><name>Stop 2</name></rtept>
        </rte>
        <trk><name>Driven path</name><trkseg>
          <trkpt lat="39.0900" lon="-76.7100"><time>2026-08-28T12:00:00Z</time></trkpt>
        </trkseg></trk>
      </gpx>`));
    expect(parsed.sourcePointCount).toBe(3);
    expect(parsed.stopPointCount).toBe(2);
    expect(parsed.trackName).toBe("WA 42");
    expect(parsed.retainedPoints[2].observed_at).toBe("2026-08-28T12:00:00.000Z");
  });

  it("clusters colocated GPX route stops without changing their order", () => {
    const parsed = parseRouteGpx(Buffer.from(`<gpx><rte>
      <rtept lat="39.10001" lon="-76.70001"><name>Stop 10</name></rtept>
      <rtept lat="39.10004" lon="-76.70004"><name>Stop 11</name></rtept>
      <rtept lat="39.2000" lon="-76.8000"><name>Stop 12</name></rtept>
    </rte></gpx>`));
    const clusters = clusterRouteGpxStops(parsed.retainedPoints);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({ stop_count: 2, first_sequence: 1, last_sequence: 2 });
    expect(clusters[0].member_sequences).toEqual([1, 2]);
    expect(clusters[0].radius_meters).toBeLessThan(5);
    expect(clusters[1]).toMatchObject({ stop_count: 1, first_sequence: 3 });
  });

  it("uses physical distance instead of coordinate rounding boundaries", () => {
    const parsed = parseRouteGpx(Buffer.from(`<gpx><rte>
      <rtept lat="33.565603" lon="-81.736903"><name>Seq 2:SID 1023:1321 RICHLAND AVE</name></rtept>
      <rtept lat="33.565559" lon="-81.736834"><name>Seq 3:SID 1037:1321 RICHLAND AVE W</name></rtept>
    </rte></gpx>`));
    expect(
      routeGpxDistanceMeters(
        parsed.retainedPoints[0],
        parsed.retainedPoints[1]
      )
    ).toBeLessThan(10);
    expect(clusterRouteGpxStops(parsed.retainedPoints)).toHaveLength(1);
  });

  it("does not chain nearby stops into a street-sized cluster", () => {
    const parsed = parseRouteGpx(Buffer.from(`<gpx><rte>
      <rtept lat="39.100000" lon="-76.700000"><name>Stop 1</name></rtept>
      <rtept lat="39.100180" lon="-76.700000"><name>Stop 2</name></rtept>
      <rtept lat="39.100360" lon="-76.700000"><name>Stop 3</name></rtept>
    </rte></gpx>`));
    const clusters = clusterRouteGpxStops(parsed.retainedPoints, {
      radiusMeters: 25,
    });
    expect(clusters).toHaveLength(2);
    expect(clusters[0].member_sequences).toEqual([1, 2]);
    expect(clusters[1].member_sequences).toEqual([3]);
  });

  it("returns a route-level delivery cluster analysis", () => {
    const analysis = analyzeRouteGpxDeliveryClusters(Buffer.from(`<gpx><rte>
      <name>WA 0481</name>
      <rtept lat="33.500000" lon="-81.700000"><name>Seq 1:SID 1001:100 EXAMPLE ST</name></rtept>
      <rtept lat="33.500030" lon="-81.700030"><name>Seq 2:SID 1002:100 EXAMPLE ST</name></rtept>
      <rtept lat="33.510000" lon="-81.710000"><name>Seq 3:SID 1003:200 EXAMPLE AVE</name></rtept>
    </rte></gpx>`));
    expect(analysis).toMatchObject({
      route_key: "481",
      route_label: "WA 0481",
      stop_point_count: 3,
      cluster_count: 2,
      cluster_radius_meters: 25,
    });
    expect(analysis.clusters.map((cluster) => cluster.stop_count)).toEqual([2, 1]);
  });

  it("rejects unsafe cluster radii", () => {
    expect(() => clusterRouteGpxStops([], { radiusMeters: 0 })).toThrow(
      "between 1 and 250 meters"
    );
    expect(() => clusterRouteGpxStops([], { radiusMeters: 251 })).toThrow(
      "between 1 and 250 meters"
    );
  });

  it("rejects non-GPX and unsafe declarations", () => {
    expect(() => parseRouteGpx(Buffer.from("not xml"))).toThrow("not a GPX");
    expect(() =>
      parseRouteGpx(Buffer.from('<!DOCTYPE gpx [<!ENTITY x "bad">]><gpx />'))
    ).toThrow("unsupported document declarations");
  });

  it("parses the Combined Manifest GPX label contract", () => {
    const parsed = parseRouteGpx(Buffer.from(`<gpx><rte>
      <name>WA 0481</name>
      <rtept lat="33.5000" lon="-81.7000">
        <name>Seq 0:SID 0:100 EXAMPLE ST:Ready 12:57:Close 17:00</name>
      </rtept>
      <rtept lat="33.5100" lon="-81.7100">
        <name>Seq 1:SID 1001:200 EXAMPLE AVE:Ready 00:00:Close 12:00</name>
      </rtept>
    </rte></gpx>`));
    expect(parsed.trackName).toBe("WA 0481");
    expect(routeKeyFromGpxText(parsed.trackName)).toBe("481");
    expect(parsed.stopPointCount).toBe(2);
    expect(parsed.retainedPoints[1].point_name).toContain("SID 1001");
  });

  it("waits for manifest verification instead of failing a staged batch", () => {
    const pending = routeGpxManifestReadiness(
      [{
        artifact_status: "READY_FOR_INGEST",
        runner_artifact_json: { artifact_key: "DELIVERY_MANIFEST" },
      }],
      "42"
    );
    expect(pending.status).toBe("PENDING");

    const ready = routeGpxManifestReadiness(
      [{
        artifact_status: "IGNORED",
        runner_artifact_json: {
          artifact_key: "DELIVERY_MANIFEST",
          identity_authority: "INGESTION_PIPELINE",
          route_key: "42",
        },
      }],
      "42"
    );
    expect(ready.status).toBe("READY");
  });

  it("accepts route-day workbook authority independently of collection cycle", () => {
    const ready = routeGpxManifestReadiness(
      [{
        collection_request_id: "earlier-manifest-cycle",
        artifact_status: "INGESTED",
        runner_artifact_json: {
          artifact_key: "PICKUP_MANIFEST",
          identity_authority: "INGESTION_PIPELINE",
          route_key: "481",
        },
      }],
      "481"
    );
    expect(ready.status).toBe("READY");
  });

  it("does not accept failed workbook artifacts as GPX identity authority", () => {
    const invalid = routeGpxManifestReadiness(
      [{
        artifact_status: "FAILED",
        runner_artifact_json: {
          artifact_key: "DELIVERY_MANIFEST",
          identity_authority: "INGESTION_PIPELINE",
          route_key: "481",
        },
      }],
      "481"
    );
    expect(invalid.status).toBe("INVALID");
  });
});
