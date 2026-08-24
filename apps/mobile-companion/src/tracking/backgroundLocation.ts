import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

import type { AccessMembership } from "../lib/supabase";
import { EdgeOutbox } from "../outbox/database";
import type { BreadcrumbPoint, LocalSession } from "../outbox/types";
import { syncOutbox } from "../sync/syncOutbox";

export const DUTY_LOCATION_TASK = "insight-duty-location-v1";
export const DUTY_LOCATION_INTERVAL_MS = 120_000;
export const DUTY_LOCATION_DISTANCE_METERS = 50;

const DUTY_REGISTRATION_KEY = "insight.duty-location.registration.v1";

type DutyLocationRegistration = {
  version: 1;
  userId: string;
  membership: AccessMembership;
  sessionId: string;
  startedAt: string;
};

export class DutyLocationAuthorizationError extends Error {
  readonly settingsRequired: boolean;

  constructor(message: string, settingsRequired = false) {
    super(message);
    this.name = "DutyLocationAuthorizationError";
    this.settingsRequired = settingsRequired;
  }
}

function validRegistration(value: unknown): value is DutyLocationRegistration {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DutyLocationRegistration>;
  return candidate.version === 1
    && typeof candidate.userId === "string"
    && typeof candidate.sessionId === "string"
    && typeof candidate.startedAt === "string"
    && Boolean(candidate.membership)
    && candidate.membership?.role === "DRIVER"
    && typeof candidate.membership.context_key === "string";
}

async function readRegistration() {
  const stored = await SecureStore.getItemAsync(DUTY_REGISTRATION_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (validRegistration(parsed)) return parsed;
  } catch {
    // Invalid task metadata is cleared below and never used to authorize a fix.
  }
  await SecureStore.deleteItemAsync(DUTY_REGISTRATION_KEY);
  return null;
}

async function writeRegistration(registration: DutyLocationRegistration) {
  await SecureStore.setItemAsync(
    DUTY_REGISTRATION_KEY,
    JSON.stringify(registration),
    { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
  );
}

function backgroundPoint(
  registration: DutyLocationRegistration,
  location: Location.LocationObject,
): BreadcrumbPoint | null {
  if (!Number.isFinite(location.coords.latitude)
    || !Number.isFinite(location.coords.longitude)
    || location.timestamp < Date.parse(registration.startedAt)) {
    return null;
  }

  return {
    pointId: Crypto.randomUUID(),
    sessionId: registration.sessionId,
    tenantKey: registration.membership.context_key,
    deviceCapturedAt: new Date(location.timestamp).toISOString(),
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyMeters: location.coords.accuracy,
    captureMethod: "BACKGROUND_GPS",
  };
}

async function stopOrphanedTask() {
  await SecureStore.deleteItemAsync(DUTY_REGISTRATION_KEY).catch(() => undefined);
  const started = await Location.hasStartedLocationUpdatesAsync(DUTY_LOCATION_TASK)
    .catch(() => false);
  if (started) {
    await Location.stopLocationUpdatesAsync(DUTY_LOCATION_TASK).catch(() => undefined);
  }
}

if (!TaskManager.isTaskDefined(DUTY_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
    DUTY_LOCATION_TASK,
    async ({ data, error }) => {
    if (error) return;
    const registration = await readRegistration();
    if (!registration) return;

    const outbox = await EdgeOutbox.open(registration.userId).catch(() => null);
    if (!outbox) return;
    try {
      const session = await outbox.openSession(registration.membership.context_key);
      if (!session || session.sessionId !== registration.sessionId) {
        await stopOrphanedTask();
        return;
      }

      const points = (data?.locations ?? [])
        .map((location) => backgroundPoint(registration, location))
        .filter((point): point is BreadcrumbPoint => Boolean(point));
      for (const point of points) await outbox.enqueuePoint(point);
      if (points.length === 0) return;

      await outbox.sealNextBatch(
        registration.membership.context_key,
        registration.sessionId,
      );
      // Network failure never loses evidence: syncOutbox leaves the encrypted
      // batch pending for the next background delivery or foreground refresh.
      await syncOutbox(outbox, registration.membership).catch(() => undefined);
    } finally {
      await outbox.close().catch(() => undefined);
    }
    },
  );
}

export async function requireDutyLocationAuthorization() {
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new DutyLocationAuthorizationError(
      "Start Duty requires Location Services. Turn Location Services on in iPhone Settings, then try again.",
      true,
    );
  }
  if (!(await Location.isBackgroundLocationAvailableAsync())) {
    throw new DutyLocationAuthorizationError(
      "This device cannot provide the background location required for duty tracking.",
    );
  }

  let foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    foreground = await Location.requestForegroundPermissionsAsync();
  }
  if (!foreground.granted) {
    throw new DutyLocationAuthorizationError(
      "Start Duty requires location access. Select Allow While Using App, then allow Always access for active duty tracking.",
      !foreground.canAskAgain,
    );
  }
  if (foreground.ios?.accuracy === "reduced"
    || foreground.android?.accuracy === "coarse") {
    throw new DutyLocationAuthorizationError(
      "Start Duty requires Precise Location. Turn Precise Location on in device Settings, then try again.",
      true,
    );
  }

  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) {
    background = await Location.requestBackgroundPermissionsAsync();
  }
  if (!background.granted) {
    throw new DutyLocationAuthorizationError(
      "Start Duty requires Always Location so work tracking can continue while the app is in the background. Insight does not collect location while you are off duty.",
      true,
    );
  }

  return { foreground, background };
}

