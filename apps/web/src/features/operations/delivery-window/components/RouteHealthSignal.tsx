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
};

export default function RouteHealthSignal(props: RouteHealthSignalProps) {
  const { health, onClick, title } = props;

  const content = (
    <Image
      src={iconByStatus[health.status]}
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      style={{ display: "block" }}
    />
  );

  const sharedStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
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
          padding: 0,
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
