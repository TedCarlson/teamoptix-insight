export type LobKey = "last_mile";

export type IndustryKey = "logistics";

export type LobContextState = {
  lob_key: LobKey;
  lob_label: string;
  industry_key: IndustryKey;
  industry_label: string;
};