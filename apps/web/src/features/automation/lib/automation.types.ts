export type AutomationProviderKey = "FEDEX";

export type AutomationStatus = "NOT_CONFIGURED" | "HEALTHY" | "WARNING" | "DISABLED";

export type AutomationRunType =
  | "TEST_CONNECTION"
  | "DSW_TARGET_DATE"
  | "DSW_HISTORICAL_SWEEP"
  | "DSW_DAILY"
  | "FCC_DAILY";

export type AutomationRunStatus = "QUEUED" | "RUNNING" | "SUCCESS" | "WARNING" | "FAILED" | "DISABLED";
