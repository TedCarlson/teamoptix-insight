import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Frame, type Page } from "playwright";
import { uploadAutomationArtifact } from "./artifact-storage.js";
import { makeRunLogger } from "./run-log.js";

const FEDEX_LOGIN_URL = "https://mybizaccount.fedex.com/my.policy";
const DOWNLOAD_DIR = path.join(os.tmpdir(), "teamoptix-insight-worker", "automation-downloads");

const DIAG_DIR = path.join(os.tmpdir(), "teamoptix-insight-worker", "diagnostics");

async function saveDiagnostic(page: Page, label: string, runId?: string | null) {
  await mkdir(DIAG_DIR, { recursive: true });
  const stamp = `${Date.now()}-${label}-${runId ?? "no-run"}`;
  const screenshotPath = path.join(DIAG_DIR, `${stamp}.png`);
  const htmlPath = path.join(DIAG_DIR, `${stamp}.html`);
  const textPath = path.join(DIAG_DIR, `${stamp}.txt`);

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  await writeFile(htmlPath, await page.content().catch(() => "")).catch(() => undefined);
  await writeFile(textPath, await page.locator("body").innerText().catch(() => "")).catch(() => undefined);

  console.log("[DIAG]", { label, screenshotPath, htmlPath, textPath });
  return { screenshotPath, htmlPath, textPath };
}


