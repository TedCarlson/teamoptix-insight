"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAccess } from "@/features/access/AccessProvider";

export type InsightTheme = "light" | "dark";
export type ThemePreference = "system" | InsightTheme;

type ThemeContextValue = {
  preference: ThemePreference;
  theme: InsightTheme;
  setPreference: (preference: ThemePreference) => void;
  saving: boolean;
  error: string | null;
  profilePersistenceReady: boolean;
  ready: boolean;
};

const STORAGE_KEY = "insight-theme-preference";
const LEGACY_STORAGE_KEY = "insight-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function systemTheme(): InsightTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): InsightTheme {
  return preference === "system" ? systemTheme() : preference;
}

function getInitialPreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  const bootstrapped = document.documentElement.dataset.themePreference;
  return isPreference(bootstrapped) ? bootstrapped : "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const access = useAccess();
  const ready = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const [preference, setPreferenceState] = useState<ThemePreference>(getInitialPreference);
  const [theme, setTheme] = useState<InsightTheme>(() => resolveTheme(getInitialPreference()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profilePersistenceReady = Boolean(access.auth_user_id && isPreference(access.theme_preference));

  const applyPreference = useCallback((nextPreference: ThemePreference) => {
    const nextTheme = resolveTheme(nextPreference);
    setPreferenceState(nextPreference);
    setTheme(nextTheme);
    document.documentElement.dataset.themePreference = nextPreference;
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(STORAGE_KEY, nextPreference);
      window.localStorage.setItem(LEGACY_STORAGE_KEY, nextTheme);
    } catch {
      // The visible theme still applies when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!isPreference(access.theme_preference)) return;
    const serverPreference = access.theme_preference;
    const timeout = window.setTimeout(() => applyPreference(serverPreference), 0);
    return () => window.clearTimeout(timeout);
  }, [access.theme_preference, applyPreference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      if (preference !== "system") return;
      const nextTheme = media.matches ? "dark" : "light";
      setTheme(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
      try {
        window.localStorage.setItem(LEGACY_STORAGE_KEY, nextTheme);
      } catch {
        // The visible theme still applies when browser storage is unavailable.
      }
    };
    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, [preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    applyPreference(nextPreference);
    setError(null);

    if (!profilePersistenceReady) return;

    setSaving(true);
    void fetch("/api/profile/preferences/theme", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preference: nextPreference }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to save appearance preference.");
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Unable to save appearance preference.");
      })
      .finally(() => setSaving(false));
  }, [applyPreference, profilePersistenceReady]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    theme,
    setPreference,
    saving,
    error,
    profilePersistenceReady,
    ready,
  }), [error, preference, profilePersistenceReady, ready, saving, setPreference, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
