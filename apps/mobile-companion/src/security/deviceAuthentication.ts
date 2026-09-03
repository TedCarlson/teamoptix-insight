import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";

export type DeviceAuthenticationResult =
  | { authenticated: true }
  | { authenticated: false; message: string };

export async function authenticateDeviceAccess(): Promise<DeviceAuthenticationResult> {
  // iOS Simulator can advertise Face ID in its menu while Expo reports that no
  // authentication method is enrolled. Bypass the gate only for local simulator
  // builds so App Store screenshot/testing workflows are not blocked. Physical
  // development devices and every production build still require authentication.
  if (__DEV__ && Device.isDevice === false) {
    return { authenticated: true };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) {
    return {
      authenticated: false,
      message: "Set up Face ID, Touch ID, or another supported device authentication method in Settings to protect your Insight workspace.",
    };
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Insight Mobile Companion",
    fallbackLabel: "Use Device Passcode",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
    biometricsSecurityLevel: "strong",
  });
  if (result.success) return { authenticated: true };

  const retryable = new Set([
    "authentication_failed",
    "lockout",
    "system_cancel",
    "timeout",
    "unable_to_process",
    "user_cancel",
  ]);
  return {
    authenticated: false,
    message: retryable.has(result.error)
      ? "Device authentication was not completed. Try again to unlock Insight."
      : "Device authentication is unavailable. Verify Face ID and your device passcode in Settings, then try again.",
  };
}
