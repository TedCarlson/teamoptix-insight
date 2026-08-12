import * as Crypto from "expo-crypto";
import * as Location from "expo-location";

import type { BreadcrumbPoint } from "../outbox/types";

export const FOREGROUND_BREADCRUMB_INTERVAL_MS = 120_000;

export async function requirePreciseForegroundLocation() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      "Start Duty requires While Using the App location access. You can still use the rest of Mobile Companion.",
    );
  }
  if (permission.ios?.accuracy === "reduced") {
    throw new Error(
      "Start Duty requires Precise Location. Turn Precise Location on in iPhone Settings, then try again.",
    );
  }
  if (permission.android?.accuracy === "coarse") {
    throw new Error(
      "Start Duty requires precise location access. Update the app permission, then try again.",
    );
  }
  return permission;
}

export async function captureForegroundPoint(
  sessionId: string,
  tenantKey: string,
): Promise<BreadcrumbPoint> {
  await requirePreciseForegroundLocation();

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
