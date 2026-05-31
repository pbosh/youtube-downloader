import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "test-output", "all-download-screenshots");
const url = process.argv[2] ?? "https://www.youtube.com/watch?v=Q9gH0QyqhE0";
const appUrl = process.env.APP_URL ?? "http://localhost:47823/";
const intervalMs = Number(process.env.INTERVAL_MS ?? 2000);
const durationMs = Number(process.env.DURATION_MS ?? 90000);

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 520, height: 980 } });

await page.goto(`${appUrl}?screenshot=test`, { waitUntil: "networkidle" });
await page.fill("#url", url);
await page.click("#all-btn");

const started = Date.now();
let frame = 0;

while (Date.now() - started < durationMs) {
  const stamp = String(frame).padStart(3, "0");
  const bars = await page.evaluate(() => {
    const read = (kind) => {
      const btn = document.querySelector(`[data-kind="${kind}"]`);
      const bar = btn?.querySelector(".btn-progress");
      return {
        width: bar?.style.width ?? "0%",
        active: btn?.classList.contains("is-active"),
        running: btn?.classList.contains("is-running"),
        complete: btn?.classList.contains("is-complete"),
      };
    };
    return {
      mp3: read("mp3"),
      video: read("video"),
      thumb: read("thumb"),
      all: read("all"),
      log: document.getElementById("console-log")?.textContent?.trim().split("\n").slice(-4).join(" | ") ?? "",
    };
  });

  await page.screenshot({
    path: path.join(outDir, `${stamp}.png`),
    fullPage: true,
  });

  console.log(
    JSON.stringify({
      frame,
      elapsed: Math.round((Date.now() - started) / 1000),
      bars,
    }),
  );

  if (bars.log.includes("Enjoy your files!")) {
    frame++;
    break;
  }

  frame++;
  await page.waitForTimeout(intervalMs);
}

await browser.close();
console.log(`Saved ${frame} screenshots to ${outDir}`);
