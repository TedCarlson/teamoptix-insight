import Image from "next/image";
import type { FccRouteHealth } from "../lib/fccRouteHealth";

const iconByStatus = {
  healthy: "/icons/route-health/healthy.svg",
  caution: "/icons/route-health/caution.svg",
  critical: "/icons/route-health/critical.svg",
  nosignal: "/icons/route-health/nosignal.svg",
} satisfies Record<FccRouteHealth["status"], string>;

type RouteHealthSignalProps = {
  health: FccRouteHealth;
  onClick?: () => void;
  title?: string;
  label?: string;
};

export default function RouteHealthSignal(props: RouteHealthSignalProps) {
  const { health, onClick, title, label } = props;

  const content = (
    <>
      <Image
        src={iconByStatus[health.status]}
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        style={{ display: "block" }}
      />
      {label ? <span style={{ fontSize: 10, fontWeight: 900 }}>{label}</span> : null}
    </>
  );

  const sharedStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: label ? "100%" : 30,
    height: 30,
    gap: label ? 5 : 0,
    borderRadius: 10,
    border: "1px solid #e6edf5",
    background: "#fff",
  } as const;

  if (onClick) {
    return (
      <button
        className="route-health-signal"
        type="button"
        title={title ?? health.tooltip}
        aria-label={title ?? health.label}
        onClick={onClick}
        style={{
          ...sharedStyle,
          padding: label ? "0 8px" : 0,
          cursor: "pointer",
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className="route-health-signal"
      title={title ?? health.tooltip}
      aria-label={title ?? health.label}
      style={sharedStyle}
    >
      {content}
    </span>
  );
}
