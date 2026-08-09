import * as Crypto from "expo-crypto";
import * as Location from "expo-location";

import type { BreadcrumbPoint } from "../outbox/types";

export async function captureForegroundPoint(
  sessionId: string,
  tenantKey: string,
): Promise<BreadcrumbPoint> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Foreground location permission was not granted.");
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    pointId: Crypto.randomUUID(),
    sessionId,
    tenantKey,
    deviceCapturedAt: new Date(location.timestamp).toISOString(),
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyMeters: location.coords.accuracy,
    captureMethod: "FOREGROUND_GPS",
  };
}

export function captureSyntheticPoint(
  sessionId: string,
  tenantKey: string,
): BreadcrumbPoint {
  if (!__DEV__) throw new Error("Synthetic points are development-only.");
  return {
    pointId: Crypto.randomUUID(),
    sessionId,
    tenantKey,
    deviceCapturedAt: new Date().toISOString(),
    latitude: 39.9526,
    longitude: -75.1652,
    accuracyMeters: 10,
    captureMethod: "SYNTHETIC_TEST",
  };
}
