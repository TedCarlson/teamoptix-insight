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

    const browser = await puppeteer.connect({
      browserWSEndpoint: session.connectUrl,
    });

    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });

    const title = await page.title();

    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);

    return NextResponse.json({
      ok: true,
      provider: "BROWSERBASE",
      client: "puppeteer-core",
      session_id: session.id,
      title,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Browserbase smoke failed." },
      { status: 500 }
    );
  }
}
