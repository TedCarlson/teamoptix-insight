import "react-native-url-polyfill/auto";

import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildMobileAccessContexts,
  driverAccessContextKey,
  type AccessContextResponse,
  type DriverAccessContext,
  type DriverAccessGate,
  type MobileAccessContext,
} from "../domain/access";

const AUTH_STORAGE_KEY = "insight.mobile.auth.v1";
let client: SupabaseClient | null = null;
let appStateListenerInstalled = false;

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(`${AUTH_STORAGE_KEY}.${key}`),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(`${AUTH_STORAGE_KEY}.${key}`, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  removeItem: (key: string) =>
    SecureStore.deleteItemAsync(`${AUTH_STORAGE_KEY}.${key}`),
};

export function getSupabaseClient() {
  if (client) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  client = createClient(url, publishableKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  if (!appStateListenerInstalled) {
    appStateListenerInstalled = true;
    AppState.addEventListener("change", (state) => {
      if (!client) return;
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }

  return client;
}

export type AccessMembership = DriverAccessContext;

type AccessGateRow = DriverAccessGate;

export function accessContextKey(access: AccessGateRow) {
  return driverAccessContextKey(access);
}

export type MobileAccessPayload = {
  contexts: MobileAccessContext[];
  profileId: string;
  displayName: string | null;
};

export async function loadMobileAccessContexts(): Promise<MobileAccessPayload> {
  const supabase = getSupabaseClient();
  const ensured = await supabase.rpc("ensure_access_context");
  if (ensured.error) throw ensured.error;

  const [accessResult, gateResult] = await Promise.all([
    supabase.rpc("access_context"),
    supabase.rpc("mobile_companion_access_gate"),
  ]);
  if (accessResult.error) throw accessResult.error;
  if (gateResult.error) throw gateResult.error;

  const access = accessResult.data as AccessContextResponse | null;
  const profileId = access?.profile_id;
  if (!profileId) throw new Error("Your active Insight profile is unavailable.");
  const gates = Array.isArray(gateResult.data)
    ? gateResult.data as AccessGateRow[]
    : [];

  return {
    contexts: buildMobileAccessContexts(access, gates),
    profileId,
    displayName: access?.display_name ?? null,
  };
}
