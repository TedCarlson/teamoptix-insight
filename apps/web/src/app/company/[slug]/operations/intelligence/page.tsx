import { redirect } from "next/navigation";

export default async function IntelligenceRedirectPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  redirect(`/company/${slug}/operations/planning`);
}
