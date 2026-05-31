import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import {
  detectPipelineSignal,
  PipelineProgressTracker,
} from "./pipeline-progress.js";

export type DownloadKind = "mp3" | "video" | "thumb";
export type DownloadPhase =
  | "download"
  | "extract"
  | "merge"
  | "finalize"
  | "done";

export interface DownloadProgress {
  phase: DownloadPhase;
  stage?: string;
  userPercent?: number;
  percent?: number;
  message?: string;
  etaSeconds?: number;
}

export interface DownloadOptions {
  url: string;
  outputDir: string;
  kind: DownloadKind;
  onProgress?: (progress: DownloadProgress) => void;
}

export interface DownloadResult {
  outputPath: string;
  title: string;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(line: string): string {
  return line.replace(ANSI_RE, "").trim();
}

function createStreamLineHandler(onLine: (line: string) => void) {
  let buffer = "";

  const push = (chunk: string) => {
    buffer += chunk.replace(/\r/g, "\n");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = stripAnsi(line);
      if (trimmed) onLine(trimmed);
    }
  };

  const flush = () => {
    if (!buffer) return;
    const trimmed = stripAnsi(buffer);
    buffer = "";
    if (trimmed) onLine(trimmed);
  };

  return { push, flush };
}
const DOWNLOAD_RE =
  /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\s*\w+)/i;
const DOWNLOAD_DEST_RE = /\[download\]\s+Destination:\s+(.+)/i;
const DOWNLOAD_FRAGMENT_RE =
  /\[download\]\s+(?:Downloading\s+)?(?:item\s+)?(\d+) of (\d+)/i;
const EXTRACT_DEST_RE = /\[ExtractAudio\]\s+Destination:\s+(.+)/i;
const MERGER_DEST_RE = /\[Merger\]\s+Merging formats into "(.+)"/i;
const POSTPROC_DEST_RE =
  /Adding (?:metadata|thumbnail) to "(.+)"/i;
const ETA_RE = /ETA\s+(\d+(?::\d+)+)/i;

function parseEtaSeconds(line: string): number | undefined {
  const match = line.match(ETA_RE);
  if (!match) return undefined;

  const parts = match[1]!.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return undefined;

  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }

  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }

  return undefined;
}

function downloadMessage(sizeLabel: string): string {
  return sizeLabel;
}

async function findYtDlp(): Promise<string> {
  const candidates = ["yt-dlp", "yt-dlp.exe"];

  for (const candidate of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(candidate, ["--version"], { stdio: "ignore" });
        proc.on("error", reject);
        proc.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`exit ${code}`)),
        );
      });
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    "yt-dlp not found. Install it with: brew install yt-dlp",
  );
}

function buildArgs(
  kind: DownloadKind,
  url: string,
  outputTemplate: string,
): string[] {
  const common = [
    url,
    "--no-playlist",
    "--newline",
    "--no-colors",
    "--progress",
    "-o",
    outputTemplate,
  ];

  if (kind === "mp3") {
    return [
      ...common.slice(0, 3),
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "320K",
      "--embed-thumbnail",
      "--add-metadata",
      ...common.slice(3),
    ];
  }

  if (kind === "video") {
    return [
      ...common.slice(0, 3),
      "-f",
      "bv*+ba/b",
      "--merge-output-format",
      "mp4",
      "--add-metadata",
      "--embed-thumbnail",
      ...common.slice(3),
    ];
  }

  return [
    ...common.slice(0, 3),
    "--skip-download",
    "--write-thumbnail",
    "--convert-thumbnails",
    "jpg",
    ...common.slice(3),
  ];
}

