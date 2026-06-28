import CompanyAssetsPageShell from "@/features/company/assets/CompanyAssetsPageShell";

export default async function AssetAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <CompanyAssetsPageShell
      title="Asset Audit"
      description="Verify custody, asset health, returns, repair needs, and recovery status."
    >
      <article className="app-card" style={{ padding: 14 }}>
        <p className="value-card__eyebrow">Asset audit</p>
        <h2 className="app-card__title" style={{ fontSize: 18 }}>Custody Verification</h2>
        <p className="app-card__body" style={{ marginTop: 8 }}>
          Stubbed. Next wiring: assigned assets by driver, verification outcomes, health status, and recovery workflow.
        </p>
      </article>
    </CompanyAssetsPageShell>
  );
}
