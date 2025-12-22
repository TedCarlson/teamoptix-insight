// lib/ui.ts
import type React from "react";

export const UI = {
  fontSize: {
    body: 14,
    primary: 14,
    pill: 12,
    small: 11,
  },
  fontWeight: {
    normal: 600,
    strong: 800,
    bold: 900,
  },
  pill: {
    paddingY: 6,
    paddingX: 10,
    radius: 999,
    border: "1px solid #ddd",
  },
  card: {
    radius: 12,
    border: "1px solid #ddd",
    padding: 10,
  },
  page: {
    padding: 16,
    maxWidth: 1100,
  },
} as const;

export function pillBase(extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: `${UI.pill.paddingY}px ${UI.pill.paddingX}px`,
    borderRadius: UI.pill.radius,
    border: UI.pill.border,
    fontSize: UI.fontSize.pill,
    lineHeight: "16px",
    fontWeight: UI.fontWeight.bold,
    whiteSpace: "nowrap",
    ...extra,
  };
}

export function cardBase(extra?: React.CSSProperties): React.CSSProperties {
  return {
    padding: UI.card.padding,
    border: UI.card.border,
    borderRadius: UI.card.radius,
    ...extra,
  };
}

/**
 * PageShell: uniform page spacing + width.
 * Non-breaking: only applies where explicitly used.
 */
export function PageShell(props: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        padding: UI.page.padding,
        maxWidth: UI.page.maxWidth,
        margin: "0 auto",
        ...props.style,
      }}
    >
      {props.children}
    </div>
  );
}

/**
 * SectionBox: uniform “placeholder box” used for landing pages.
 * Use `hint` to show what will eventually render here.
 */
export function SectionBox(props: {
  title: string;
  hint?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <section
      style={cardBase({
        padding: 14,
        marginTop: 12,
        ...props.style,
      })}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: UI.fontWeight.bold }}>
          {props.title}
        </h2>
        {props.hint ? (
          <span style={{ fontSize: UI.fontSize.small, opacity: 0.7 }}>
            {props.hint}
          </span>
        ) : null}
      </div>

      {props.children ? (
        <div style={{ marginTop: 10 }}>{props.children}</div>
      ) : (
        <div style={{ marginTop: 10, fontSize: UI.fontSize.body, opacity: 0.75 }}>
          Placeholder
        </div>
      )}
    </section>
  );
}
