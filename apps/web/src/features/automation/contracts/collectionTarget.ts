const RUNNER_TARGETS: Record<string, Record<string, unknown>> = {
  DSW: { key: "DSW_DAILY_SERVICE", label: "DSW · Daily Service Worksheet", artifact_key: "DSW", report_family_key: "DSW", runner_section: "DAILY_SERVICE", vps_target: 11, expected_filename_match: ["daily service worksheet", "PackageLevelDetails"] },
  FCC: { key: "FCC_WORK_AREA_SUMMARY", label: "FCC · Work Area Summary", artifact_key: "WORK_AREA_SUMMARY", report_family_key: "FCC", report_shape_key: "FCC_WORK_AREA_SUMMARY", runner_section: "SERVICE", vps_target: 5, expected_filename_match: ["ServiceAreaStatus", "SAStatus_"] },
  WORK_AREA_SUMMARY: { key: "FCC_WORK_AREA_SUMMARY", label: "FCC · Work Area Summary", artifact_key: "WORK_AREA_SUMMARY", report_family_key: "FCC", report_shape_key: "FCC_WORK_AREA_SUMMARY", runner_section: "SERVICE", vps_target: 5, expected_filename_match: ["ServiceAreaStatus", "SAStatus_"] },
  // Legacy templates are deliberately redirected away from the unsupported SA Summary export.
  SERVICE_AREA_SUMMARY: { key: "FCC_WORK_AREA_SUMMARY", label: "FCC · Work Area Summary", artifact_key: "WORK_AREA_SUMMARY", report_family_key: "FCC", report_shape_key: "FCC_WORK_AREA_SUMMARY", runner_section: "SERVICE", vps_target: 5, expected_filename_match: ["ServiceAreaStatus", "SAStatus_"] },
  DELIVERY_MANIFEST: { key: "P_AND_D_DELIVERY_MANIFEST", label: "P&D · Delivery Manifest", artifact_key: "DELIVERY_MANIFEST", report_family_key: "FCC", runner_section: "P_AND_D", vps_target: 2, expected_filename_match: ["DeliveryManifest"] },
  PICKUP_MANIFEST: { key: "P_AND_D_PICKUP_MANIFEST", label: "P&D · Pickup Manifest", artifact_key: "PICKUP_MANIFEST", report_family_key: "FCC", runner_section: "P_AND_D", vps_target: 1, expected_filename_match: ["PickupManifest", "PM"] },
};

export function normalizeCollectionTarget(target: any) {
  const artifactKey = String(target?.artifact_key ?? "").toUpperCase();
  const targetKey = String(target?.key ?? "").toUpperCase();
  const canonical = RUNNER_TARGETS[artifactKey]
    ?? (targetKey === "FCC_SERVICE_AREA" ? RUNNER_TARGETS.FCC : undefined)
    ?? Object.values(RUNNER_TARGETS).find((item) => item.key === targetKey);
  return canonical ? { ...target, ...canonical } : target;
}
