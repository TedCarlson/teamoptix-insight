import Browserbase from "@browserbasehq/sdk";
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer-core";
import { saveFirstBrowserbaseDownloadZipEntry } from "./browserbase.downloads";

const FEDEX_LOGIN_URL = "https://mybizaccount.fedex.com/my.policy";
const FEDEX_DSW_DIRECT_URL =
  "https://mybizaccount.fedex.com/f5-w-68747470733a2f2f6d6762612d6473772e6170702e706161732e66656465782e636f6d$$/mgba/dsw";

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

  await page.evaluate(() => {
    const saml = document.querySelector("input[name='SAMLRequest']");
    const form = saml?.closest("form") as HTMLFormElement | null;
    if (form) form.submit();
  }).catch(() => undefined);

  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => undefined);
  await sleep(5000);

  const usernameFilled = await fillFirst(page, [
    "input[name='identifier']",
    "input[name='username']",
    "input[name='userName']",
    "input[name='login']",
    "input[type='email']",
    "input[type='text']",
  ], username);

  if (!usernameFilled) {
    throw new Error(JSON.stringify({
      message: "Could not locate username field.",
      url: page.url(),
      title: await page.title().catch(() => ""),
      bodyPreview: (await bodyText(page)).slice(0, 2000),
      inputs: await page.evaluate(() =>
        Array.from(document.querySelectorAll("input, button, a")).slice(0, 80).map((el) => ({
          tag: el.tagName,
          id: el.getAttribute("id"),
          name: el.getAttribute("name"),
          type: el.getAttribute("type"),
          value: el.getAttribute("value"),
          text: (el.textContent || "").trim().slice(0, 120),
          placeholder: el.getAttribute("placeholder"),
          ariaLabel: el.getAttribute("aria-label"),
        }))
      ).catch(() => []),
    }));
  }

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

async function clickSelectorAnywhere(page: Page, selector: string) {
  const pages = await page.browser().pages();

  for (const candidatePage of pages) {
    try {
      const el = await candidatePage.$(selector);
      if (el) {
        await el.click();
        return { clicked: true, source: "page_selector", url: candidatePage.url(), selector };
      }
    } catch {}
  }

  for (const candidatePage of pages) {
    for (const frame of candidatePage.frames()) {
      try {
        const el = await frame.$(selector);
        if (el) {
          await el.click();
          return { clicked: true, source: "frame_selector", url: frame.url(), selector };
        }
      } catch {}
    }
  }

  return { clicked: false, selector };
}

async function clickExactTextByMouse(page: Page, pattern: RegExp) {
  const source = pattern.source;

  for (const candidatePage of await page.browser().pages()) {
    const target = await candidatePage.evaluate((regexSource) => {
      const regex = new RegExp(regexSource, "i");

      const candidates = Array.from(document.querySelectorAll("a, button, div, span, input"))
        .map((el) => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const text = [
            el.textContent,
            el.getAttribute("value"),
            el.getAttribute("title"),
            el.getAttribute("aria-label"),
          ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

          return {
            tag: el.tagName,
            id: el.getAttribute("id"),
            text,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            area: rect.width * rect.height,
          };
        })
        .filter((row) =>
          regex.test(row.text) &&
          row.width > 2 &&
          row.height > 2 &&
          row.text.length <= 120
        )
        .sort((a, b) => a.area - b.area);

      return candidates[0] ?? null;
    }, source).catch(() => null);

    if (target) {
      await candidatePage.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
      return { clicked: true, source: "mouse_text", url: candidatePage.url(), target };
    }
  }

  return { clicked: false, source: "mouse_text" };
}

