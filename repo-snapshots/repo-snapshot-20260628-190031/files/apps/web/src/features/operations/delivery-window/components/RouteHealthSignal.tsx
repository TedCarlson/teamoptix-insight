import Image from "next/image";
import type { FccRouteHealth } from "../lib/fccRouteHealth";

const iconByStatus = {
  healthy: "/icons/route-health/healthy.svg",
  caution: "/icons/route-health/caution.svg",
  critical: "/icons/route-health/critical.svg",
  nosignal: "/icons/route-health/nosignal.svg",
} satisfies Record<FccRouteHealth["status"], string>;

export default function RouteHealthSignal(props: { health: FccRouteHealth }) {
  const { health } = props;

  return (
    <span
      title={health.tooltip}
      aria-label={health.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: 10,
        border: "1px solid #e6edf5",
        background: "#fff",
      }}
    >
      <Image
        src={iconByStatus[health.status]}
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        style={{ display: "block" }}
      />
    </span>
  );
}
