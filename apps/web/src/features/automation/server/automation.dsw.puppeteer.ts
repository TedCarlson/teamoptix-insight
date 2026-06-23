import Browserbase from "@browserbasehq/sdk";
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer-core";
import { saveFirstBrowserbaseDownloadZipEntry } from "./browserbase.downloads";

const FEDEX_LOGIN_URL = "https://mybizaccount.fedex.com/my.policy";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bodyText(frameOrPage: Frame | Page) {
  return frameOrPage.evaluate(() => document.body?.innerText ?? "").catch(() => "");
}

async function clickFirst(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        return true;
      }
    } catch {}
  }
  return false;
}

async function fillFirst(page: Page, selectors: string[], value: string) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click({ count: 3 });
        await el.type(value, { delay: 15 });
        return true;
      }
    } catch {}
  }
  return false;
}

async function clickLinkByText(frame: Frame | Page, pattern: RegExp) {
  return frame.evaluate((source) => {
    const regex = new RegExp(source, "i");
    const links = Array.from(document.querySelectorAll("a, button, input[type='submit'], input[type='button']"));
    const target = links.find((el) => regex.test((el.textContent || el.getAttribute("value") || "").trim()));
    if (target instanceof HTMLElement) {
      target.click();
      return true;
    }
    return false;
  }, pattern.source).catch(() => false);
}

async function login(page: Page, username: string, password: string) {
  await page.goto(FEDEX_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);

  await clickFirst(page, [
    "input.credentials_input_submit",
    "input[type='submit'][value='Sign In']",
    "input[value='Sign In']",
    "button[type='submit']",
  ]);

  await clickLinkByText(page, /sign in/);
  await sleep(3000);

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
  ]);
  await clickLinkByText(page, /next|continue/);

  await sleep(3500);

  const passwordFilled = await fillFirst(page, [
    "input[name='credentials.passcode']",
    "input[name='password']",
    "input[type='password']",
  ], password);

  if (!passwordFilled) throw new Error("Could not locate password field.");

  await clickFirst(page, [
    "input[type='submit']",
    "button[type='submit']",
  ]);
  await clickLinkByText(page, /verify|sign in|continue/);

  await sleep(10000);
  await page.waitForSelector("a#PT_HOME", { timeout: 45000 });
}

async function findFccLinksFrame(page: Page): Promise<Frame | null> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    for (const frame of page.frames()) {
      const name = frame.name();
      const url = frame.url();

      if (name.includes("FCC") || url.toLowerCase().includes("fcc")) return frame;

      const text = await bodyText(frame);
      if (text.includes("FedEx Customer Connection") || text.includes("Daily Service Wk")) return frame;
    }

    await sleep(2500);
  }

  return null;
}

async function findDswPage(browser: Browser, parentPage: Page) {
  for (const candidate of await browser.pages()) {
    if (candidate === parentPage) continue;

    const url = candidate.url();
    const title = await candidate.title().catch(() => "");
    const text = await bodyText(candidate);

    if (
      url.includes("/mgba/dsw") ||
      title.toLowerCase().includes("daily service") ||
      text.toLowerCase().includes("daily service worksheet")
    ) {
      return candidate;
    }
  }

  return null;
}

async function clickLastSelector(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    try {
      const els = await page.$$(selector);
      const el = els.at(-1);
      if (el) {
        await el.click();
        return true;
      }
    } catch {}
  }
  return false;
}

export async function discoverFedExNavigationPuppeteer(input: {
  username: string;
  password: string;
  serviceDate?: string;
}) {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (!apiKey) throw new Error("Missing BROWSERBASE_API_KEY.");
  if (!projectId) throw new Error("Missing BROWSERBASE_PROJECT_ID.");

  const bb = new Browserbase({ apiKey });
  const session = await bb.sessions.create({ projectId });

  const browser = await puppeteer.connect({ browserWSEndpoint: session.connectUrl });

  try {
    const page = await browser.newPage();

    await login(page, input.username, input.password);

    const fccFrame = await findFccLinksFrame(page);
    if (!fccFrame) {
      return {
        ok: false,
        stage: "fcc_frame",
        parentUrl: page.url(),
        message: "Could not locate FCC Links iframe/frame.",
      };
    }

    const clickedDailyService = await clickLinkByText(fccFrame, /Daily Service Wk|Vision IBPR|Daily Service/);
    if (!clickedDailyService) {
      return {
        ok: false,
        stage: "daily_service_link",
        parentUrl: page.url(),
        frameUrl: fccFrame.url(),
        frameTextPreview: (await bodyText(fccFrame)).slice(0, 1500),
        message: "FCC Links frame found, but Daily Service Wk & Vision IBPR link was not found.",
      };
    }

    await sleep(12000);

    let dswPage = await findDswPage(browser, page);
    if (!dswPage) {
      await sleep(8000);
      dswPage = await findDswPage(browser, page);
    }

    if (!dswPage) {
      return {
        ok: false,
        stage: "dsw_page",
        parentUrl: page.url(),
        message: "Daily Service link clicked, but DSW page was not detected.",
      };
    }

    await dswPage.waitForSelector("input.formField-header, input[class*='formField-header']", { timeout: 60000 });
    await dswPage.waitForSelector("select#facilitySelect", { timeout: 60000 });
    await sleep(5000);

    const clickedExcel = await clickLastSelector(dswPage, [
      "img.downloadIcon[alt='Excel']",
      "download-icon img[alt='Excel']",
      "img[alt='Excel']",
      "[src*='excel' i]",
      "[title*='excel' i]",
    ]);

    if (!clickedExcel) {
      return {
        ok: false,
        stage: "excel_icon",
        dswUrl: dswPage.url(),
        dswTitle: await dswPage.title().catch(() => ""),
        bodyPreview: (await bodyText(dswPage)).slice(0, 1500),
        message: "DSW page opened, but Excel icon was not found.",
      };
    }

    await sleep(10000);
    await browser.close().catch(() => undefined);

    const response = await bb.sessions.downloads.list(session.id);
    const zipBuffer = Buffer.from(await response.arrayBuffer());

    const saved = await saveFirstBrowserbaseDownloadZipEntry({
      zipBuffer,
      filenamePrefix: "dsw",
    });

    return {
      ok: true,
      stage: "today_dsw_excel_download",
      dswUrl: dswPage.url(),
      dswTitle: await dswPage.title().catch(() => ""),
      browserbaseSessionId: session.id,
      excelDownload: {
        suggestedFilename: saved.suggestedFilename,
        savedPath: saved.savedPath,
        failure: null,
      },
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
