import "react-native-url-polyfill/auto";

import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export type AccessMembership = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  membership_status: string;
};

export async function loadAccessMemberships() {
  const supabase = getSupabaseClient();
  const ensured = await supabase.rpc("ensure_access_context");
  if (ensured.error) throw ensured.error;

  const result = await supabase.rpc("access_context");
  if (result.error) throw result.error;

  const record = result.data as { memberships?: unknown } | null;
  if (!Array.isArray(record?.memberships)) return [];

  return (record.memberships as AccessMembership[]).filter(
    (membership) =>
      membership.membership_status === "active" &&
      membership.company_status === "active",
  );
}
