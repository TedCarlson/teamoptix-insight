import { redirect } from "next/navigation";

export default async function ItfCompanyPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  redirect(`/insight/telecom-fulfillment/${slug}`);
}
