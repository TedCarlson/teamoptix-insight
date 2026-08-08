import OperationsWorkspace from "@/features/operations/workspace/OperationsWorkspace";

function todayEasternIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function OperationsLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { children, params } = props;
  const { slug } = await params;

  return (
    <OperationsWorkspace slug={slug} serviceDate={todayEasternIso()}>
      {children}
    </OperationsWorkspace>
  );
}
