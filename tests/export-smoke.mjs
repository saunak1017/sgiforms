import { chromium } from "playwright";
import bundled from "@sparticuz/chromium";
const browser = await chromium.launch({
  executablePath: await bundled.executablePath(),
  args: bundled.args.filter((a) => a !== "--disable-web-security"),
  headless: true,
});
const page = await browser.newPage();
const base = process.env.TEST_URL || "http://127.0.0.1:8788";
try {
  await page.goto(base);
  await page.getByLabel("First name").fill("Saunak");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "+ New order" }).waitFor();
  const { records } = await page.evaluate(
    async () => await (await fetch("/api/records")).json(),
  );
  for (const kind of ["jewelry", "vendor"]) {
    const r = records.find((r) => r.kind === kind && r.status === "submitted");
    if (!r) throw new Error("Run browser smoke first to create local records.");
    await page.goto(base + "/#record/" + r.id);
    await page.reload();
    await page.getByRole("button", { name: "Word", exact: true }).waitFor();
    for (const [label, ext] of [
      ["Word", "docx"],
      ["PDF", "pdf"],
    ]) {
      const wait = page.waitForEvent("download");
      await page.getByRole("button", { name: label, exact: true }).click();
      await (await wait).saveAs(`../qa/${kind}.${ext}`);
    }
  }
  console.log("Updated Word and PDF exports generated successfully.");
} finally {
  await browser.close();
}
