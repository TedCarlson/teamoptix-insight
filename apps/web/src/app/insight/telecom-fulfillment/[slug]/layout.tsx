import { notFound } from "next/navigation";
import { resolveItfWorkspaceContext } from "@/features/insight-telecom/access/itfWorkspaceContext.server";
import ItfWorkspaceShell from "@/features/insight-telecom/components/ItfWorkspaceShell";

export default async function TelecomFulfillmentLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const context = await resolveItfWorkspaceContext(slug);

  if (!context?.can_enter) notFound();

  return <ItfWorkspaceShell context={context}>{props.children}</ItfWorkspaceShell>;
}
