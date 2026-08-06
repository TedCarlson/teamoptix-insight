export type PriTier = "T1" | "T2" | "T3" | "T4";

export const PRI_WEIGHTS = {
  early: 225,
  late: 150,
  potentialMissed: 400,
} as const;

const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function priTier(value: number | null): PriTier | null {
  if (value == null) return null;
  if (value < 0.17) return "T4";
  if (value <= 0.72) return "T3";
  if (value <= 1.1) return "T2";
  return "T1";
}

export function calculatePickupReliability(input: {
  pickupStops: unknown;
  earlyPickups: unknown;
  latePickups: unknown;
  potentialMissedPickups: unknown;
  complete: boolean;
}) {
  const pickupStops = numeric(input.pickupStops);
  const earlyPickups = numeric(input.earlyPickups);
  const latePickups = numeric(input.latePickups);
  const potentialMissedPickups = numeric(input.potentialMissedPickups);
  const numerator =
    earlyPickups * PRI_WEIGHTS.early +
    latePickups * PRI_WEIGHTS.late +
    potentialMissedPickups * PRI_WEIGHTS.potentialMissed;
  const pri = input.complete && pickupStops > 0 ? numerator / pickupStops : null;

  return {
    pickupStops,
    earlyPickups,
    latePickups,
    potentialMissedPickups,
    complete: input.complete,
    numerator,
    pri,
    tier: priTier(pri),
  };
}
