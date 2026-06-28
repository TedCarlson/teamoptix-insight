import Browserbase from "@browserbasehq/sdk";
import { chromium, type Browser } from "playwright-core";

export async function createAutomationBrowser(): Promise<Browser> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (apiKey) {
    const bb = new Browserbase({ apiKey });
    const session = await bb.sessions.create({
      ...(projectId ? { projectId } : {}),
    });

    return chromium.connectOverCDP(session.connectUrl);
  }

  return chromium.launch({ headless: true });
}
