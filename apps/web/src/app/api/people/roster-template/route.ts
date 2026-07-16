import { NextResponse } from "next/server";

export const runtime = "nodejs";

const HEADERS = [
  "Roster Member ID",
  "Full Name",
  "Email",
  "Phone",
  "Date of Birth",
  "FX ID",
  "Role",
  "License Number",
  "Issuing State",
  "License Issue Date",
  "License Expiration Date",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State Region",
  "Postal Code",
  "Hire Date",
  "Separation Date",
  "DOT Expiration Date",
  "Qual Cert Expiration Date",
  "Daily Pay Rate",
  "Daily Pay Effective Date",
  "DSWID",
  "Scanner Serial",
  "Fuel Card",
  "PIN ID No",
  "Employment Status",
  "Market",
  "Job Title",
  "Notes",
];

const EXAMPLE = [
  "",
  "Alton Fletcher",
  "alton5437@gmail.com",
  "7068334802",
  "1993-10-16",
  "4861806",
  "Driver",
  "56060960",
  "GA",
  "",
  "",
  "5001 Charlie Drive",
  "",
  "Augusta",
  "GA",
  "30909",
  "2026-02-26",
  "",
  "2026-09-09",
  "2027-04-30",
  "150.00",
  "2026-02-26",
  "FLETCHER, ALTON",
  "",
  "",
  "",
  "Active",
  "249",
  "Driver",
  "",
];

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const TEMPLATE_CSV = [
  HEADERS.map(csvCell).join(","),
  EXAMPLE.map(csvCell).join(","),
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
