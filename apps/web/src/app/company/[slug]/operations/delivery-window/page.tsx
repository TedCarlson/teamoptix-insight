import { redirect } from "next/navigation";

export default async function DeliveryWindowRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  redirect(`/company/${slug}/operations/service`);
}
