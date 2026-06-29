/**
 * cleanup-account.mjs — delete a Tarjuman account by credentials.
 *
 * Logs in with the given email/password, walks the Settings → Danger Zone
 * two-step delete confirm ("Continue" → "Delete forever"), then verifies the
 * account is gone by attempting to sign back in (which should fail). Useful for
 * removing throwaway accounts left by a manual verification run, and it doubles
 * as a smoke test that deleteAccount + login work on the target environment.
 *
 * Usage:
 *   npm i -D puppeteer-core   # one-time (not a tracked dependency)
 *   node docs/test-scripts/cleanup-account.mjs <email> <password>
 *   TARJUMAN_ORIGIN=http://localhost:3000 node docs/test-scripts/cleanup-account.mjs <email> <password>
 *
 * Env:
 *   TARJUMAN_ORIGIN  target site (default https://tarjuman.live)
 *   CHROME_PATH      path to a Chrome/Chromium binary (default: macOS Chrome)
 *
 * Exit code 0 = account confirmed deleted, 1 = otherwise.
 */
import puppeteer from "puppeteer-core";

const ORIGIN = process.env.TARJUMAN_ORIGIN || "https://tarjuman.live";
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];

if (!EMAIL || !PASSWORD) {
  console.error("usage: node cleanup-account.mjs <email> <password>");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fillReact(page, selector, value, index = 0) {
  await page.evaluate(
    ({ selector, value, index }) => {
      const el = document.querySelectorAll(selector)[index];
      if (!el) throw new Error(`no element ${selector}[${index}]`);
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { selector, value, index }
  );
}

async function clickByText(page, text) {
  return page.evaluate((text) => {
    const el = [...document.querySelectorAll("button, [role=button]")].find(
      (e) => e.innerText && e.innerText.trim().toLowerCase().includes(text.toLowerCase())
    );
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, text);
}

async function login(page) {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await sleep(1800);
  await fillReact(page, 'input[type="email"]', EMAIL);
  await fillReact(page, 'input[type="password"]', PASSWORD);
  await sleep(300);
  await page.click('form button[type="submit"]');
  await page
    .waitForFunction(() => location.pathname.startsWith("/record"), { timeout: 25000 })
    .catch(() => {});
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const log = [];
  let deleted = false;
  try {
    await login(page);
    log.push("after login: " + page.url());

    await page.goto(`${ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
    await sleep(3000);
    log.push("delete:        " + (await clickByText(page, "Delete account")));
    await sleep(1200);
    log.push("continue:      " + (await clickByText(page, "Continue")));
    await sleep(1200);
    log.push("delete-forever:" + (await clickByText(page, "Delete forever")));
    await sleep(4000);
    log.push("after delete:  " + page.url());

    // Verify gone: a re-login should fail to reach /record.
    await login(page);
    deleted = !page.url().includes("/record");
    log.push("re-login url:  " + page.url() + "  (account gone: " + deleted + ")");
  } catch (e) {
    log.push("ERROR: " + (e instanceof Error ? e.message : String(e)));
  }
  await browser.close();

  console.log("\n========== CLEANUP ACCOUNT ==========");
  console.log(log.join("\n"));
  console.log("verdict:", deleted ? "✅ account deleted" : "❌ not confirmed deleted");
  process.exitCode = deleted ? 0 : 1;
})();
