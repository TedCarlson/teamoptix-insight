import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

import type { AccessMembership } from "../lib/supabase";
import { EdgeOutbox } from "../outbox/database";
import type { LocalSession } from "../outbox/types";
import { syncOutbox } from "../sync/syncOutbox";
import {
  DUTY_LOCATION_TASK,
  DutyLocationAuthorizationError,
  requireDutyLocationAuthorization,
  startDutyLocationTracking,
  stopDutyLocationTracking,
} from "./backgroundLocation";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "33333333-3333-4333-8333-333333333333"),
}));

jest.mock("expo-location", () => ({
  Accuracy: { High: 6 },
  ActivityType: { AutomotiveNavigation: 3 },
  PermissionStatus: { DENIED: "denied", GRANTED: "granted" },
  getBackgroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  isBackgroundLocationAvailableAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "after-first-unlock-this-device-only",
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isAvailableAsync: jest.fn(),
  isTaskDefined: jest.fn(() => false),
}));

jest.mock("../outbox/database", () => ({
  EdgeOutbox: { open: jest.fn() },
}));

jest.mock("../sync/syncOutbox", () => ({
  syncOutbox: jest.fn(),
}));

const membership: AccessMembership = {
  role: "DRIVER",
  company_id: "44444444-4444-4444-8444-444444444444",
  company_name: "Team Optix LLC",
  company_slug: "team-optix",
  context_key: "44444444-4444-4444-8444-444444444444",
  relationship_type: "member",
  title: "Driver",
  roster_member_id: "55555555-5555-4555-8555-555555555555",
  driver_name: "Test Driver",
  access_mode: "DRIVER",
};

const session: LocalSession = {
  sessionId: "66666666-6666-4666-8666-666666666666",
  tenantKey: membership.context_key,
  companySlug: membership.company_slug,
  deviceStartedAt: "2026-08-24T18:00:00.000Z",
  deviceEndedAt: null,
  syncState: "PENDING",
  lastError: null,
};

const grantedForeground = {
  canAskAgain: true,
  expires: "never" as const,
  granted: true,
  status: Location.PermissionStatus.GRANTED,
  ios: { accuracy: "full" as const, scope: "whenInUse" as const },
};

const grantedBackground = {
  canAskAgain: true,
  expires: "never" as const,
  granted: true,
  status: Location.PermissionStatus.GRANTED,
};

describe("duty-scoped background location", () => {
  const registeredTask = jest.mocked(TaskManager.defineTask).mock.calls[0]?.[1] as
    | ((body: unknown) => Promise<void>)
    | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
    jest.mocked(Location.isBackgroundLocationAvailableAsync).mockResolvedValue(true);
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(grantedForeground);
    jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue(grantedBackground);
    jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValue(false);
    jest.mocked(TaskManager.isAvailableAsync).mockResolvedValue(true);
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  });

  it("requires Always Location only when Start Duty asks for authorization", async () => {
    jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({
      ...grantedBackground,
      canAskAgain: false,
      granted: false,
      status: Location.PermissionStatus.DENIED,
    });
    jest.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValue({
      ...grantedBackground,
      canAskAgain: false,
      granted: false,
      status: Location.PermissionStatus.DENIED,
    });

    await expect(requireDutyLocationAuthorization()).rejects.toMatchObject({
      name: "DutyLocationAuthorizationError",
      settingsRequired: true,
    } satisfies Partial<DutyLocationAuthorizationError>);
  });

  it("starts a persistent task with encrypted duty registration", async () => {
    await startDutyLocationTracking({
      userId: "11111111-1111-4111-8111-111111111111",
      membership,
      session,
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "insight.duty-location.registration.v1",
      expect.stringContaining(session.sessionId),
      { keychainAccessible: "after-first-unlock-this-device-only" },
    );
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      DUTY_LOCATION_TASK,
      expect.objectContaining({
        accuracy: Location.Accuracy.High,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      }),
    );
  });

  it("stops the native task and clears its duty registration", async () => {
    jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValue(true);

    await stopDutyLocationTracking();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "insight.duty-location.registration.v1",
    );
    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(DUTY_LOCATION_TASK);
  });

  it("never opens the outbox when no active duty registration exists", async () => {
    expect(registeredTask).toBeDefined();
    await registeredTask?.({
      data: { locations: [] },
      error: null,
    });

    expect(EdgeOutbox.open).not.toHaveBeenCalled();
    expect(syncOutbox).not.toHaveBeenCalled();
  });

  it("accepts only fixes inside the registered duty envelope", async () => {
    const outbox = {
      close: jest.fn(async () => undefined),
      enqueuePoint: jest.fn(async () => undefined),
      openSession: jest.fn(async () => session),
      sealNextBatch: jest.fn(async () => undefined),
    };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({
      version: 1,
      userId: "11111111-1111-4111-8111-111111111111",
      membership,
      sessionId: session.sessionId,
      startedAt: session.deviceStartedAt,
    }));
    jest.mocked(EdgeOutbox.open).mockResolvedValue(outbox as never);
    jest.mocked(syncOutbox).mockResolvedValue({
      online: true,
      sessionsAcknowledged: 0,
      batchesAcknowledged: 1,
      error: null,
    });

    await registeredTask?.({
      data: {
        locations: [
          {
            timestamp: Date.parse("2026-08-24T17:59:59.000Z"),
            coords: { latitude: 39, longitude: -75, accuracy: 10 },
          },
          {
            timestamp: Date.parse("2026-08-24T18:02:00.000Z"),
            coords: { latitude: 40, longitude: -76, accuracy: 8 },
          },
        ],
      },
      error: null,
    });

    expect(outbox.enqueuePoint).toHaveBeenCalledTimes(1);
    expect(outbox.enqueuePoint).toHaveBeenCalledWith(
      expect.objectContaining({ captureMethod: "BACKGROUND_GPS", latitude: 40 }),
    );
    expect(syncOutbox).toHaveBeenCalledWith(outbox, membership);
  });
});
