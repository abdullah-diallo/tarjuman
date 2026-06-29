/**
 * verify-prod.mjs — end-to-end prod smoke test for the billing gate.
 *
 * Drives a real Chrome against the live site with a BRAND-NEW throwaway
 * account, then asserts the recording flow is reachable and that the
 * billing/paywall state matches what BILLING_ENABLED (convex/billingLimits.ts)
 * should produce:
 *
 *   • BILLING_ENABLED = false  → every user is unlimited. Settings shows
 *     "Free · All features unlocked"; /record has NO "x of N sessions" meter
 *     and NO "Monthly limit reached" wall. (Current expected state.)
 *   • BILLING_ENABLED = true   → a fresh free account shows "0 of 4 sessions …"
 *     and the usage meter; the wall only appears once the cap is hit.
 *
 * A fresh account is the clean discriminator: you don't need to burn the cap to
 * tell the two builds apart. The script deletes its own throwaway account at the
 * end (set KEEP_ACCOUNT=1 to leave it).
 *
 * Why this exists: a real test session once burned the 4 free credits and the
 * app hard-walled recording behind a dead-end "Upgrade" checkout. Run this after
 * any billing change (and especially before/after flipping BILLING_ENABLED) to
 * confirm prod behaves as intended. See docs/test-scripts/README.md.
 *
 * Usage:
 *   npm i -D puppeteer-core   # one-time (not a tracked dependency)
 *   node docs/test-scripts/verify-prod.mjs
 *   TARJUMAN_ORIGIN=http://localhost:3000 node docs/test-scripts/verify-prod.mjs
 *
 * Env:
 *   TARJUMAN_ORIGIN  target site (default https://tarjuman.live)
 *   CHROME_PATH      path to a Chrome/Chromium binary (default: macOS Chrome)
 *   OUT_DIR          where to write screenshots (default: current directory)
 *   KEEP_ACCOUNT=1   don't delete the throwaway account afterwards
 *
 * Exit code 0 = PASS, 1 = FAIL.
 */
import puppeteer from "puppeteer-core";

const ORIGIN = process.env.TARJUMAN_ORIGIN || "https://tarjuman.live";
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = process.env.OUT_DIR || ".";
const KEEP = process.env.KEEP_ACCOUNT === "1";

const stamp = Date.now();
const EMAIL = `verify.billing.${stamp}@tarjuman-test.dev`;
const PASSWORD = `Tarjuman!${stamp}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Set a React-controlled input's value so onChange/state actually update. */
async function fillReact(page, selector, value, index = 0) {
  await page.evaluate(
    ({ selector, value, index }) => {
      const el = document.querySelectorAll(selector)[index];
      if (!el) throw new Error(`no element for ${selector}[${index}]`);
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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--window-size=900,1200"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 1100, deviceScaleFactor: 2 });

  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

  const failures = [];
  let recordText = "";
  let settingsText = "";

  let authed = false;
  let formErr = null;
  try {
    // 1. Sign up a fresh throwaway account.
    await page.goto(`${ORIGIN}/signup`, { waitUntil: "domcontentloaded" });
    await sleep(2500); // let React hydrate before filling
    await fillReact(page, 'input[type="email"]', EMAIL);
    await fillReact(page, 'input[autocomplete="new-password"]', PASSWORD, 0);
    await fillReact(page, 'input[autocomplete="new-password"]', PASSWORD, 1);
    await sleep(300);
    await page.click('form button[type="submit"]');
    await sleep(2500);

    // Surface an explicit form error if signup was rejected (rate limit, dup
    // email, server error) — far more useful than "didn't route".
    formErr = await page.evaluate(() => {
      const a = document.querySelector('[role="alert"]');
      return a && a.innerText ? a.innerText.trim() : null;
    });

    // Settle the auth token. On success the form holds ~1.2s then pushes to
    // /record, but the app layout can briefly bounce to /login while the token
    // settles. So poll: try to land on /record and STAY there (not bounced).
    for (let i = 0; i < 12 && !authed; i++) {
      if (page.url().includes("/record")) {
        authed = true;
        break;
      }
      await page.goto(`${ORIGIN}/record`, { waitUntil: "domcontentloaded" }).catch(() => {});
      await sleep(2000);
      authed = page.url().includes("/record");
    }

    if (!authed) {
      await page.screenshot({ path: `${OUT_DIR}/prod_signup_fail.png` }).catch(() => {});
      failures.push(
        `could not reach /record after signup (at ${page.url()})` +
          (formErr ? ` — form said: "${formErr}"` : " — possibly rate-limited; retry in a minute")
      );
    } else {
      await sleep(2500); // let the plan query resolve + UI settle

      // 2. /record must not be walled and must not show a usage meter.
      recordText = await page.evaluate(() => document.body.innerText);
      await page.screenshot({ path: `${OUT_DIR}/prod_record.png` });
      if (/monthly limit reached/i.test(recordText))
        failures.push('/record shows "Monthly limit reached" wall');
      if (/of \d+ sessions/i.test(recordText))
        failures.push('/record shows a "x of N sessions" usage meter');

      // 3. Settings → Subscription must read "all features unlocked".
      await page.goto(`${ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
      await sleep(3500);
      settingsText = await page.evaluate(() => document.body.innerText);
      await page.screenshot({ path: `${OUT_DIR}/prod_settings.png`, fullPage: true });
      if (!/all features unlocked/i.test(settingsText))
        failures.push('Settings does not show "All features unlocked"');
      if (/of \d+ sessions/i.test(settingsText))
        failures.push("Settings shows a usage meter (billing gate is active)");

      if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.length}`);
    }
  } catch (e) {
    failures.push("EXCEPTION: " + (e instanceof Error ? e.message : String(e)));
  }

  // 4. Self-cleanup — delete the throwaway account (two-step confirm). Only if
  // we actually authenticated (else there's nothing to delete).
  let cleaned = KEEP ? "skipped (KEEP_ACCOUNT=1)" : authed ? "" : "skipped (signup failed — no account)";
  if (!KEEP && authed) {
    try {
      await page.goto(`${ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
      await sleep(2500);
      const c1 = await clickByText(page, "Delete account");
      await sleep(1200);
      const c2 = await clickByText(page, "Continue");
      await sleep(1200);
      const c3 = await clickByText(page, "Delete forever");
      await sleep(4000);
      cleaned =
        c1 && c2 && c3 && !page.url().includes("/settings")
          ? "deleted"
          : `uncertain (buttons ${c1}/${c2}/${c3}, url ${page.url()})`;
    } catch (e) {
      cleaned = "FAILED: " + (e instanceof Error ? e.message : String(e));
    }
  }

  await browser.close();

  const pass = failures.length === 0;
  console.log("\n========== VERIFY PROD ==========");
  console.log("origin:        ", ORIGIN);
  console.log("test account:  ", EMAIL);
  console.log("console errors:", consoleErrors.length);
  console.log("cleanup:       ", cleaned);
  console.log("screenshots:   ", `${OUT_DIR}/prod_record.png, ${OUT_DIR}/prod_settings.png`);
  console.log("verdict:       ", pass ? "✅ PASS — billing gate OFF, recording unblocked" : "❌ FAIL");
  if (!pass) {
    console.log("failures:");
    for (const f of failures) console.log("  -", f);
  }
  if (authed && cleaned !== "deleted" && !KEEP) {
    console.log(`NOTE: throwaway account may still exist — delete it with:`);
    console.log(`  node docs/test-scripts/cleanup-account.mjs "${EMAIL}" "${PASSWORD}"`);
  }
  process.exitCode = pass ? 0 : 1;
})();
