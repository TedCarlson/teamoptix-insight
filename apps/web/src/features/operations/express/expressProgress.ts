export type ExpressProgress = {
  total: number;
  complete: number;
  attempted: number;
  open: number;
};

export type ExpressDataHealth = {
  trackingIdentityMissing: number;
  stopLinkMissing: number;
  stopLinkAmbiguous: number;
  referenceMatchAvailable: boolean;
  allCodesAvailable: boolean;
  evidenceSnapshotGeneratedAt: string | null;
};

export function emptyExpressProgress(): ExpressProgress {
  return { total: 0, complete: 0, attempted: 0, open: 0 };
}

export function normalizeExpressProgress(
  value: Partial<ExpressProgress> | null | undefined
): ExpressProgress {
  const number = (input: unknown) => {
    const parsed = Number(input ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const complete = number(value?.complete);
  const attempted = number(value?.attempted);
  const open = number(value?.open);
  return {
    total: complete + attempted + open,
    complete,
    attempted,
    open,
  };
}
