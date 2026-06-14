import DeliveryWindowPage from "@/features/operations/delivery-window/DeliveryWindowPage";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <DeliveryWindowPage slug={slug} serviceDate={todayIso()} />;
}
