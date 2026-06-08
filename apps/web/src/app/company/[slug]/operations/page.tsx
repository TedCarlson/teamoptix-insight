import { redirect } from "next/navigation";

export default async function OperationsPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  redirect(`/company/${slug}/operations/dispatch`);
}
