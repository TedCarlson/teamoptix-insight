import { redirect } from "next/navigation";

export default async function PeoplePage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  redirect(`/company/${slug}/people/roster`);
}
