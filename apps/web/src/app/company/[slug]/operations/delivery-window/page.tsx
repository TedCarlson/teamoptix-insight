import DeliveryWindowPage from "@/features/operations/delivery-window/DeliveryWindowPage";

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <DeliveryWindowPage slug={slug} serviceDate={todayIso()} />;
}
