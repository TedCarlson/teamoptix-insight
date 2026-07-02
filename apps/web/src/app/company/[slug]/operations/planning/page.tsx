import PlanningPage from "@/features/operations-intelligence/pages/OperationsIntelligencePage";

export default async function PlanningRoute(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  return <PlanningPage slug={slug} />;
}
