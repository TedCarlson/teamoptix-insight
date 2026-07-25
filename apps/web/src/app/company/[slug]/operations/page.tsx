import OperationsWorkspacePage from "@/features/operations/workspace/OperationsWorkspacePage";

export default async function OperationsPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;

  return <OperationsWorkspacePage slug={slug} />;
}
