"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useTheme, type InsightTheme } from "./ThemeProvider";

const options: Array<{
  value: InsightTheme;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
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
  const { theme, setTheme } = useTheme();

  return (
    <div className="appearance-settings" role="radiogroup" aria-label="Choose Insight appearance">
      {options.map(({ value, label, description, icon: Icon }) => {
        const selected = theme === value;
        return (
          <button
            className={`appearance-option${selected ? " appearance-option--selected" : ""}`}
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
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
  );
}
