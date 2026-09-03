import * as LocalAuthentication from "expo-local-authentication";

import { authenticateDeviceAccess } from "./deviceAuthentication";

let mockIsDevice = true;

jest.mock("expo-device", () => ({
  get isDevice() {
    return mockIsDevice;
  },
}));

jest.mock("expo-local-authentication", () => ({
  authenticateAsync: jest.fn(),
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
}));

describe("device authentication gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDevice = true;
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
  });

  it("bypasses the gate only for a local simulator build", async () => {
    mockIsDevice = false;

    await expect(authenticateDeviceAccess()).resolves.toEqual({ authenticated: true });
    expect(LocalAuthentication.hasHardwareAsync).not.toHaveBeenCalled();
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  it("unlocks only after successful strong device authentication", async () => {
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: true,
    });

    await expect(authenticateDeviceAccess()).resolves.toEqual({ authenticated: true });
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMessage: "Unlock Insight Mobile Companion",
        disableDeviceFallback: false,
        biometricsSecurityLevel: "strong",
      }),
    );
  });

  it("keeps the workspace locked when authentication is not completed", async () => {
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: false,
      error: "user_cancel",
      warning: undefined,
    });

    await expect(authenticateDeviceAccess()).resolves.toEqual({
      authenticated: false,
      message: expect.stringContaining("not completed"),
    });
  });

  it("requires an enrolled device authentication method", async () => {
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(false);

    const result = await authenticateDeviceAccess();

    expect(result.authenticated).toBe(false);
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });
});
