import { notFound } from "next/navigation";
import DocumentEditorPage from "@/features/legal/pages/DocumentEditorPage";

export const dynamic = "force-dynamic";

const documentKeyBySlug: Record<string, string> = {
  "master-service-agreement": "MASTER_SERVICE_AGREEMENT",
  "statement-of-work": "STATEMENT_OF_WORK",
  "data-processing-addendum": "DATA_PROCESSING_ADDENDUM",
  "acceptable-use-policy": "ACCEPTABLE_USE_POLICY",
};

export default async function Page({
  params,
}: {
  params: Promise<{ documentSlug: string }>;
}) {
  const { documentSlug } = await params;
  const documentKey = documentKeyBySlug[documentSlug];

  if (!documentKey) notFound();

  return <DocumentEditorPage documentKey={documentKey} />;
}
