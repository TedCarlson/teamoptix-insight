import PickupReconciliationPage from "@/features/operations/pickup-reconciliation/PickupReconciliationPage";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <PickupReconciliationPage slug={slug} />;
}
