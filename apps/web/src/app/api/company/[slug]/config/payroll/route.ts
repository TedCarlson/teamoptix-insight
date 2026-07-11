import { NextResponse } from "next/server";
import { getCompanyPayrollConfig } from "@/features/payroll/lib/payroll.config";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const config = await getCompanyPayrollConfig(slug);

    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load payroll configuration.",
      },
      { status: 500 }
    );
  }
}
