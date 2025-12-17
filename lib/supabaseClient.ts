// app/api/pdf/kpi/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import puppeteer from "puppeteer";

export async function GET(req: NextRequest) {
  // ---- Hard-fail early (no silent weirdness) ----
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const TARGET_EMAIL = process.env.TARGET_EMAIL;

  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
  if (!TARGET_EMAIL) throw new Error("Missing TARGET_EMAIL");

  // ✅ Email is now an explicit, opt-in trigger
  const sendEmail = req.nextUrl.searchParams.get("email") === "1";

  // ---- v1 hardcoded scope (we’ll parameterize later) ----
  const region = "Keystone";
  const fiscalMonth = "2025-12-21"; // matches fiscal_month_anchor

  // ✅ Create supabase client only AFTER env checks
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ---- Fetch tech rows from PDF contract view (rank + region totals included) ----
  const { data: techRows, error: techErr } = await supabase
    .from("kpi_tech_kpis_pdf_v2")
    .select("*")
    .eq("region", region)
    .eq("fiscal_month_anchor", fiscalMonth)
    .order("tech_rank_in_region", { ascending: true })
    .order("tech_name", { ascending: true });

  if (techErr) {
    console.error("Tech KPI PDF view query error:", techErr);
    return NextResponse.json(
      { error: "Failed to load tech KPIs (PDF view)", details: techErr.message },
      { status: 500 }
    );
  }

  // ---- Fetch authoritative region KPIs (weighted) for meta row ----
  const { data: regionPdfKpis, error: regionPdfErr } = await supabase
    .from("kpi_region_kpis_pdf_v2")
    .select("*")
    .eq("region", region)
    .eq("fiscal_month_anchor", fiscalMonth)
    .single();

  if (regionPdfErr) {
    console.error("Region PDF KPI view error:", regionPdfErr);
    return NextResponse.json(
      { error: "Failed to load region PDF KPIs", details: regionPdfErr.message },
      { status: 500 }
    );
  }

  const safeTechRows = Array.isArray(techRows) ? techRows : [];

  // ---- Formatting helpers ----
  const fmt1 = (v: any) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return n.toFixed(1).replace(/\.0$/, "");
  };
  const fmtInt = (v: any) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return String(Math.round(n));
  };

  // ---- Rows: Tech | Rank | tNPS | FTR | Tool Usage | Total Jobs ----
  const rowsHtml =
    safeTechRows.length === 0
      ? `<tr><td colspan="6" class="empty">No tech KPI rows found for this scope.</td></tr>`
      : safeTechRows
          .map((t: any) => {
            const techId = String(t.tech_id ?? "").trim();
            const techNameRaw = String(t.tech_name ?? "").trim();
            const companyCode = String(t.c_code ?? "").trim();

            const techDisplay = [techId || null, techNameRaw || null, companyCode ? `(${companyCode})` : null]
              .filter(Boolean)
              .join(" ");

            const techName = escapeHtml(techDisplay);

            const rank = escapeHtml(fmtInt(t.tech_rank_in_region));
            const tnps = escapeHtml(fmt1(t.tnps_rate));
            const ftr = escapeHtml(fmt1(t.ftr_pct));
            const tool = escapeHtml(fmt1(t.tool_usage_pct));
            const totalJobs = escapeHtml(fmtInt(t.total_jobs));

            return `
              <tr>
                <td class="col-tech">${techName}</td>
                <td class="col-rank">${rank}</td>
                <td class="col-num">${tnps}</td>
                <td class="col-num">${ftr}</td>
                <td class="col-num">${tool}</td>
                <td class="col-num">${totalJobs}</td>
              </tr>
            `;
          })
          .join("");

  // ---- 4-block header placeholders (A/B/C/D) ----
  const headerA = `
    <div class="hdr-title">Regional Report</div>
    <div class="hdr-value">${escapeHtml(region)}</div>
    <div class="hdr-sub">${escapeHtml(fiscalLabel(fiscalMonth))}</div>
  `;

  const headerB = `
    <div class="hdr-title">Header B</div>
    <div class="hdr-value">—</div>
    <div class="hdr-sub">placeholder</div>
  `;

  const headerC = `
    <div class="hdr-title">Header C</div>
    <div class="hdr-value">—</div>
    <div class="hdr-sub">placeholder</div>
  `;

  const headerD = `
    <div class="hdr-title">Header D</div>
    <div class="hdr-value">—</div>
    <div class="hdr-sub">placeholder</div>
  `;

  const generatedAt = escapeHtml(new Date().toISOString());

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 16px; }
          body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            margin: 0;
            color: #111;
          }
          .wrap { padding: 16px; }

          .header-grid {
            display: grid;
            grid-template-columns: 1.2fr 1fr 1fr 1fr;
            gap: 10px;
            margin-bottom: 10px;
            align-items: stretch;
          }
          .hdr {
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 12px 12px 14px;
            height: 68px;
            box-sizing: border-box;
          }
          .hdr-title {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: #666;
            margin-bottom: 4px;
          }
          .hdr-value {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .hdr-sub {
            font-size: 10px;
            color: #444;
          }

          .meta-row {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1fr;
            gap: 10px;
            margin: 4px 0 10px 0;
            font-size: 10px;
            color: #222;
          }
          .meta-pill {
            border: 1px solid #eee;
            border-radius: 999px;
            padding: 6px 10px;
            display: inline-block;
            width: fit-content;
          }
          .meta-pill b { color: #000; }

          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          thead th {
            border-bottom: 2px solid #222;
            border-top: 1px solid #ddd;
            padding: 8px 8px;
            text-align: left;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          tbody td {
            border-bottom: 1px solid #eee;
            padding: 5px 6px;
            vertical-align: middle;
            word-wrap: break-word;
          }
          tbody tr:nth-child(even) { background: #fafafa; }

          .col-tech { width: 42%; }
          .col-rank { width: 8%; text-align: right; }
          .col-num  { width: 12.5%; text-align: right; }

          .empty {
            text-align: center;
            padding: 16px;
            color: #666;
          }
          .footer {
            margin-top: 10px;
            font-size: 9px;
            color: #555;
            line-height: 1.4;
          }
        </style>
      </head>

      <body>
        <div class="wrap">
          <div class="header-grid">
            <div class="hdr">${headerA}</div>
            <div class="hdr">${headerB}</div>
            <div class="hdr">${headerC}</div>
            <div class="hdr">${headerD}</div>
          </div>

          <div class="meta-row">
            <div class="meta-pill"><b>tNPS:</b> ${escapeHtml(fmt1(regionPdfKpis.tnps_rate))}</div>
            <div class="meta-pill"><b>FTR:</b> ${escapeHtml(fmt1(regionPdfKpis.ftr_pct))}</div>
            <div class="meta-pill"><b>Tool Usage:</b> ${escapeHtml(fmt1(regionPdfKpis.tool_usage_pct))}</div>
            <div class="meta-pill"><b>Headcount:</b> ${escapeHtml(String(regionPdfKpis.headcount))}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th class="col-tech">Tech</th>
                <th class="col-rank">Rank</th>
                <th class="col-num">tNPS</th>
                <th class="col-num">FTR</th>
                <th class="col-num">Tool Usage</th>
                <th class="col-num">Total Jobs</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            ***Metrics are pulled from Ontrac and may reflect errors due to delays with third party sources.
            <br/>
            Generated: ${generatedAt}
          </div>
        </div>
      </body>
    </html>
  `;

  // ---- Render PDF ----
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfUint8 = await page.pdf({
      format: "letter",
      landscape: true,
      printBackground: true,
    });

    const pdfBuffer = Buffer.from(pdfUint8);

    // ---- Send email only when explicitly requested ----
    if (sendEmail) {
      const resend = new Resend(RESEND_API_KEY);
      const sendResult = await resend.emails.send({
        from: "ITG Insight <noreply@teamoptix.io>",
        to: TARGET_EMAIL,
        subject: `KPI Report – ${region} – ${fiscalLabel(fiscalMonth)}`,
        text: `Attached is the KPI report for ${region}, ${fiscalLabel(
          fiscalMonth
        )}.\n\nInsight by Team Optix.`,
        attachments: [
          {
            filename: "kpi-report.pdf",
            content: pdfBuffer.toString("base64"),
          },
        ],
      });
      console.log("RESEND sendResult:", sendResult);
    } else {
      console.log("RESEND skipped (no ?email=1)");
    }

    // ---- Return PDF to browser ----
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="kpi-report.pdf"',
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } finally {
    await browser.close();
  }
}

// "Fiscal Dec 2025"
function fiscalLabel(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  return `Fiscal ${month} ${year}`;
}

// Minimal HTML escape so names don’t break markup
function escapeHtml(input: string) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
