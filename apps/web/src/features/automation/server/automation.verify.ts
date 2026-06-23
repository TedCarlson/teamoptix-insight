import { type Page } from "playwright-core";
import { createAutomationBrowser } from "./automation.browser";

export type FedExVerificationResult = {
  ok: boolean;
  result:
    | "SUCCESS"
    | "INVALID_CREDENTIALS"
    | "ACTION_REQUIRED"
    | "UNKNOWN_LOGIN_FLOW"
    | "BROWSER_ERROR";
  status: "HEALTHY" | "ACTION_REQUIRED" | "WARNING";
  message: string;
  finalUrl?: string;
};

const FEDEX_LOGIN_URL = "https://mybizaccount.fedex.com/my.policy";

async function clickSignInFromMyBiz(page: Page) {
  const candidates = [
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
          page.waitForURL((url) => url.toString().includes("purpleid.okta.com"), {
            timeout: 20000,
          }).catch(() => undefined),
          locator.first().click({ timeout: 5000 }),
        ]);
        return true;
      }
    } catch {}
  }

  return false;
}

async function fillByOptions(page: Page, label: string, selectors: string[], value: string) {
  try {
    await page.getByLabel(label, { exact: false }).fill(value, { timeout: 5000 });
    return true;
  } catch {}

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

async function clickByOptions(page: Page, names: string[], selectors: string[]) {
  for (const name of names) {
    try {
      await page.getByRole("button", { name: new RegExp(name, "i") }).click({ timeout: 5000 });
      return true;
    } catch {}
  }

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

export async function verifyFedExCredential(input: {
  username: string;
  password: string;
}): Promise<FedExVerificationResult> {
  const browser = await createAutomationBrowser();

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    page.setDefaultTimeout(15000);

    await page.goto(FEDEX_LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);

    const clicked = await clickSignInFromMyBiz(page);

    if (!clicked) {
      return {
        ok: false,
        result: "UNKNOWN_LOGIN_FLOW",
        status: "WARNING",
        message: "Could not trigger MyBizAccount Sign In.",
        finalUrl: page.url(),
      };
    }

    await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(2500);

    const usernameFilled = await fillByOptions(
      page,
      "Username",
      [
        "input[name='identifier']",
        "input[name='username']",
        "input[name='userName']",
        "input[name='login']",
        "input[type='email']",
        "input[type='text']",
      ],
      input.username
    );

    if (!usernameFilled) {
      return {
        ok: false,
        result: "UNKNOWN_LOGIN_FLOW",
        status: "WARNING",
        message: "Could not locate the PurpleID username field after Sign In redirect.",
        finalUrl: page.url(),
      };
    }

    await clickByOptions(
      page,
      ["Next", "Continue", "Sign in", "Login"],
      [
        "input[type='submit']",
        "button[type='submit']",
        "button:has-text('Next')",
        "button:has-text('Continue')",
      ]
    );

    await page.waitForTimeout(3000);

    const passwordFilled = await fillByOptions(
      page,
      "Password",
      [
        "input[name='credentials.passcode']",
        "input[name='password']",
        "input[type='password']",
      ],
      input.password
    );

    if (!passwordFilled) {
      const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();

      if (
        bodyText.includes("invalid") ||
        bodyText.includes("unable to sign in") ||
        bodyText.includes("incorrect")
      ) {
        return {
          ok: false,
          result: "INVALID_CREDENTIALS",
          status: "ACTION_REQUIRED",
          message: "PurpleID rejected the username.",
          finalUrl: page.url(),
        };
      }

      return {
        ok: false,
        result: "ACTION_REQUIRED",
        status: "ACTION_REQUIRED",
        message: "Username was accepted, but password entry was not available. Additional authentication or login-flow review may be required.",
        finalUrl: page.url(),
      };
    }

    await clickByOptions(
      page,
      ["Verify", "Sign in", "Login", "Continue"],
      [
        "input[type='submit']",
        "button[type='submit']",
        "button:has-text('Verify')",
        "button:has-text('Sign in')",
        "button:has-text('Continue')",
      ]
    );

    await page.waitForTimeout(7000);

    const finalUrl = page.url();
    const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();

    if (
      bodyText.includes("invalid") ||
      bodyText.includes("incorrect") ||
      bodyText.includes("unable to sign in") ||
      bodyText.includes("password is not correct")
    ) {
      return {
        ok: false,
        result: "INVALID_CREDENTIALS",
        status: "ACTION_REQUIRED",
        message: "PurpleID rejected the username or password.",
        finalUrl,
      };
    }

    if (
      bodyText.includes("verify") ||
      bodyText.includes("mfa") ||
      bodyText.includes("multi-factor") ||
      bodyText.includes("challenge") ||
      bodyText.includes("send push") ||
      bodyText.includes("security question")
    ) {
      return {
        ok: false,
        result: "ACTION_REQUIRED",
        status: "ACTION_REQUIRED",
        message: "PurpleID requested additional authentication.",
        finalUrl,
      };
    }

    if (!finalUrl.includes("purpleid.okta.com")) {
      return {
        ok: true,
        result: "SUCCESS",
        status: "HEALTHY",
        message: "FedEx/PurpleID login completed.",
        finalUrl,
      };
    }

    return {
      ok: false,
      result: "UNKNOWN_LOGIN_FLOW",
      status: "WARNING",
      message: "Login did not clearly succeed or fail.",
      finalUrl,
    };
  } catch (error) {
    return {
      ok: false,
      result: "BROWSER_ERROR",
      status: "WARNING",
      message: error instanceof Error ? error.message : "Browser verification failed.",
    };
  } finally {
    await browser.close();
  }
}
