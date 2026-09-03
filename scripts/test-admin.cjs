const { chromium } = require("playwright");
const path = require("path");

const BASE = "https://recruitermw.com";
const EMAIL = "kennedydaka93@gmail.com";
const PASS = "RecruiterMW2026!";
const OUT = path.join(__dirname, "..", "docs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Login
  console.log("Logging in...");
  await page.goto(`${BASE}/auth`);
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASS);
  await page.locator('button[type="submit"], button:has-text("Sign in")').first().click();

  // Wait for redirect
  await page.waitForTimeout(3000);
  console.log("Current URL:", page.url());

  // Navigate to admin
  await page.goto(`${BASE}/admin`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "admin-dashboard.png") });
  console.log("Admin dashboard screenshot saved");

  // Navigate to transactions
  await page.goto(`${BASE}/admin/transactions`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "admin-transactions.png") });
  console.log("Admin transactions screenshot saved");

  // Navigate to promo codes
  await page.goto(`${BASE}/admin/promo-codes`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "admin-promo-codes.png") });
  console.log("Admin promo codes screenshot saved");

  await browser.close();
  console.log("DONE");
})();
