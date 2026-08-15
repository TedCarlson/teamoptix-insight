import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCompanyPayrollConfig } from "@/features/payroll/lib/payroll.config";
import { isDriverType } from "@/features/payroll/lib/payroll.classification";
import {
  composePayrollReportRecipients,
  isPayrollRecipientEmail,
} from "@/features/payroll/lib/payrollReportRecipients";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function aliasKey(value: unknown) {
  const raw = String(value ?? "").toUpperCase().trim();
  if (!raw) return "";

  if (raw.includes(",")) {
    const [lastRaw, restRaw = ""] = raw.split(",");
    const last =
      lastRaw.replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] ?? "";
    const first =
      restRaw.replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] ?? "";

    return last && first ? `${last}|${first}` : "";
  }

  const parts = raw
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return parts.length >= 2
    ? `${parts[parts.length - 1]}|${parts[0]}`
    : "";
}


export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const body = await req.json().catch(() => ({}));

    const weekEnd = String(body.weekEnd ?? "").trim();
    const reportMemo = String(body.memo ?? "").trim().slice(0, 4000);
    const summary = Array.isArray(body.summary) ? body.summary : [];
    const groupedSummaryRows = Array.isArray(body.groupedSummaryRows)
      ? body.groupedSummaryRows
      : [];
    const optionalRecipients = Array.isArray(body.recipients)
      ? body.recipients.map((email: unknown) => String(email).trim()).filter(Boolean)
      : [];

    if (!weekEnd) {
      return NextResponse.json({ error: "weekEnd is required." }, { status: 400 });
    }

    if (!summary.length) {
      return NextResponse.json({ error: "Payroll summary is empty." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Signed-in user not found." }, { status: 401 });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, contact_email")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const authorizedOperatorEmail = String(company.contact_email ?? "").trim();
    if (!isPayrollRecipientEmail(authorizedOperatorEmail)) {
      return NextResponse.json(
        { error: "The Authorized Operator email is not configured in Company Profile." },
        { status: 400 }
      );
    }

    const invalidOptionalRecipients = optionalRecipients.filter(
      (email: string) => !isPayrollRecipientEmail(email)
    );
    if (invalidOptionalRecipients.length) {
      return NextResponse.json(
        {
          error: `Check the additional email address${
            invalidOptionalRecipients.length === 1 ? "" : "es"
          }: ${invalidOptionalRecipients.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const { data: persistedMemos, error: memoError } = await supabase.rpc(
      "list_company_payroll_summary_memos",
      {
        p_company_slug: slug,
        p_week_end_date: weekEnd,
      }
    );

    if (memoError) {
      return NextResponse.json({ error: memoError.message }, { status: 500 });
    }

    const payrollMemoByRosterId = new Map<string, string>();
    for (const row of persistedMemos ?? []) {
      if (row.roster_member_id && row.memo) {
        payrollMemoByRosterId.set(String(row.roster_member_id), String(row.memo));
      }
    }

    const weekStart = addDays(weekEnd, -6);

    const { data: unmatchedFacts, error: unmatchedError } = await supabase.rpc(
      "list_payroll_dsw_unmatched",
      {
        p_company_id: company.id,
        p_start_date: weekStart,
        p_end_date: weekEnd,
      }
    );

    if (unmatchedError) {
      return NextResponse.json({ error: unmatchedError.message }, { status: 500 });
    }

    const { data: rosterRows, error: rosterError } = await supabase
      .from("company_roster_view")
      .select("roster_member_id, dswid, worker_type")
      .eq("company_id", company.id);

    if (rosterError) {
      return NextResponse.json({ error: rosterError.message }, { status: 500 });
    }

    const resolvedAliases = new Set<string>();

    for (const row of rosterRows ?? []) {
      const resolvedKey = aliasKey(row.dswid);
      if (resolvedKey) resolvedAliases.add(resolvedKey);
    }

    const unresolvedAliases = new Set<string>();

    for (const row of unmatchedFacts ?? []) {
      const name = String(row.person_name ?? "").trim();
      if (!name) continue;

      const unresolvedKey = aliasKey(name);
      if (!unresolvedKey || resolvedAliases.has(unresolvedKey)) continue;

      unresolvedAliases.add(name);
    }

    if (unresolvedAliases.size > 0) {
      return NextResponse.json(
        {
          error:
            `Resolve ${unresolvedAliases.size} alias review item${
              unresolvedAliases.size === 1 ? "" : "s"
            } before sending payroll.`,
          alias_count: unresolvedAliases.size,
        },
        { status: 409 }
      );
    }

    const payrollConfig = await getCompanyPayrollConfig(slug);

    const rosterWorkerTypeById = new Map<string, string | null>();

    for (const row of rosterRows ?? []) {
      if (row.roster_member_id) {
        rosterWorkerTypeById.set(
          String(row.roster_member_id),
          row.worker_type ?? null
        );
      }
    }

    const recipients = composePayrollReportRecipients(
      authorizedOperatorEmail,
      optionalRecipients
    );

    const resendApiKey = requireEnv("RESEND_API_KEY");
    const emailFrom = requireEnv("RESEND_FROM_EMAIL");
    const emailFromName = process.env.RESEND_FROM_NAME?.trim() || "Insight";

    const cleanGroups = (groupedSummaryRows.length
      ? groupedSummaryRows
      : [{ group: "Payroll Summary", rows: summary }]
    )
      .map((group: any) => {
        const rows = Array.isArray(group.rows) ? group.rows : [];

        const cleanRows = rows
          .filter((row: any) => {
            const name = String(row.person_name ?? "").trim().toLowerCase();
            const total = Number(row.estimated_total ?? 0);

            if (!row.roster_member_id) return false;
            if (!name || name === "unmatched") return false;
            if (String(group.group ?? "").toLowerCase().includes("unmatched")) return false;

            if (
              !payrollConfig.include_non_driver_workers &&
              !isDriverType(
                rosterWorkerTypeById.get(String(row.roster_member_id))
              )
            ) {
              return false;
            }

            return total !== 0;
          })
          .map((row: any) => ({
            ...row,
            memo:
              payrollMemoByRosterId.get(String(row.roster_member_id)) ?? null,
          }));

        const groupTotal = cleanRows.reduce(
          (sum: number, row: any) => sum + Number(row.estimated_total ?? 0),
          0
        );

        if (String(group.group ?? "").toLowerCase().startsWith("other") && groupTotal === 0) {
          return null;
        }

        return {
          group: String(group.group ?? "Payroll Summary"),
          rows: cleanRows,
          total: groupTotal,
        };
      })
      .filter(Boolean);

    const labelForGroup = (value: string) =>
      value
        .replace("Drivers · Active", "Driver - Active")
        .replace("Drivers · Trainee", "Driver - Trainee")
        .replace("Drivers · Former", "Driver - Former")
        .replace("Other · Active", "Other - Active")
        .replace("Other · Trainee", "Other - Trainee")
        .replace("Other · Former / unmatched", "Other - Former");

    const groupHtml = cleanGroups
      .map((group: any) => {
        const rowsHtml = group.rows
          .map((row: any) => `
            <tr>
              <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.person_name)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;color:#475569;">${escapeHtml(row.memo || "—")}</td>
              <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(row.days_worked)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(row.daily_pay_total)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(row.threshold_pay_total)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(row.adjustment_total ?? 0)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;">${money(row.estimated_total)}</td>
            </tr>
          `)
          .join("");

        if (!rowsHtml) return "";

        return `
          <h3 style="margin:18px 0 8px;font-size:15px;color:#0f172a;">${escapeHtml(labelForGroup(group.group))}</h3>
          <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:8px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px;text-align:left;border-bottom:1px solid #cbd5e1;">Employee</th>
                <th style="padding:8px;text-align:left;border-bottom:1px solid #cbd5e1;">Memo</th>
                <th style="padding:8px;text-align:right;border-bottom:1px solid #cbd5e1;">Days</th>
                <th style="padding:8px;text-align:right;border-bottom:1px solid #cbd5e1;">Base Pay</th>
                <th style="padding:8px;text-align:right;border-bottom:1px solid #cbd5e1;">Threshold Pay</th>
                <th style="padding:8px;text-align:right;border-bottom:1px solid #cbd5e1;">Adjustments</th>
                <th style="padding:8px;text-align:right;border-bottom:1px solid #cbd5e1;">Total Earnings</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `;
      })
      .join("");

    const shippedRows = cleanGroups.reduce(
      (sum: number, group: any) => sum + group.rows.length,
      0
    );
    const estimatedPayroll = cleanGroups.reduce(
      (sum: number, group: any) =>
        sum + group.rows.reduce((inner: number, row: any) => inner + Number(row.estimated_total ?? 0), 0),
      0
    );
    const estimatedThresholdPay = cleanGroups.reduce(
      (sum: number, group: any) =>
        sum + group.rows.reduce((inner: number, row: any) => inner + Number(row.threshold_pay_total ?? 0), 0),
      0
    );
    const dailyPayTotal = cleanGroups.reduce(
      (sum: number, group: any) =>
        sum + group.rows.reduce((inner: number, row: any) => inner + Number(row.daily_pay_total ?? 0), 0),
      0
    );
    const adjustmentTotal = cleanGroups.reduce(
      (sum: number, group: any) =>
        sum + group.rows.reduce((inner: number, row: any) => inner + Number(row.adjustment_total ?? 0), 0),
      0
    );

    const html = `
      <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:880px;margin:0 auto;">
        <div style="border-bottom:1px solid #e5e7eb;padding-bottom:14px;margin-bottom:14px;">
          <div style="font-size:20px;font-weight:950;letter-spacing:.01em;color:#0f172a;">Insight</div>
          <h2 style="margin:10px 0 4px;font-size:22px;">Payroll Summary</h2>
          <div style="font-size:14px;font-weight:700;color:#334155;">Beacon Point Ventures</div>
          <div style="font-size:13px;color:#64748b;margin-top:8px;">
            Week Ending<br />
            <strong style="color:#0f172a;">${escapeHtml(weekEnd)}</strong>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px;">
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;font-weight:700;">Payroll rows</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${shippedRows}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;font-weight:700;">Base pay</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${money(dailyPayTotal)}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;font-weight:700;">Threshold pay</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${money(estimatedThresholdPay)}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;font-weight:700;">Adjustments</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${money(adjustmentTotal)}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;font-weight:700;">Estimated payroll</td>
            <td colspan="3" style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:900;">${money(estimatedPayroll)}</td>
          </tr>
        </table>

        ${reportMemo ? `
          <div style="border:1px solid #dbe6f3;border-radius:10px;background:#f8fafc;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.5;color:#334155;">
            ${escapeHtml(reportMemo).replaceAll("\n", "<br />")}
          </div>
        ` : ""}

        ${groupHtml}

        <p style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:12px;color:#64748b;font-size:12px;">
          Payroll report delivered to you by Insight.
        </p>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${emailFromName} <${emailFrom}>`,
        to: recipients,
        subject: `Payroll Summary · Week Ending ${weekEnd}`,
        html,
      }),
    });

    const resendJson = await resendResponse.json().catch(() => null);

    if (!resendResponse.ok) {
      return NextResponse.json(
        { error: resendJson?.message ?? "Failed to send payroll email." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, recipients, resend_id: resendJson?.id ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payroll email failed." },
      { status: 500 }
    );
  }
}