function taskOptions(): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.High,
    activityType: Location.ActivityType.AutomotiveNavigation,
    distanceInterval: DUTY_LOCATION_DISTANCE_METERS,
    timeInterval: DUTY_LOCATION_INTERVAL_MS,
    deferredUpdatesDistance: DUTY_LOCATION_DISTANCE_METERS,
    deferredUpdatesInterval: DUTY_LOCATION_INTERVAL_MS,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Insight duty tracking is active",
      notificationBody: "Work location is recorded only until you stop duty.",
      killServiceOnDestroy: false,
    },
  };
}

export async function startDutyLocationTracking(args: {
  userId: string;
  membership: AccessMembership;
  session: LocalSession;
}) {
  const available = await TaskManager.isAvailableAsync();
  if (!available) {
    throw new Error("Background duty tracking requires an Insight development or production build.");
  }

  const registration: DutyLocationRegistration = {
    version: 1,
    userId: args.userId,
    membership: args.membership,
    sessionId: args.session.sessionId,
    startedAt: args.session.deviceStartedAt,
  };
  await writeRegistration(registration);
  try {
    if (await Location.hasStartedLocationUpdatesAsync(DUTY_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DUTY_LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(DUTY_LOCATION_TASK, taskOptions());
  } catch (error) {
    await SecureStore.deleteItemAsync(DUTY_REGISTRATION_KEY).catch(() => undefined);
    throw error;
  }
}

export async function resumeDutyLocationTracking(args: {
  userId: string;
  membership: AccessMembership;
  session: LocalSession;
}) {
  await requireDutyLocationAuthorization();
  const registration = await readRegistration();
  const started = await Location.hasStartedLocationUpdatesAsync(DUTY_LOCATION_TASK)
    .catch(() => false);
  if (registration?.userId === args.userId
    && registration.sessionId === args.session.sessionId
    && started) {
    return;
  }
  await startDutyLocationTracking(args);
}

export async function stopDutyLocationTracking() {
  let storageError: unknown = null;
  try {
    await SecureStore.deleteItemAsync(DUTY_REGISTRATION_KEY);
  } catch (error) {
    storageError = error;
  }

  let taskError: unknown = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(DUTY_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DUTY_LOCATION_TASK);
    }
  } catch (error) {
    taskError = error;
  }

  if (storageError && taskError) {
    throw new Error("Duty tracking could not be stopped cleanly. Restart the app and verify Location access in Settings.");
  }
}
