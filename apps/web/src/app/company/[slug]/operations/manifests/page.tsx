import { redirect } from "next/navigation";

export default async function ManifestHistoryPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  redirect(`/company/${slug}/operations/service`);
}
