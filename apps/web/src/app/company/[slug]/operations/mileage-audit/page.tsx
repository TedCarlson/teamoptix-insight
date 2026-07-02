import MileageAuditPage from "@/features/operations/mileage-audit/pages/MileageAuditPage";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <MileageAuditPage slug={slug} />;
}
