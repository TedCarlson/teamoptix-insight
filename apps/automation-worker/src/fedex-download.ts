import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Frame, type Page } from "playwright";

const FEDEX_LOGIN_URL = "https://mybizaccount.fedex.com/my.policy";
const DOWNLOAD_DIR = path.join(os.tmpdir(), "teamoptix-insight-worker", "automation-downloads");

async function clickFirst(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        await locator.click({ timeout: 5000 });
        return true;
      }
    } catch {}
  }
  return false;
}

async function fillFirst(page: Page, selectors: string[], value: string) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        await locator.fill(value, { timeout: 5000 });
        return true;
      }
    } catch {}
  }
  return false;
}

async function clickSignInFromMyBiz(page: Page) {
  const candidates = [
    page.locator("input.credentials_input_submit"),
    page.getByRole("button", { name: /sign in/i }),
    page.locator("input[type='submit'][value='Sign In']"),
    page.locator("input[value='Sign In']"),
    page.locator("button:has-text('Sign In')"),
    page.locator("text=Sign In"),
  ];

  for (const locator of candidates) {
    try {
      if ((await locator.count()) > 0) {
        await Promise.all([
          page.waitForURL((url) => url.toString().includes("purpleid.okta.com"), { timeout: 20000 }).catch(() => undefined),
          locator.first().click({ timeout: 5000 }),
        ]);
        return true;
      }
    } catch {}
  }

  return false;
}

async function login(page: Page, username: string, password: string) {
  await page.goto(FEDEX_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);

  await clickSignInFromMyBiz(page);
  await page.waitForTimeout(2500);

  const usernameFilled = await fillFirst(page, [
    "input[name='identifier']",
    "input[name='username']",
    "input[name='userName']",
    "input[name='login']",
    "input[type='email']",
    "input[type='text']",
  ], username);

  if (!usernameFilled) throw new Error("Could not locate username field.");

  await clickFirst(page, [
    "input[type='submit']",
    "button[type='submit']",
    "button:has-text('Next')",
    "button:has-text('Continue')",
  ]);

  await page.waitForTimeout(3000);

  const passwordFilled = await fillFirst(page, [
    "input[name='credentials.passcode']",
    "input[name='password']",
    "input[type='password']",
  ], password);

  if (!passwordFilled) throw new Error("Could not locate password field.");

  await clickFirst(page, [
    "input[type='submit']",
    "button[type='submit']",
    "button:has-text('Verify')",
    "button:has-text('Sign in')",
    "button:has-text('Continue')",
  ]);

  await page.waitForTimeout(8000);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
  await page.locator("a#PT_HOME").waitFor({ timeout: 30000 });
}

async function findFccLinksFrame(page: Page): Promise<Frame | null> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    for (const frame of page.frames()) {
      const name = frame.name();
      const url = frame.url();

      if (name.includes("FCC") || url.toLowerCase().includes("fcc")) return frame;

      const text = await frame.locator("body").innerText().catch(() => "");
      if (text.includes("FedEx Customer Connection") || text.includes("Daily Service Wk")) return frame;
    }

    await page.waitForTimeout(2500);
  }

  return null;
}

async function findDswPage(pages: Page[], parentPage: Page) {
  for (const candidate of pages) {
    if (candidate === parentPage) continue;

    const url = candidate.url();
    const title = await candidate.title().catch(() => "");
    const body = await candidate.locator("body").innerText().catch(() => "");

    if (
      url.includes("/mgba/dsw") ||
      title.toLowerCase().includes("daily service") ||
      body.toLowerCase().includes("daily service worksheet")
    ) {
      return candidate;
    }
  }

  return null;
}

async function createBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function downloadDswExcel(input: {
  username: string;
  password: string;
}) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const browser = await createBrowser();

  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    console.log("[DSW] login:start");
    await login(page, input.username, input.password);
    console.log("[DSW] login:done");

    console.log("[DSW] fcc-frame:start");
    const fccFrame = await findFccLinksFrame(page);
    console.log("[DSW] fcc-frame:done", Boolean(fccFrame));

    if (!fccFrame) {
      return {
        ok: false,
        stage: "fcc_frame",
        parentUrl: page.url(),
        message: "Could not locate FCC Links iframe/frame.",
      };
    }

    const dailyServiceLink = fccFrame
      .locator("a")
      .filter({ hasText: /Daily Service Wk|Vision IBPR|Daily Service/i })
      .first();

    if ((await dailyServiceLink.count()) === 0) {
      return {
        ok: false,
        stage: "daily_service_link",
        parentUrl: page.url(),
        frameUrl: fccFrame.url(),
        frameTextPreview: (await fccFrame.locator("body").innerText().catch(() => "")).slice(0, 1500),
        message: "FCC Links frame found, but Daily Service Wk & Vision IBPR link was not found.",
      };
    }

    await Promise.all([
      context.waitForEvent("page", { timeout: 30000 }).catch(() => null),
      dailyServiceLink.click({ timeout: 10000 }),
    ]);

    console.log("[DSW] daily-link:clicked");
    await page.waitForTimeout(10000);

    console.log("[DSW] dsw-page:find:start");
    let dswPage = await findDswPage(context.pages(), page);

    if (!dswPage) {
      await page.waitForTimeout(8000);
      dswPage = await findDswPage(context.pages(), page);
    }

    if (!dswPage) {
      return {
        ok: false,
        stage: "dsw_page",
        parentUrl: page.url(),
        message: "Daily Service link clicked, but DSW page was not detected.",
      };
    }

    await dswPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => undefined);
    await dswPage.waitForTimeout(7000);

    console.log("[DSW] dsw-page:ready-wait");
    await dswPage.locator("input.formField-header, input[class*=\'formField-header\']").first().waitFor({ timeout: 60000 });
    console.log("[DSW] dsw-page:ready");
    await dswPage.locator("select#facilitySelect").first().waitFor({ timeout: 60000 });

    const excelIcon = dswPage.locator("img.downloadIcon[alt='Excel'],download-icon img[alt='Excel'], img[alt='Excel']").last();

    if ((await excelIcon.count()) === 0) {
      return {
        ok: false,
        stage: "excel_icon",
        dswUrl: dswPage.url(),
        dswTitle: await dswPage.title().catch(() => ""),
        message: "DSW page opened, but Excel icon was not found.",
      };
    }

    console.log("[DSW] download:start");
    const [download] = await Promise.all([
      dswPage.waitForEvent("download", { timeout: 30000 }),
      excelIcon.click({ timeout: 10000 }),
    ]);

    const suggestedFilename = download.suggestedFilename();
    const savedPath = path.join(DOWNLOAD_DIR, `${Date.now()}-${suggestedFilename}`);

    await download.saveAs(savedPath);
    console.log("[DSW] download:saved", savedPath);

    return {
      ok: true,
      stage: "today_dsw_excel_download",
      dswUrl: dswPage.url(),
      dswTitle: await dswPage.title().catch(() => ""),
      excelDownload: {
        suggestedFilename,
        savedPath,
        failure: await download.failure(),
      },
    };
  } finally {
    await browser.close();
  }
}
