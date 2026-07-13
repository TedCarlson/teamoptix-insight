import DocumentEditorPage from "@/features/legal/pages/DocumentEditorPage";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ documentKey: string }>;
}) {
  const { documentKey } = await params;
  return <DocumentEditorPage documentKey={decodeURIComponent(documentKey)} />;
}
