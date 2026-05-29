import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadMp3, ensureOutputDir } from "./download.js";
import { getDesktopPath } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const port = Number(process.env.PORT) || 47823;

let downloadInProgress = false;

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sendSse(
  res: express.Response,
  event: string,
  data: object,
) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/download", async (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url.trim() : "";

  if (!url || !isValidUrl(url)) {
    res.status(400).json({ error: "Please provide a valid http(s) URL." });
    return;
  }

  if (downloadInProgress) {
    res.status(409).json({ error: "A download is already in progress." });
    return;
  }

  downloadInProgress = true;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  sendSse(res, "progress", {
    phase: "starting",
    percent: 0,
    message: "Starting download...",
  });

  try {
    const outputDir = await ensureOutputDir(getDesktopPath());

    const result = await downloadMp3({
      url,
      outputDir,
      onProgress: (progress) => {
        sendSse(res, "progress", progress);
      },
    });

    sendSse(res, "complete", {
      outputPath: result.outputPath,
      title: result.title,
      fileName: path.basename(result.outputPath),
    });
  } catch (error) {
    sendSse(res, "error", {
      message: error instanceof Error ? error.message : "Download failed.",
    });
  } finally {
    downloadInProgress = false;
    res.end();
  }
});

app.listen(port, () => {
  console.log(`YouTube MP3 downloader running at http://localhost:${port}`);
  console.log(`Saving files to: ${getDesktopPath()}`);
});
