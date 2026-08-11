import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

import type { AccessMembership } from "../lib/supabase";
import { getSupabaseClient } from "../lib/supabase";

const INSTALLATION_KEY = "insight.mobile.push.installation.v1";

export type PushRegistrationState =
  | "CHECKING"
  | "NOT_REQUESTED"
  | "DENIED"
  | "READY"
  | "REGISTERED"
  | "UNSUPPORTED"
  | "ERROR";

let notificationHandlerInstalled = false;

function nativePushAvailable() {
  return Boolean(requireOptionalNativeModule("ExpoDevice"));
}

async function notificationModules() {
  if (!nativePushAvailable()) {
    throw new Error("Rebuild the Insight development client to enable notifications.");
  }
  const [ConstantsModule, Device, Notifications] = await Promise.all([
    import("expo-constants"),
    import("expo-device"),
    import("expo-notifications"),
  ]);
  if (!notificationHandlerInstalled) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerInstalled = true;
  }
  return {
    Constants: ConstantsModule.default,
    Device,
    Notifications,
  };
}

async function installationId() {
  const stored = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (stored) return stored;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_KEY, created, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return created;
}

function projectId(Constants: typeof import("expo-constants").default) {
  return Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId
    ?? null;
}

function remoteRegistrationEnabled(Constants: typeof import("expo-constants").default) {
  return Constants.expoConfig?.extra?.notifications?.remoteRegistrationEnabled === true;
}

export async function pushRegistrationState(): Promise<PushRegistrationState> {
  if (!nativePushAvailable()) return "UNSUPPORTED";
  const { Constants, Device, Notifications } = await notificationModules();
  if (!remoteRegistrationEnabled(Constants)) return "UNSUPPORTED";
  if (!Device.isDevice) return "UNSUPPORTED";
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status === "granted") return "READY";
  if (permission.status === "denied") return "DENIED";
  return "NOT_REQUESTED";
}

export async function registerPushDevice(membership: AccessMembership) {
  const { Constants, Device, Notifications } = await notificationModules();
  if (!remoteRegistrationEnabled(Constants)) {
    throw new Error("Remote notifications will be enabled with the paid Apple signing team.");
  }
  if (!Device.isDevice) throw new Error("Push notifications require a physical device.");
  const expoProjectId = projectId(Constants);
  if (!expoProjectId) throw new Error("The Expo project id is not configured.");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Insight updates",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== "granted") {
    throw new Error("Notifications are disabled. You can enable them in device Settings.");
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId: expoProjectId });
  const deviceInstallationId = await installationId();
  const result = await getSupabaseClient().rpc(
    "register_mobile_companion_push_device",
    {
      p_company_slug: membership.company_slug,
      p_roster_member_id: membership.roster_member_id,
      p_access_mode: membership.access_mode,
      p_installation_id: deviceInstallationId,
      p_expo_push_token: token.data,
      p_platform: Platform.OS,
      p_project_id: expoProjectId,
      p_app_version: Constants.expoConfig?.version ?? null,
    },
  );
  if (result.error) throw result.error;
  return result.data;
}

export async function deactivatePushDevice() {
  const deviceInstallationId = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (!deviceInstallationId) return;
  const result = await getSupabaseClient().rpc(
    "deactivate_mobile_companion_push_device",
    { p_installation_id: deviceInstallationId },
  );
  if (result.error) throw result.error;
}