async function clickExactTextAnywhere(page: Page, pattern: RegExp) {
  for (const frame of page.frames()) {
    const clicked = await frame.evaluate((source) => {
      const regex = new RegExp(source, "i");

      const candidates = Array.from(document.querySelectorAll("a, button, input[type='button'], input[type='submit'], [role='button']"));

      const target = candidates.find((el) => {
        const text = [
          el.textContent,
          el.getAttribute("value"),
          el.getAttribute("title"),
          el.getAttribute("aria-label"),
          el.getAttribute("id"),
          el.getAttribute("name"),
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        return regex.test(text);
      });

      if (target instanceof HTMLElement) {
        target.click();
        return {
          clicked: true,
          tag: target.tagName,
          id: target.getAttribute("id"),
          name: target.getAttribute("name"),
          text: (target.textContent || target.getAttribute("value") || "").trim().slice(0, 160),
          href: target.getAttribute("href"),
        };
      }

      return { clicked: false };
    }, pattern.source).catch(() => ({ clicked: false }));

    if (clicked.clicked) return clicked;
  }

  return { clicked: false };
}

async function clickPeopleSoftTileByText(page: Page, pattern: RegExp) {
  for (const frame of page.frames()) {
    const clicked = await frame.evaluate((source) => {
      const regex = new RegExp(source, "i");
      const all = Array.from(document.querySelectorAll("a, div, span, td, li"));

      const textNode = all.find((el) => regex.test((el.textContent || "").replace(/\s+/g, " ").trim()));
      if (!textNode) return { clicked: false, reason: "tile_text_not_found" };

      const container =
        textNode.closest("[id*='PTNUI_LAND_REC']") ||
        textNode.closest("li") ||
        textNode.closest("td") ||
        textNode.parentElement;

      const action =
        container?.querySelector("a[id*='PTNUI_LAND_REC_PTNUI_ACTION_LINK']") ||
        container?.querySelector("a[href*='submitAction_win0']") ||
        textNode.closest("a");

      if (action instanceof HTMLElement) {
        action.click();
        return {
          clicked: true,
          tag: action.tagName,
          id: action.getAttribute("id"),
          text: (textNode.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
          href: action.getAttribute("href"),
        };
      }

      return {
        clicked: false,
        reason: "tile_action_not_found",
        text: (textNode.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
        containerId: container?.getAttribute("id") ?? null,
      };
    }, pattern.source).catch((error) => ({ clicked: false, reason: String(error) }));

    if (clicked.clicked) return clicked;
  }

  return { clicked: false, reason: "no_frame_clicked" };
}

async function clickPeopleSoftGroupletActionByLabel(page: Page, pattern: RegExp) {
  const source = pattern.source;

  for (const candidatePage of await page.browser().pages()) {
    const clicked = await candidatePage.evaluate((regexSource) => {
      const regex = new RegExp(regexSource, "i");

      const labels = Array.from(document.querySelectorAll("[id^='PTNUI_LAND_REC_GROUPLET_LBL$']"));
      const label = labels.find((el) => regex.test((el.textContent || "").replace(/\s+/g, " ").trim()));

      if (!label) return { clicked: false, reason: "label_not_found" };

      const id = label.getAttribute("id") || "";
      const index = id.split("$").pop();
      if (!index) return { clicked: false, reason: "index_not_found", id };

      const action =
        document.getElementById(`PTNUI_LAND_REC_PTNUI_ACTION_LINK$${index}`) ||
        document.getElementById(`PTNUI_LAND_REC_GROUPLET$${index}`) ||
        label.closest("a, button, [role='button'], [onclick]");

      if (!(action instanceof HTMLElement)) {
        return { clicked: false, reason: "action_not_found", id, index };
      }

      action.click();

      return {
        clicked: true,
        source: "grouplet_action",
        labelId: id,
        actionId: action.getAttribute("id"),
        text: (label.textContent || "").replace(/\s+/g, " ").trim(),
      };
    }, source).catch((error) => ({ clicked: false, reason: String(error) }));

    if (clicked.clicked) return { ...clicked, url: candidatePage.url() };
  }

  return { clicked: false, reason: "no_page_clicked" };
}

async function clickDailyServiceAnywhere(page: Page) {
  const fccClick = await clickPeopleSoftGroupletActionByLabel(page, /FCC Links/);
  if (fccClick.clicked) {
    await sleep(8000);
  }

  const dailyClick = await clickExactTextByMouse(page, /Daily Service Wk\\s*&\\s*Vision IBPR|Daily Service Wk|Vision IBPR/);
  if (dailyClick.clicked) {
    return {
      clicked: true,
      fccClick,
      dailyClick,
    };
  }

  const dswSelectorClick = await clickSelectorAnywhere(page, "a[id^='GF_FLUID_TL_WRK_GF_HYPERLINK1']");
  if (dswSelectorClick.clicked) {
    return {
      clicked: true,
      fccClick,
      dailyClick,
      dswSelectorClick,
    };
  }

  return {
    clicked: false,
    fccClick,
    dailyClick,
    dswSelectorClick,
  };
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

    const dswPage = await browser.newPage();
    await dswPage.goto(FEDEX_DSW_DIRECT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dswPage.waitForNetworkIdle({ idleTime: 1500, timeout: 60000 }).catch(() => undefined);
    await dswPage.waitForFunction(
      () => document.body && document.body.innerText.trim().length > 100,
      { timeout: 60000 }
    ).catch(() => undefined);
    await sleep(10000);

    const dswBody = await bodyText(dswPage);
    if (!/Daily Service Worksheet|Facility|Contract #|WA Name/i.test(dswBody)) {
      return {
        ok: false,
        stage: "dsw_direct_page",
        parentUrl: page.url(),
        dswUrl: dswPage.url(),
        dswTitle: await dswPage.title().catch(() => ""),
        bodyPreview: dswBody.slice(0, 2500),
        htmlPreview: await dswPage.content().then((html) => html.slice(0, 2500)).catch(() => ""),
        message: "Authenticated session opened direct DSW URL, but DSW worksheet was not detected.",
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
