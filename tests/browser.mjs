import { chromium } from "playwright";
import bundled from "@sparticuz/chromium";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (await bundled.executablePath()),
  args: bundled.args.filter((a) => a !== "--disable-web-security"),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.TEST_URL || "http://127.0.0.1:8788";
await fs.mkdir("../qa", { recursive: true });
try {
  await page.goto(base);
  await page.getByLabel("First name").fill("Saunak");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "+ New order" }).waitFor();
  await page.screenshot({ path: "../qa/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "+ New order" }).click();
  await page.getByLabel("Customer Name/Number").fill("QA Jewelry Store");
  await page.getByLabel("Salesperson", { exact: false }).fill("Saunak");
  await page.getByLabel("Manufacturer", { exact: false }).fill("RFG");
  await page.getByLabel("Due Date").fill("2026-10-15");
  await page.getByLabel("Style Number").fill("QA100");
  await page.getByLabel("Style Classification").selectOption("New");
  await page.getByLabel("Order Quantity").fill("2");
  await page.getByLabel("Price ($)").fill("250");
  await page.getByLabel("Price Basis").selectOption("Per Piece");
  await page.getByLabel("Jewelry Category").selectOption("Ring");
  await page
    .getByRole("combobox", { name: "Metal", exact: true })
    .selectOption("14K");
  await page.getByLabel("Yellow", { exact: true }).check();
  await page.getByLabel("Ring Size USA").fill("7.25");
  await page.getByLabel("Natural", { exact: true }).check();
  await page.getByLabel("Row 1 Shape").fill("Oval");
  await page.getByLabel("Row 1 Quantity").fill("1");
  await page.getByLabel("Row 1 Total Weight (ct)").fill("1.50");
  await page.getByLabel("Row 1 Stone Type").selectOption("Natural");
  await page.getByLabel("Row 1 Measurements / Notes").fill("9.2 x 6.4 mm");
  await page.getByLabel("Row 1 Center / Side").selectOption("Center");
  await page.getByLabel("Row 1 Setting Type").selectOption("4 Prong");
  await page.getByLabel("Inventory", { exact: false }).selectOption("Asset");
  await page.getByLabel("SMS", { exact: true }).check();
  await page
    .getByLabel("Notes / Modifications / Special Instructions")
    .fill("Keep the gallery low. Customer approves CAD before production.");
  await page.screenshot({ path: "../qa/jewelry.png", fullPage: true });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  assert.equal(await page.locator("[role=alert]").count(), 0);
  await page.getByRole("button", { name: "Submit form" }).click();
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .waitFor();
  assert.equal(await page.locator("[role=alert]").count(), 0);
  for (const [label, ext] of [
    ["Word", "docx"],
    ["PDF", "pdf"],
  ]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const d = await download;
    await d.saveAs(`../qa/jewelry.${ext}`);
  }
  await page.getByLabel("Received SGI name or number").fill("Kyi");
  await page.getByLabel("Received SGI date").fill("2026-10-14");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Vendor memo in", exact: false })
    .click();
  await page.getByRole("button", { name: "+ New memo" }).click();
  await page.getByLabel("Vendor Name").fill("QA Supplier");
  await page.getByLabel("Customer Name/Number").fill("QA Store");
  await page
    .getByLabel("Memo / Invoice", { exact: false })
    .first()
    .selectOption("Memo");
  for (const [label, value] of [
    ["Vendor Lot ID", "V100"],
    ["CP $/ct", "100"],
    ["CP Total Price", "150"],
    ["Details (include ct weight)", "1.50 ct oval D VS1"],
    ["SG Lot ID", "SG100"],
    ["SP $/ct", "150"],
    ["SP Total Price", "225"],
  ])
    await page.getByLabel("Row 1 " + label, { exact: true }).fill(value);
  for (const [label, value] of [
    ["Address", "1 Main Street"],
    ["City", "New York"],
    ["State", "NY"],
    ["ZIP", "10036"],
    ["Shipping Charge ($)", "25"],
  ])
    await page.getByLabel(label, { exact: false }).fill(value);
  await page.getByLabel("Carrier", { exact: false }).selectOption("FedEx");
  await page.getByLabel("Shipping Speed").selectOption("1 Day");
  await page.getByRole("button", { name: "Submit form" }).click();
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .waitFor();
  await page.getByLabel("Vendor Memo In Completed").check();
  await page.getByLabel("Entered By").fill("Aye");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("All changes saved", { exact: true }).waitFor();
  for (const [label, ext] of [
    ["Word", "docx"],
    ["PDF", "pdf"],
  ]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const d = await download;
    await d.saveAs(`../qa/vendor.${ext}`);
  }
  await page.screenshot({ path: "../qa/vendor.png", fullPage: true });
  const submittedId = new URL(page.url()).hash.split("/")[1];
  const snapshotUrl = `${base}/#submitted/${submittedId}`;
  const originalDownload = page.waitForEvent("download");
  await page.goto(snapshotUrl);
  await page.reload();
  const originalPdf = await originalDownload;
  assert.match(originalPdf.suggestedFilename(), /-submitted\.pdf$/);
  await originalPdf.saveAs("../qa/vendor-submitted.pdf");
  await page
    .getByRole("heading", { name: "Original submitted form" })
    .waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const signedOut = page;
  await signedOut.goto(snapshotUrl);
  await signedOut.getByLabel("First name").fill("Atit");
  await signedOut
    .getByLabel("Password", { exact: true })
    .fill("local-test-password-123");
  const resumed = signedOut.waitForEvent("download");
  await signedOut.getByRole("button", { name: "Sign in" }).click();
  assert.match((await resumed).suggestedFilename(), /-submitted\.pdf$/);

  await page.getByRole("button", { name: "All forms" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../qa/mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Browser workflow passed: jewelry and vendor submissions, authenticated original-PDF links, processing updates, exports, mobile dashboard.",
  );
} catch (e) {
  await page.screenshot({ path: "../qa/failure.png", fullPage: true });
  console.error(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}
