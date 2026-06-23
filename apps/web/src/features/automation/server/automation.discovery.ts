import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Frame, type Page } from "playwright";

const FEDEX_LOGIN_URL = "https://mybizaccount.fedex.com/my.policy";
const DOWNLOAD_DIR = path.join(os.tmpdir(), "teamoptix-insight", "automation-downloads");

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

async function login(page: Page, username: string, password: string) {
  await page.goto(FEDEX_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);

  await clickSignInFromMyBiz(page);
  await page.waitForTimeout(2500);

  const usernameFilled = await fillFirst(
    page,
    [
      "input[name='identifier']",
      "input[name='username']",
      "input[name='userName']",
      "input[name='login']",
      "input[type='email']",
      "input[type='text']",
    ],
    username
  );

  if (!usernameFilled) throw new Error("Could not locate username field.");

  await clickFirst(page, [
    "input[type='submit']",
    "button[type='submit']",
    "button:has-text('Next')",
    "button:has-text('Continue')",
  ]);

  await page.waitForTimeout(3000);

  const passwordFilled = await fillFirst(
    page,
    [
      "input[name='credentials.passcode']",
      "input[name='password']",
      "input[type='password']",
    ],
    password
  );

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
    const frames = page.frames();

    for (const frame of frames) {
      const name = frame.name();
      const url = frame.url();

      if (name.includes("FCC") || url.toLowerCase().includes("fcc")) {
        return frame;
      }

      const text = await frame.locator("body").innerText().catch(() => "");
      if (text.includes("FedEx Customer Connection") || text.includes("Daily Service Wk")) {
        return frame;
      }
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

export async function discoverFedExNavigation(input: {
  username: string;
  password: string;
  serviceDate?: string;
}) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    await login(page, input.username, input.password);

    const fccFrame = await findFccLinksFrame(page);

    if (!fccFrame) {
      return {
        ok: false,
        stage: "fcc_frame",
        parentUrl: page.url(),
        frames: await Promise.all(
          page.frames().map(async (frame) => ({
            name: frame.name(),
            url: frame.url(),
            textPreview: (await frame.locator("body").innerText().catch(() => "")).slice(0, 500),
          }))
        ),
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

    await page.waitForTimeout(10000);

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
        openPages: await Promise.all(
          context.pages().map(async (candidate) => ({
            url: candidate.url(),
            title: await candidate.title().catch(() => ""),
            textPreview: (await candidate.locator("body").innerText().catch(() => "")).slice(0, 500),
          }))
        ),
        message: "Daily Service link clicked, but DSW page was not detected.",
      };
    }

    await dswPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => undefined);
    await dswPage.waitForTimeout(7000);

    await dswPage.locator("input.formField-header, input[class*='formField-header']").first().waitFor({ timeout: 60000 });
    await dswPage.locator("select#facilitySelect").first().waitFor({ timeout: 60000 });

    const excelIcon = dswPage.locator("img.downloadIcon[alt='Excel'], download-icon img[alt='Excel'], img[alt='Excel']").last();

    if ((await excelIcon.count()) === 0) {
      return {
        ok: false,
        stage: "excel_icon",
        dswUrl: dswPage.url(),
        dswTitle: await dswPage.title().catch(() => ""),
        bodyPreview: (await dswPage.locator("body").innerText().catch(() => "")).slice(0, 1500),
        message: "DSW page opened, but Excel icon was not found.",
      };
    }

    const [download] = await Promise.all([
      dswPage.waitForEvent("download", { timeout: 30000 }),
      excelIcon.click({ timeout: 10000 }),
    ]);

    const suggestedFilename = download.suggestedFilename();
    const savedPath = path.join(DOWNLOAD_DIR, `${Date.now()}-${suggestedFilename}`);

    await download.saveAs(savedPath);

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


async function findCustomerConnectionPage(pages: Page[], parentPage: Page) {
  for (const candidate of pages) {
    if (candidate === parentPage) continue;

    const url = candidate.url();
    const title = await candidate.title().catch(() => "");
    const body = await candidate.locator("body").innerText().catch(() => "");

    if (
      url.includes("/cpc-") ||
      title.toLowerCase().includes("customer connection") ||
      body.toLowerCase().includes("service area status")
    ) {
      return candidate;
    }
  }

  return null;
}

export async function discoverFedExFccServiceAreaStatus(input: {
  username: string;
  password: string;
  serviceDate?: string;
}) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

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

    const customerConnectionLink = fccFrame
      .locator("a")
      .filter({ hasText: /FedEx Customer Connection/i })
      .first();

    if ((await customerConnectionLink.count()) === 0) {
      return {
        ok: false,
        stage: "customer_connection_link",
        parentUrl: page.url(),
        frameUrl: fccFrame.url(),
        frameTextPreview: (await fccFrame.locator("body").innerText().catch(() => "")).slice(0, 1500),
        message: "FCC Links frame found, but FedEx Customer Connection link was not found.",
      };
    }

    await Promise.all([
      context.waitForEvent("page", { timeout: 30000 }).catch(() => null),
      customerConnectionLink.click({ timeout: 10000 }),
    ]);

    await page.waitForTimeout(10000);

    let fccPage = await findCustomerConnectionPage(context.pages(), page);

    if (!fccPage) {
      await page.waitForTimeout(8000);
      fccPage = await findCustomerConnectionPage(context.pages(), page);
    }

    if (!fccPage) {
      return {
        ok: false,
        stage: "fcc_customer_connection_page",
        parentUrl: page.url(),
        openPages: await Promise.all(
          context.pages().map(async (candidate) => ({
            url: candidate.url(),
            title: await candidate.title().catch(() => ""),
            textPreview: (await candidate.locator("body").innerText().catch(() => "")).slice(0, 500),
          }))
        ),
        message: "FedEx Customer Connection clicked, but FCC page was not detected.",
      };
    }

    await fccPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => undefined);
    await fccPage.waitForTimeout(5000);

    const serviceTab = fccPage.locator("li#mainTabSettab_2, [id='mainTabSettab_2']").first();

    if ((await serviceTab.count()) > 0) {
      await serviceTab.click({ timeout: 15000 }).catch(() => undefined);
      await fccPage.waitForTimeout(5000);
    }

    const workAreaSummary = fccPage.locator("text=Work Area Summary").first();

    await workAreaSummary.waitFor({ timeout: 60000 }).catch(() => undefined);
    await workAreaSummary.click({ timeout: 10000 }).catch(() => undefined);
    await fccPage.waitForTimeout(5000);

    const searchCandidates = [
      fccPage.locator("input[id='saStatusForm:search']"),
      fccPage.locator("input[name='saStatusForm:search']"),
      fccPage.locator("input[type='submit'][value='Search']"),
      fccPage.locator("input[value='Search']"),
      fccPage.getByRole("button", { name: /search/i }),
      fccPage.locator("button:has-text('Search')"),
    ];

    let clickedSearch = false;

    for (const candidate of searchCandidates) {
      try {
        if ((await candidate.count()) === 0) continue;
        await candidate.first().click({ timeout: 10000, force: true });
        clickedSearch = true;
        break;
      } catch {}
    }

    if (!clickedSearch) {
      await fccPage.evaluate(() => {
        const el = document.querySelector("input[id='saStatusForm:search'], input[name='saStatusForm:search'], input[value='Search']");
        if (el instanceof HTMLElement) el.click();
      }).catch(() => undefined);
    }

    await fccPage.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
    await fccPage.waitForTimeout(12000);

    const readyForExport =
      (await fccPage.locator("text=/records found/i").count().catch(() => 0)) > 0 ||
      (await fccPage.locator("input[name='saStatusForm:buttonGenerateExcel'], input[id='saStatusForm:buttonGenerateExcel'], input[type='image']").count().catch(() => 0)) > 0;

    if (!readyForExport) {
      return {
        ok: false,
        stage: "fcc_search_results",
        fccUrl: fccPage.url(),
        fccTitle: await fccPage.title().catch(() => ""),
        bodyPreview: (await fccPage.locator("body").innerText().catch(() => "")).slice(0, 2500),
        inputs: await fccPage.locator("input, button, img").evaluateAll((els) =>
          els.map((el) => ({
            tag: el.tagName,
            id: el.getAttribute("id"),
            name: el.getAttribute("name"),
            value: el.getAttribute("value"),
            type: el.getAttribute("type"),
            src: el.getAttribute("src"),
            alt: el.getAttribute("alt"),
            title: el.getAttribute("title"),
            disabled: el.hasAttribute("disabled"),
          }))
        ),
        message: "FCC Service Area Status opened, but Search did not produce export results.",
      };
    }

    let download = null;
    const frameDebug: Array<Record<string, unknown>> = [];

    for (const frame of fccPage.frames()) {
      const frameText = await frame.locator("body").innerText().catch(() => "");
      const candidateCount = await frame
        .locator("input[name='saStatusForm:buttonGenerateExcel'], input[id='saStatusForm:buttonGenerateExcel'], input[type='image'], [src*='excel' i]")
        .count()
        .catch(() => 0);

      frameDebug.push({
        url: frame.url(),
        name: frame.name(),
        textPreview: frameText.slice(0, 300),
        candidateCount,
      });

      const excelCandidates = [
        frame.locator("input[name='saStatusForm:buttonGenerateExcel']"),
        frame.locator("input[id='saStatusForm:buttonGenerateExcel']"),
        frame.locator("input[type='image']").last(),
        frame.locator("[src*='excel' i], [alt*='excel' i], [title*='excel' i]").last(),
      ];

      for (const candidate of excelCandidates) {
        try {
          if ((await candidate.count()) === 0) continue;

          const attempt = await Promise.all([
            fccPage.waitForEvent("download", { timeout: 15000 }).catch(() => null),
            candidate.click({ timeout: 5000, force: true }).catch(() => undefined),
          ]);

          if (attempt[0]) {
            download = attempt[0];
            break;
          }
        } catch {}
      }

      if (download) break;
    }

    if (!download) {
      try {
        const iconBox = await fccPage.evaluate(() => {
          const candidates = Array.from(document.querySelectorAll("input, img, a, button"))
            .map((el) => {
              const rect = (el as HTMLElement).getBoundingClientRect();
              return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                id: el.getAttribute("id"),
                name: el.getAttribute("name"),
                src: el.getAttribute("src"),
                type: el.getAttribute("type"),
              };
            })
            .filter((row) =>
              row.width > 5 &&
              row.height > 5 &&
              row.x > window.innerWidth - 160 &&
              row.y > 250 &&
              row.y < 520
            );

          return candidates[candidates.length - 1] ?? null;
        });

        if (iconBox) {
          const attempt = await Promise.all([
            fccPage.waitForEvent("download", { timeout: 15000 }).catch(() => null),
            fccPage.mouse.click(iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2).catch(() => undefined),
          ]);

          if (attempt[0]) {
            download = attempt[0];
          }
        }
      } catch {}
    }

    if (!download) {
      return {
        ok: false,
        stage: "fcc_excel_icon",
        fccUrl: fccPage.url(),
        fccTitle: await fccPage.title().catch(() => ""),
        bodyPreview: (await fccPage.locator("body").innerText().catch(() => "")).slice(0, 1500),
        frames: frameDebug,
        message: "FCC page opened, but Excel icon was not found.",
      };
    }

    const suggestedFilename = download.suggestedFilename();
    const savedPath = path.join(DOWNLOAD_DIR, `${Date.now()}-${suggestedFilename}`);

    await download.saveAs(savedPath);

    return {
      ok: true,
      stage: "today_fcc_excel_download",
      fccUrl: fccPage.url(),
      fccTitle: await fccPage.title().catch(() => ""),
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
