import WalkOnsPage from "@/features/operations/walk-ons/WalkOnsPage";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <WalkOnsPage slug={slug} />;
}
