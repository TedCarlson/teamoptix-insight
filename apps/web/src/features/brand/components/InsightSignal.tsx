import Image from "next/image";

export type InsightSignalPhase =
  | "default"
  | "prospect"
  | "implementation"
  | "go_live_ready"
  | "active"
  | "attention"
  | "action_required";

type InsightSignalProps = {
  phase?: InsightSignalPhase;
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
};

const SIZE_MAP = {
  sm: 40,
  md: 56,
  lg: 72,
} as const;

export default function InsightSignal({
  phase = "default",
  size = "md",
  showWordmark = false,
  className,
}: InsightSignalProps) {
  const imageSize = SIZE_MAP[size];

  return (
    <div
      className={className}
      data-insight-phase={phase}
      style={signalShell}
      aria-label={`Insight status: ${formatPhase(phase)}`}
    >
      <Image
        src="/icons/logo-2-insight-cutout.png"
        alt="Insight"
        width={imageSize}
        height={imageSize}
        priority={size === "lg"}
        style={{
          width: imageSize,
          height: "auto",
          objectFit: "contain",
        }}
      />

      {showWordmark ? (
        <div style={wordmarkShell}>
          <strong style={wordmark}>Insight</strong>
          <span style={byline}>by Team Optix</span>
        </div>
      ) : null}
    </div>
  );
}

function formatPhase(value: InsightSignalPhase) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const signalShell = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
};

const wordmarkShell = {
  display: "grid",
  gap: 1,
};

const wordmark = {
  color: "#0f172a",
  fontSize: 18,
  lineHeight: 1,
  letterSpacing: "-0.03em",
};

const byline = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.04em",
};
