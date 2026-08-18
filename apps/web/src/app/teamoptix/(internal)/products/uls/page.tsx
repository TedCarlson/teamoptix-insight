import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";

export default function UtilityLocateServiceProductPage() {
  return (
    <TeamOptixDomainOverview
      eyebrow="TeamOptix · Products · Planned"
      title="Utility Locate Service"
      description="A separate product boundary for future utility locate operations. This developer surface records the separation decision only; it does not create ULS workflows, roles, records, or database structures."
      metrics={[
        { label: "Product key", value: "ULS", detail: "Utility Locate Service" },
        { label: "Status", value: "Planned", detail: "No production implementation" },
        { label: "ITF governance", value: "None", detail: "No inherited telecom product access" },
        { label: "Database rows", value: 0, detail: "No seed or migration authorized" },
      ]}
      panels={[
        {
          eyebrow: "Boundary decision",
          title: "ULS remains outside ITF",
          rows: [
            {
              title: "Independent application governance",
              detail: "ULS will define its own navigation, roles, entitlements, operating scopes, and customer experience.",
              status: "Required",
              href: "/teamoptix/products/uls",
            },
            {
              title: "Independent data and reporting boundary",
              detail: "No ITF workforce, engagement, upload, metric, report, or warehouse record becomes ULS data by inheritance.",
              status: "Required",
              href: "/teamoptix/products/uls",
            },
            {
              title: "No donor assumptions",
              detail: "ULS domain fields and workflows will be designed from its own evidence in a future review event.",
              status: "Protected",
              href: "/teamoptix/products/uls",
            },
          ],
        },
        {
          eyebrow: "Permitted reuse",
          title: "Team Optix platform services only",
          rows: [
            {
              title: "Shared platform entry",
              detail: "Sign-in, profile, company selection, theme, and Team Optix provider oversight may remain common platform services.",
              status: "Shared",
              href: "/teamoptix/platform",
            },
            {
              title: "Commercial governance",
              detail: "Contracts, billing, and product entitlement infrastructure may be reused while ULS product authorization remains distinct.",
              status: "Shared",
              href: "/teamoptix/business/contracts",
            },
            {
              title: "Telecom Fulfillment review studio",
              detail: "Return to ITF without crossing product data or governance boundaries.",
              status: "Separate",
              href: "/teamoptix/products/itg",
            },
          ],
        },
      ]}
    />
  );
}