export async function downloadMedia(
  options: DownloadOptions,
): Promise<DownloadResult> {
  const ytDlp = await findYtDlp();
  const outputTemplate = path.join(options.outputDir, "%(title)s.%(ext)s");
  const args = buildArgs(options.kind, options.url, outputTemplate);

  const startedAt = Date.now();
  let sawByteProgress = false;
  let outputPath = "";
  const tracker = new PipelineProgressTracker(options.kind);

  tracker.start((payload) => {
    options.onProgress?.({
      phase: payload.phase,
      stage: payload.stage,
      userPercent: payload.userPercent,
      etaSeconds: payload.etaSeconds,
      message: payload.message,
    });
  });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ytDlp, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    const handleLine = (line: string) => {
      const signal = detectPipelineSignal(options.kind, line);
      if (signal?.action === "prepare") tracker.notePrepare();
      if (signal?.action === "artwork") tracker.noteArtworkFetch(signal.detail);
      if (signal?.action === "extract") tracker.noteExtract(signal.detail);
      if (signal?.action === "merge") tracker.noteMerge(signal.detail);
      if (signal?.action === "finalize") tracker.noteFinalize(signal.detail);
      if (signal?.action === "download-done") tracker.noteDownloadComplete(signal.detail);

      const extractDest = line.match(EXTRACT_DEST_RE);
      if (extractDest) {
        outputPath = extractDest[1]!.trim();
      }

      const mergerDest = line.match(MERGER_DEST_RE);
      if (mergerDest) {
        outputPath = mergerDest[1]!.trim();
      }

      const postDest = line.match(POSTPROC_DEST_RE);
      if (postDest) {
        outputPath = postDest[1]!.trim();
      }

      const downloadMatch = line.match(DOWNLOAD_RE);
      if (downloadMatch) {
        sawByteProgress = true;
        const rawPercent = parseFloat(downloadMatch[1]!);
        const sizeMessage = downloadMatch[2]!.trim();
        const etaSeconds = parseEtaSeconds(line);

        tracker.noteDownloadProgress(
          rawPercent,
          etaSeconds,
          downloadMessage(sizeMessage),
        );
        return;
      }

      const destMatch = line.match(DOWNLOAD_DEST_RE);
      if (destMatch) {
        return;
      }

      const fragmentMatch = line.match(DOWNLOAD_FRAGMENT_RE);
      if (fragmentMatch) {
        sawByteProgress = true;
        const index = parseInt(fragmentMatch[1]!, 10);
        const total = parseInt(fragmentMatch[2]!, 10);
        const percent = total > 0 ? (index / total) * 100 : 0;
        const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
        const etaSeconds =
          index > 0 && total > index
            ? (elapsedSec / index) * (total - index)
            : undefined;

        tracker.noteDownloadProgress(
          percent,
          etaSeconds,
          etaSeconds != null
            ? `Fragment ${index}/${total}`
            : `Fragment ${index}/${total}`,
        );
        return;
      }

      if (
        options.kind === "thumb" &&
        !sawByteProgress &&
        (line.includes("[info]") ||
          line.includes("Thumbnail") ||
          line.includes("Writing"))
      ) {
        sawByteProgress = true;
        tracker.noteDownloadProgress(45, 12, "Fetching thumbnail...");
        return;
      }
    };

    const stdoutStream = createStreamLineHandler(handleLine);
    const stderrStream = createStreamLineHandler(handleLine);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutStream.push(chunk.toString());
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrStream.push(chunk.toString());
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      stdoutStream.flush();
      stderrStream.flush();

      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });
  });

  if (!outputPath && options.kind === "thumb") {
    outputPath = await findNewestImageSince(options.outputDir, startedAt - 1000);
  }

  if (!outputPath) {
    throw new Error("Download finished but no output file was reported.");
  }

  await access(outputPath);

  tracker.complete((payload) => {
    options.onProgress?.({
      phase: payload.phase,
      stage: payload.stage,
      userPercent: payload.userPercent,
      etaSeconds: payload.etaSeconds,
      message: outputPath,
    });
  });
  tracker.stop();

  const title = path.basename(outputPath, path.extname(outputPath));

  return {
    outputPath,
    title,
  };
}

export async function downloadMp3(
  options: Omit<DownloadOptions, "kind">,
): Promise<DownloadResult> {
  return downloadMedia({ ...options, kind: "mp3" });
}

export async function downloadVideo(
  options: Omit<DownloadOptions, "kind">,
): Promise<DownloadResult> {
  return downloadMedia({ ...options, kind: "video" });
}

async function findNewestImageSince(
  outputDir: string,
  sinceMs: number,
): Promise<string> {
  const { readdir, stat } = await import("node:fs/promises");
  const extensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  let newestPath = "";
  let newestTime = sinceMs;

  for (const entry of await readdir(outputDir)) {
    const ext = path.extname(entry).toLowerCase();
    if (!extensions.has(ext)) continue;

    const fullPath = path.join(outputDir, entry);
    const fileStat = await stat(fullPath);
    if (fileStat.mtimeMs >= newestTime) {
      newestTime = fileStat.mtimeMs;
      newestPath = fullPath;
    }
  }

  return newestPath;
}

export async function ensureOutputDir(outputDir: string): Promise<string> {
  const resolved = path.resolve(outputDir);
  await access(resolved).catch(async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(resolved, { recursive: true });
  });
  return resolved;
}

export {
  isValidUrl,
  isValidYouTubeUrl,
  normalizeUrl,
  normalizeYouTubeUrl,
} from "./youtube-url.js";
