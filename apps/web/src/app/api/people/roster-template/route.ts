import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TEMPLATE_CSV = [
  [
    "Full Name",
    "Email",
    "Phone",
    "Role",
    "Market",
    "Start Date",
    "Status",
    "FX ID",
    "DSWID",
  ].join(","),
  [
    "Alton Fletcher",
    "alton5437@gmail.com",
    "7068334802",
    "Driver",
    "249",
    "2026-02-26",
    "Active",
    "4861806",
    "FLETCHER_ALTON",
  ].join(","),
  [
    "Taylor Morgan",
    "taylor@example.com",
    "5555555555",
    "Helper",
    "249",
    "2026-03-15",
    "Candidate",
    "",
    "MORGAN_TAYLOR",
  ].join(","),
].join("\n");

export async function GET() {
  return new NextResponse(TEMPLATE_CSV, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="insight_roster_template.csv"',
      "Cache-Control": "no-store",
    },
  });
}