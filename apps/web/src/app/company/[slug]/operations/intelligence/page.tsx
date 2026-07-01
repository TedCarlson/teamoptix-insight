import OperationsIntelligencePage from "@/features/operations-intelligence/pages/OperationsIntelligencePage";

export default async function OperationsIntelligenceRoute(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  return <OperationsIntelligencePage slug={slug} />;
}