async function listCompletedDownloads(dir: string) {
  await mkdir(dir, { recursive: true });
  const files = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const rows = [];

  for (const file of files) {
    if (!file.isFile()) continue;

    const name = file.name;
    const lower = name.toLowerCase();

    if (lower.endsWith(".crdownload")) continue;
    if (lower.endsWith(".tmp")) continue;
    if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx")) continue;

    const fullPath = path.join(dir, name);
    const fileStat = await stat(fullPath).catch(() => null);
    if (!fileStat || fileStat.size <= 0) continue;

    rows.push({
      name,
      fullPath,
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
    });
  }

  return rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function waitForCompletedDownload(input: {
  downloadDir: string;
  beforePaths: Set<string>;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  let lastSeen: Awaited<ReturnType<typeof listCompletedDownloads>> = [];

  while (Date.now() - startedAt < input.timeoutMs) {
    const completed = await listCompletedDownloads(input.downloadDir);
    lastSeen = completed;

    const fresh = completed.find((row) => !input.beforePaths.has(row.fullPath));
    if (fresh) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const firstStat = await stat(fresh.fullPath).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const secondStat = await stat(fresh.fullPath).catch(() => null);

      if (firstStat && secondStat && firstStat.size === secondStat.size && secondStat.size > 0) {
        return {
          suggestedFilename: fresh.name,
          savedPath: fresh.fullPath,
          fileSize: secondStat.size,
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for completed Excel download. Last seen: ${JSON.stringify(lastSeen.slice(0, 5))}`);
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
  companyId?: string;
  runId?: string | null;
  serviceDate?: string;
}) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const runLog = makeRunLogger(input.runId, "DSW");
  await runLog.log("run:start", {
    companyId: input.companyId,
    serviceDate: input.serviceDate,
  });

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
    await runLog.log("download:start", {
      url: dswPage.url(),
      title: await dswPage.title().catch(() => ""),
      excelIconCount: await excelIcon.count().catch(() => -1),
    });

    await excelIcon.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => undefined);

    const beforeDswDownloads = new Set((await listCompletedDownloads(DOWNLOAD_DIR)).map((row) => row.fullPath));

    let filesystemDownload;
    try {
      await excelIcon.evaluate((el) => {
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      });
      filesystemDownload = await waitForCompletedDownload({
        downloadDir: DOWNLOAD_DIR,
        beforePaths: beforeDswDownloads,
        timeoutMs: 90000,
      });
    } catch (error) {
      const diagnostic = await saveDiagnostic(dswPage, "dsw-download-timeout", input.runId);
      await runLog.log("download:timeout", {
        message: error instanceof Error ? error.message : String(error),
        diagnostic,
      });
      return {
        ok: false,
        stage: "dsw_download_timeout",
        dswUrl: dswPage.url(),
        dswTitle: await dswPage.title().catch(() => ""),
        diagnostic,
        message: "DSW page opened and Excel icon was found, but the download event did not fire.",
      };
    }

    const suggestedFilename = filesystemDownload.suggestedFilename;
    const savedPath = filesystemDownload.savedPath;

    console.log("[DSW] download:saved", savedPath);
    await runLog.log("download:saved", {
      savedPath,
      suggestedFilename,
    });

    const fileBuffer = await readFile(savedPath);
    const fileStat = await stat(savedPath);

    await runLog.log("artifact:upload:start", {
      hasCompanyId: Boolean(input.companyId),
      hasRunId: Boolean(input.runId),
    });

    await runLog.log("artifact:upload:start", {
      hasCompanyId: Boolean(input.companyId),
      hasRunId: Boolean(input.runId),
    });

    const artifact =
      input.companyId && input.runId
        ? await uploadAutomationArtifact({
            savedPath,
            suggestedFilename,
            reportType: "DSW",
            companyId: input.companyId,
            runId: input.runId,
            serviceDate: input.serviceDate,
          })
        : null;

    await runLog.log("artifact:upload:done", {
      artifact,
    });

    return {
      ok: true,
      stage: "today_dsw_excel_download",
      dswUrl: dswPage.url(),
      dswTitle: await dswPage.title().catch(() => ""),
      excelDownload: {
        suggestedFilename,
        savedPath,
        fileSize: fileStat.size,
        fileBase64: fileBuffer.toString("base64"),
        artifact,
        failure: null,
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

export async function downloadFccExcel(input: {
  username: string;
  password: string;
  serviceDate?: string;
  companyId?: string;
  runId?: string | null;
}) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const runLog = makeRunLogger(input.runId, "FCC");
  await runLog.log("run:start", {
    companyId: input.companyId,
    serviceDate: input.serviceDate,
  });

  const browser = await createBrowser();

  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    console.log("[FCC] login:start");
    await login(page, input.username, input.password);
    console.log("[FCC] login:done");

    console.log("[FCC] fcc-frame:start");
    const fccFrame = await findFccLinksFrame(page);
    console.log("[FCC] fcc-frame:done", Boolean(fccFrame));

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

    console.log("[FCC] customer-link:clicked");
    await page.waitForTimeout(10000);

    console.log("[FCC] fcc-page:find:start");
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
          context.pages().map(async (candidate: Page) => ({
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
      console.log("[FCC] service-tab:click");
      await serviceTab.click({ timeout: 15000 }).catch(() => undefined);
      await fccPage.waitForTimeout(5000);
    }

    const serviceAreaStatusLink = fccPage
      .locator("text=Service Area Status")
      .last();

    await serviceAreaStatusLink.waitFor({ timeout: 60000 }).catch(() => undefined);
    await serviceAreaStatusLink.click({ timeout: 15000, force: true }).catch(() => undefined);
    await fccPage.waitForTimeout(8000);

    const workAreaSummary = fccPage.locator("text=Work Area Summary").first();

    await workAreaSummary.waitFor({ timeout: 60000 }).catch(() => undefined);
    await workAreaSummary.click({ timeout: 15000, force: true }).catch(() => undefined);
    await fccPage.waitForTimeout(8000);

    console.log("[FCC] search:start");
    await runLog.log("search:start", {
      url: fccPage.url(),
      title: await fccPage.title().catch(() => ""),
    });

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

    await runLog.log("search:ready-for-export", {
      readyForExport,
      url: fccPage.url(),
      title: await fccPage.title().catch(() => ""),
      bodyPreview: (await fccPage.locator("body").innerText().catch(() => "")).slice(0, 1200),
    });

    if (!readyForExport) {
      const diagnostic = await saveDiagnostic(fccPage, "fcc-no-export-results", input.runId);
      await runLog.log("search:no-export-diagnostic", { diagnostic });

      return {
        ok: false,
        stage: "fcc_search_results",
        fccUrl: fccPage.url(),
        fccTitle: await fccPage.title().catch(() => ""),
        bodyPreview: (await fccPage.locator("body").innerText().catch(() => "")).slice(0, 2500),
        message: "FCC Service Area Status opened, but Search did not produce export results.",
      };
    }

    console.log("[FCC] download:start");
    await runLog.log("download:start", {
      url: fccPage.url(),
      title: await fccPage.title().catch(() => ""),
    });

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

          const beforeFccDownloads = new Set((await listCompletedDownloads(DOWNLOAD_DIR)).map((row) => row.fullPath));

          await candidate.click({ timeout: 5000, force: true }).catch(() => undefined);

          const filesystemDownload = await waitForCompletedDownload({
            downloadDir: DOWNLOAD_DIR,
            beforePaths: beforeFccDownloads,
            timeoutMs: 45000,
          }).catch(() => null);

          if (filesystemDownload) {
            download = filesystemDownload;
            break;
          }
        } catch {}
      }

      if (download) break;
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

    const suggestedFilename = download.suggestedFilename;
    const savedPath = download.savedPath;

    console.log("[FCC] download:saved", savedPath);
    await runLog.log("download:saved", {
      savedPath,
      suggestedFilename,
    });

    const fileBuffer = await readFile(savedPath);
    const fileStat = await stat(savedPath);

    const artifact =
      input.companyId && input.runId
        ? await uploadAutomationArtifact({
            savedPath,
            suggestedFilename,
            reportType: "FCC",
            companyId: input.companyId,
            runId: input.runId,
            serviceDate: input.serviceDate,
          })
        : null;

    await runLog.log("artifact:upload:done", {
      artifact,
    });

    return {
      ok: true,
      stage: "today_fcc_excel_download",
      fccUrl: fccPage.url(),
      fccTitle: await fccPage.title().catch(() => ""),
      excelDownload: {
        suggestedFilename,
        savedPath,
        fileSize: fileStat.size,
        fileBase64: fileBuffer.toString("base64"),
        artifact,
        failure: null,
      },
    };
  } finally {
    await browser.close();
  }
}
