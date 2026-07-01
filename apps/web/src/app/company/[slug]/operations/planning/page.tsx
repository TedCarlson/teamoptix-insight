import { redirect } from "next/navigation";

export default async function PlanningRedirectPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  redirect(`/company/${slug}/operations/intelligence`);
}
