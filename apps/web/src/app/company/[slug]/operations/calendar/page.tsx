import OperationsCalendarPage from "@/features/operations-calendar/pages/OperationsCalendarPage";

function todayEasternIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function OperationsCalendarRoute(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  return <OperationsCalendarPage slug={slug} todayDate={todayEasternIso()} />;
}
