export type TeamOptixSignal = {
  label: string;
  value: string;
  detail?: string;
};

export type TeamOptixRegistrySection = {
  key: string;
  eyebrow: string;
  title: string;
  signals: TeamOptixSignal[];
};
