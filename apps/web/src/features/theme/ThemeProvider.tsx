"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type InsightTheme = "light" | "dark";

type ThemeContextValue = {
  theme: InsightTheme;
  setTheme: (theme: InsightTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): InsightTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<InsightTheme>(getInitialTheme);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme(nextTheme) {
      setThemeState(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
      try {
        window.localStorage.setItem("insight-theme", nextTheme);
      } catch {
        // The visible selection still applies when browser storage is unavailable.
      }
    },
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
