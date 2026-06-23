import { NextResponse } from "next/server";
import Browserbase from "@browserbasehq/sdk";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing BROWSERBASE_API_KEY." }, { status: 500 });
    }

    const bb = new Browserbase({ apiKey });
    const session = await bb.sessions.create({
      ...(projectId ? { projectId } : {}),
    });

    const browser = await puppeteer.connect({ browserWSEndpoint: session.connectUrl });
    const page = await browser.newPage();

    await page.setContent(`
      <html><body>
        <a id="download" download="teamoptix-browserbase-smoke.txt"
           href="data:text/plain;charset=utf-8,TeamOptix Browserbase download smoke">Download</a>
      </body></html>
    `);

    await page.click("#download");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await browser.close().catch(() => undefined);

    const downloads = await bb.sessions.downloads.list(session.id);

    return NextResponse.json({
      ok: true,
      provider: "BROWSERBASE",
      client: "puppeteer-core",
      session_id: session.id,
      downloads,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Browserbase download smoke failed." },
      { status: 500 }
    );
  }
}
