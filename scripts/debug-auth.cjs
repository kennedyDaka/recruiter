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

  // Capture console logs
  const logs = [];
  page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`[ERROR] ${err.message}`));

  // Login
  console.log("Navigating to auth...");
  await page.goto(`${BASE}/auth`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Screenshot before filling
  await page.screenshot({ path: path.join(OUT, "debug-1-before.png") });

  // Check what inputs exist
  const inputs = await page.locator("input").all();
  console.log("Found inputs:", inputs.length);
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute("type");
    const name = await inputs[i].getAttribute("name");
    const placeholder = await inputs[i].getAttribute("placeholder");
    console.log(`  Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}`);
  }

  // Fill email using the visible label-based approach
  const emailInput = page.locator('input[placeholder*="email" i], input[type="email"]').first();
  await emailInput.click();
  await emailInput.fill(EMAIL);
  console.log("Email filled");

  // Fill password
  const passInput = page.locator('input[type="password"]').first();
  await passInput.click();
  await passInput.fill(PASS);
  console.log("Password filled");

  await page.screenshot({ path: path.join(OUT, "debug-2-filled.png") });

  // Click sign in
  const signInBtn = page.locator('button:has-text("Sign in")').first();
  console.log("Sign in button found:", await signInBtn.isVisible());
  await signInBtn.click();
  console.log("Clicked sign in");

  // Wait for navigation
  await page.waitForTimeout(5000);
  console.log("Current URL:", page.url());

  await page.screenshot({ path: path.join(OUT, "debug-3-after.png") });

  // Print logs
  console.log("\nConsole logs:");
  logs.forEach((l) => console.log("  ", l));

  await browser.close();
})();
