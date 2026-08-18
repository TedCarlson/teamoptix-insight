"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "./ThemeProvider";

const options: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    value: "system",
    label: "System",
    description: "Follow this device and change automatically with its appearance setting.",
    icon: Monitor,
  },
  {
    value: "light",
    label: "Light",
    description: "The familiar Insight workspace and default for every user.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Lower-light surfaces with the same layout and workflow hierarchy.",
    icon: Moon,
  },
];

export default function AppearanceSettings() {
  const { preference, setPreference, saving, error, profilePersistenceReady, ready } = useTheme();

  return (
    <div>
      <div className="appearance-settings" role="radiogroup" aria-label="Choose Insight appearance">
        {options.map(({ value, label, description, icon: Icon }) => {
          const selected = ready && preference === value;
          return (
            <button
              className={`appearance-option${selected ? " appearance-option--selected" : ""}`}
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving || !ready}
              onClick={() => setPreference(value)}
            >
              <span className="appearance-option__icon"><Icon aria-hidden="true" /></span>
              <span className="appearance-option__copy">
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <span className="appearance-option__check" aria-hidden="true">
                {selected ? <Check /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className={`appearance-settings__status${error ? " appearance-settings__status--error" : ""}`} aria-live="polite">
        {!ready
          ? "Loading your appearance preference…"
          : error
          ? `${error} The selection remains saved in this browser.`
          : profilePersistenceReady
            ? "This preference follows your signed-in profile across TeamOptix and company workspaces."
            : "Profile persistence is awaiting the approved database migration; this browser remembers your selection now."}
      </p>
    </div>
  );
}
