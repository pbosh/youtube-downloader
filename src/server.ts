import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  downloadMedia,
  ensureOutputDir,
  isValidYouTubeUrl,
  normalizeYouTubeUrl,
  type DownloadKind,
} from "./download.js";
import { getDesktopPath } from "./paths.js";
import { listSkins } from "./skins.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const skinsDir = path.resolve(__dirname, "..", "skins");
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

function parseKind(value: unknown): DownloadKind | "all" {
  if (value === "all") return "all";
  if (value === "video") return "video";
  if (value === "thumb") return "thumb";
  return "mp3";
}

function startingMessage(kind: DownloadKind | "all"): string {
  switch (kind) {
    case "all":
      return "Starting MP3, MP4, and thumbnail downloads...";
    case "video":
      return "Starting video download...";
    case "thumb":
      return "Starting thumbnail download...";
    default:
      return "Starting download...";
  }
}

const ALL_DOWNLOAD_KINDS: DownloadKind[] = ["mp3", "video", "thumb"];

const app = express();
app.use(express.json());
app.use(express.static(publicDir));
app.use("/skins", express.static(skinsDir));

app.get("/api/skins", async (_req, res) => {
  const skins = await listSkins(skinsDir);
  res.json(skins);
});

app.get("/api/download", async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  const url = rawUrl ? normalizeYouTubeUrl(rawUrl) : "";
  const kind = parseKind(req.query.kind);

  if (!url || !isValidYouTubeUrl(url)) {
    beginSse(res);
    sendSse(res, "failed", {
      message:
        "Please provide a valid YouTube link, video ID, or youtu.be URL.",
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
    message: startingMessage(kind),
  });

  try {
    const outputDir = await ensureOutputDir(getDesktopPath());

    if (kind === "all") {
      const results = [];

      for (let i = 0; i < ALL_DOWNLOAD_KINDS.length; i++) {
        const stepKind = ALL_DOWNLOAD_KINDS[i]!;

        const result = await downloadMedia({
          url,
          outputDir,
          kind: stepKind,
          onProgress: (progress) => {
            const stepPercent =
              progress.percent ??
              (progress.phase === "extract" || progress.phase === "merge" ? 100 : 0);
            const overallPercent =
              ((i + stepPercent / 100) / ALL_DOWNLOAD_KINDS.length) * 100;

            sendSse(res, "progress", {
              ...progress,
              step: stepKind,
              stepIndex: i + 1,
              stepTotal: ALL_DOWNLOAD_KINDS.length,
              percent: overallPercent,
            });
          },
        });

        results.push(result);
      }

      sendSse(res, "complete", {
        title: results[0]?.title ?? "",
        kind: "all",
        files: results.map((result) => ({
          fileName: path.basename(result.outputPath),
          outputPath: result.outputPath,
        })),
      });
    } else {
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
    }
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
