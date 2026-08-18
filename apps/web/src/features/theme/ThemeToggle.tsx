"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, setPreference, saving, ready } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const Icon = !ready ? Monitor : theme === "dark" ? Sun : Moon;
  const label = !ready ? "Appearance" : theme === "dark" ? "Light" : "Dark";
  const actionLabel = !ready ? "Appearance preference" : `Switch to ${nextTheme} theme`;

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={actionLabel}
      title={actionLabel}
      disabled={saving || !ready}
      onClick={() => setPreference(nextTheme)}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
