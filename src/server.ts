import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  downloadMedia,
  ensureOutputDir,
  isValidUrl,
  normalizeUrl,
  type DownloadKind,
} from "./download.js";
import { getDesktopPath } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const port = Number(process.env.PORT) || 47823;

let downloadInProgress = false;

function beginSse(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

function sendSse(
  res: express.Response,
  event: string,
  data: object,
) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseKind(value: unknown): DownloadKind {
  return value === "video" ? "video" : "mp3";
}

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/download", async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  const url = rawUrl ? normalizeUrl(rawUrl) : "";
  const kind = parseKind(req.query.kind);

  if (!url || !isValidUrl(url)) {
    beginSse(res);
    sendSse(res, "failed", {
      message: "Please provide a valid YouTube URL (https://...).",
    });
    res.end();
    return;
  }

  if (downloadInProgress) {
    beginSse(res);
    sendSse(res, "failed", {
      message: "A download is already in progress.",
    });
    res.end();
    return;
  }

  downloadInProgress = true;

  beginSse(res);

  sendSse(res, "progress", {
    phase: "starting",
    percent: 0,
    message:
      kind === "video" ? "Starting video download..." : "Starting download...",
  });

  try {
    const outputDir = await ensureOutputDir(getDesktopPath());

    const result = await downloadMedia({
      url,
      outputDir,
      kind,
      onProgress: (progress) => {
        sendSse(res, "progress", progress);
      },
    });

    sendSse(res, "complete", {
      outputPath: result.outputPath,
      title: result.title,
      fileName: path.basename(result.outputPath),
      kind,
    });
  } catch (error) {
    sendSse(res, "failed", {
      message: error instanceof Error ? error.message : "Download failed.",
    });
  } finally {
    downloadInProgress = false;
    res.end();
  }
});

app.listen(port, () => {
  console.log(`YouTube downloader running at http://localhost:${port}`);
  console.log(`Saving files to: ${getDesktopPath()}`);
});
