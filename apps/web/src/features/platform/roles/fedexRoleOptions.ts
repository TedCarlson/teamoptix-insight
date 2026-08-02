export type FedExRoleOption = {
  key: string;
  label: string;
  value: string;
};

export const DEFAULT_FEDEX_ROLE = "Driver";

export const FEDEX_ROLE_OPTIONS: readonly FedExRoleOption[] = [
  { key: "driver", label: "Driver", value: "Driver" },
  { key: "jumper_helper", label: "Jumper / Helper", value: "Jumper / Helper" },
  { key: "lead_driver", label: "Lead Driver", value: "Lead Driver" },
  { key: "business_contact", label: "Business Contact", value: "Business Contact" },
  { key: "assistant_bc", label: "Assistant BC", value: "Assistant BC" },
  { key: "fleet_manager", label: "Fleet Manager", value: "Fleet Manager" },
  { key: "mechanic", label: "Mechanic", value: "Mechanic" },
  { key: "other", label: "Other", value: "Other" },
];

export function getFedExRoleOptions(
  currentValue?: string | null,
): readonly FedExRoleOption[] {
  const currentRole = currentValue?.trim();

  if (!currentRole || FEDEX_ROLE_OPTIONS.some((option) => option.value === currentRole)) {
    return FEDEX_ROLE_OPTIONS;
  }

  return [
    ...FEDEX_ROLE_OPTIONS,
    {
      key: `legacy:${currentRole}`,
      label: `${currentRole} (current)`,
      value: currentRole,
    },
  ];
}
