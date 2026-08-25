import ManifestHistoryReport from "@/features/operations/manifests/components/ManifestHistoryReport";

export default async function ManifestHistoryPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  return <ManifestHistoryReport slug={slug} />;
}
