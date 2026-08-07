export const PEAK_HISTORICAL_CONTEXT = {
  reportingWindow: "2016-2026",
  version: "2026.1",
  reviewed: "Aug 2026",
  demandBands: [
    {
      label: "Early / light Peak",
      multiplier: "1.10-1.25x",
      note: "Initial holiday build",
      tone: "light",
    },
    {
      label: "Sustained Peak",
      multiplier: "1.25-1.50x",
      note: "Primary planning range",
      tone: "sustained",
    },
    {
      label: "Heavy Peak week",
      multiplier: "1.50-1.75x",
      note: "High concentration stress",
      tone: "heavy",
    },
    {
      label: "Extreme Peak day",
      multiplier: "2.00x+",
      note: "Contingency ceiling",
      tone: "extreme",
    },
  ],
  sources: [
    "FedEx Newsroom Peak reporting (2016, 2017, 2019, 2020)",
    "FedEx demand-surcharge framework (2026)",
    "2024 carrier-capacity reporting",
  ],
} as const;
