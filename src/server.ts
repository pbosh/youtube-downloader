import express from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  downloadMedia,
  ensureOutputDir,
  isValidYouTubeUrl,
  killActiveDownloadProcesses,
  normalizeYouTubeUrl,
  type DownloadKind,
  type DownloadProgress,
} from "./download.js";
import { fetchVideoFormatInfo } from "./formats.js";
import { getDesktopPath } from "./paths.js";
import { deleteSkin, listSkins } from "./skins.js";
import { runStartupChecks } from "./startup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const skinsDir = process.env.SKINS_DIR
  ? path.resolve(process.env.SKINS_DIR)
  : path.resolve(__dirname, "..", "skins");
const defaultPort = Number(process.env.PORT) || 47823;
const defaultHost = process.env.HOST ?? "127.0.0.1";

let downloadInProgress = false;

interface ActiveDownload {
  abortController: AbortController;
  response: express.Response;
}

let activeDownload: ActiveDownload | null = null;

function cancelActiveDownload(reason = "Download cancelled.") {
  const current = activeDownload;
  if (!current) {
    downloadInProgress = false;
    return;
  }

  activeDownload = null;
  downloadInProgress = false;
  current.abortController.abort();

  if (current.response.writableEnded) {
    return;
  }

  try {
    sendSse(current.response, "failed", { message: reason });
    current.response.end();
  } catch {
    // Client already disconnected.
  }
}

function beginSse(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

function flushSse(res: express.Response) {
  const response = res as express.Response & { flush?: () => void };
  if (typeof response.flush === "function") {
    response.flush();
  }
}

function sendSse(
  res: express.Response,
  event: string,
  data: object,
) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  flushSse(res);
}

function parseKind(value: unknown): DownloadKind | "all" {
  if (value === "all") return "all";
  if (value === "video") return "video";
  if (value === "thumb") return "thumb";
  return "mp3";
}

function resolveOverallUserPercent(
  stepIndex: number,
  stepTotal: number,
  userPercent: number,
): number {
  return ((stepIndex + userPercent / 100) / stepTotal) * 100;
}

function readUserPercent(progress: DownloadProgress): number {
  if (typeof progress.userPercent === "number") {
    return Math.min(100, Math.max(0, progress.userPercent));
  }
  return 0;
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

app.delete("/api/skins/:id", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const result = await deleteSkin(skinsDir, id);

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({ ok: true });
});

app.get("/api/formats", async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";

  try {
    const info = await fetchVideoFormatInfo(rawUrl);
    res.json(info);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not fetch formats.",
    });
  }
});

function parseVideoFormatQuery(req: express.Request) {
  const selector =
    typeof req.query.videoFormatSelector === "string"
      ? req.query.videoFormatSelector.trim()
      : "";
  if (!selector) {
    return undefined;
  }

  return {
    formatSelector: selector,
    needsConversion: req.query.videoNeedsConversion === "1",
    label:
      typeof req.query.videoFormatLabel === "string"
        ? req.query.videoFormatLabel.trim()
        : undefined,
  };
}

app.post("/api/download/stop", (_req, res) => {
  const wasRunning = downloadInProgress;
  killActiveDownloadProcesses();
  cancelActiveDownload("Download stopped.");
  res.json({ ok: true, stopped: wasRunning });
});

app.get("/api/download", async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  const url = rawUrl ? normalizeYouTubeUrl(rawUrl) : "";
  const kind = parseKind(req.query.kind);
  const videoFormat = parseVideoFormatQuery(req);

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
    cancelActiveDownload("Starting a new download.");
  }

  const abortController = new AbortController();
  downloadInProgress = true;
  activeDownload = { abortController, response: res };

  req.socket.setNoDelay(true);
  req.socket.setTimeout(0);

  req.on("close", () => {
    if (res.writableEnded) return;
    if (activeDownload?.response === res) {
      cancelActiveDownload("Download cancelled.");
    }
  });

  beginSse(res);

  const keepalive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepalive);
      return;
    }

    res.write(": keepalive\n\n");
    flushSse(res);
  }, 15_000);

  sendSse(res, "progress", {
    phase: "download",
    userPercent: 0,
    message: kind === "all" ? startingMessage(kind) : undefined,
  });

  try {
    const outputDir = await ensureOutputDir(getDesktopPath());

    if (kind === "all") {
      const results = [];

      for (let i = 0; i < ALL_DOWNLOAD_KINDS.length; i++) {
        const stepKind = ALL_DOWNLOAD_KINDS[i]!;

        if (abortController.signal.aborted) {
          throw new Error("Download cancelled.");
        }

        const result = await downloadMedia({
          url,
          outputDir,
          kind: stepKind,
          signal: abortController.signal,
          videoFormat: stepKind === "video" ? videoFormat : undefined,
          onProgress: (progress) => {
            const userPercent = readUserPercent(progress);
            const overallUserPercent = resolveOverallUserPercent(
              i,
              ALL_DOWNLOAD_KINDS.length,
              userPercent,
            );

            sendSse(res, "progress", {
              ...progress,
              step: stepKind,
              stepIndex: i + 1,
              stepTotal: ALL_DOWNLOAD_KINDS.length,
              userPercent,
              overallUserPercent,
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
        signal: abortController.signal,
        videoFormat: kind === "video" ? videoFormat : undefined,
        onProgress: (progress) => {
          sendSse(res, "progress", {
            ...progress,
            step: kind,
            userPercent: readUserPercent(progress),
          });
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
    if (activeDownload?.response === res) {
      sendSse(res, "failed", {
        message: error instanceof Error ? error.message : "Download failed.",
      });
    }
  } finally {
    clearInterval(keepalive);
    if (activeDownload?.response === res) {
      activeDownload = null;
      downloadInProgress = false;
    }
    if (!res.writableEnded) {
      res.end();
    }
  }
});

export interface ServerInfo {
  port: number;
  host: string;
  url: string;
}

export function startServer(
  port = defaultPort,
  host = defaultHost,
): Promise<ServerInfo> {
  return runStartupChecks().then(() =>
    new Promise((resolve) => {
      app.listen(port, host, () => {
        const browseHost =
          host === "127.0.0.1" || host === "::1" ? "localhost" : host;
        const url = `http://${browseHost}:${port}`;
        console.log(`YouTube downloader running at ${url}`);
        console.log(`Bound to ${host}:${port} (not reachable from other machines)`);
        console.log(`Saving files to: ${getDesktopPath()}`);
        resolve({ port, host, url });
      });
    }),
  );
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
