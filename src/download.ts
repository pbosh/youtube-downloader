import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { resolveFfmpegBinary, resolveFfmpegLocation, resolveYtDlp } from "./binaries.js";
import {
  detectPipelineSignal,
  PipelineProgressTracker,
} from "./pipeline-progress.js";
import {
  clearActiveDownloadPid,
  registerActiveDownloadPid,
} from "./startup.js";

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
  downloadPercent?: number;
  downloadSizeLabel?: string;
}

export interface DownloadOptions {
  url: string;
  outputDir: string;
  kind: DownloadKind;
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
  videoFormat?: {
    formatSelector: string;
    needsConversion: boolean;
    label?: string;
  };
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
  /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\s*(?:KiB|MiB|GiB|TiB|KB|MB|GB|TB|B))/i;
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

const durationCache = new Map<string, number>();
let activeProcess: ChildProcess | null = null;

function trackActiveProcess(proc: ChildProcess) {
  activeProcess = proc;
  const clear = () => {
    if (activeProcess === proc) {
      activeProcess = null;
    }
  };
  proc.once("close", clear);
  proc.once("error", clear);
}

export function killActiveDownloadProcesses(): void {
  if (activeProcess) {
    killProcessTree(activeProcess);
    activeProcess = null;
  }
  void clearActiveDownloadPid();
}

async function findYtDlp(): Promise<string> {
  return resolveYtDlp();
}

async function fetchMediaDuration(url: string): Promise<number | undefined> {
  const cached = durationCache.get(url);
  if (cached != null) {
    return cached;
  }

  let ytDlp: string;
  try {
    ytDlp = await findYtDlp();
  } catch {
    return undefined;
  }

  return new Promise((resolve) => {
    const proc = spawn(
      ytDlp,
      [url, "--no-playlist", "--no-warnings", "--no-progress", "--print", "duration"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );

    let output = "";
    let settled = false;

    const finish = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      killProcessTree(proc);
      finish(undefined);
    }, 30_000);

    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.on("error", () => finish(undefined));
    proc.on("close", () => {
      const seconds = Number.parseFloat(output.trim());
      const resolved =
        Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
      if (resolved != null) {
        durationCache.set(url, resolved);
      }
      finish(resolved);
    });
  });
}

function killProcessTree(proc: ChildProcess) {
  if (proc.killed || proc.exitCode != null) {
    return;
  }

  if (process.platform !== "win32" && proc.pid != null) {
    try {
      process.kill(-proc.pid, "SIGTERM");
      return;
    } catch {
      // Fall back to killing the direct child only.
    }
  }

  proc.kill("SIGTERM");
}

async function convertVideoToQuickTimeMp4(options: {
  sourcePath: string;
  signal?: AbortSignal;
  onLine?: (line: string) => void;
}): Promise<string> {
  const ffmpeg = await resolveFfmpegBinary();
  const sourcePath = path.resolve(options.sourcePath);
  const dir = path.dirname(sourcePath);
  const base = path.basename(sourcePath, path.extname(sourcePath));
  const finalPath = path.join(dir, `${base}.mp4`);
  const tempPath = path.join(dir, `.${base}.quicktime.tmp.mp4`);

  try {
    await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-nostdin",
        "-stats_period",
        "1",
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-map_metadata",
        "0",
        "-dn",
        "-sn",
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-level",
        "4.1",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-y",
        tempPath,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      },
    );
    trackActiveProcess(proc);

    const handleChunk = (chunk: Buffer) => {
      const lines = stripAnsi(chunk.toString()).split(/\r?\n/);
      for (const line of lines) {
        if (line.trim()) {
          options.onLine?.(line.trim());
        }
      }
    };

    proc.stderr.on("data", handleChunk);
    proc.stdout.on("data", handleChunk);

    waitForProcessExit(proc, options.signal, () => null, "ffmpeg")
      .then(resolve)
      .catch(reject);
    });

    const { unlink, rename } = await import("node:fs/promises");

    if (path.resolve(sourcePath) !== path.resolve(finalPath)) {
      await unlink(sourcePath).catch(() => {});
    } else {
      await unlink(sourcePath).catch(() => {});
    }

    if (path.resolve(finalPath) !== path.resolve(tempPath)) {
      await unlink(finalPath).catch(() => {});
    }

    await rename(tempPath, finalPath);
    return finalPath;
  } catch (error) {
    const { unlink } = await import("node:fs/promises");
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

function waitForProcessExit(
  proc: ChildProcess,
  signal?: AbortSignal,
  getExitError?: () => Error | null,
  processName = "yt-dlp",
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    const onAbort = () => {
      killProcessTree(proc);
      finish(new Error("Download cancelled."));
    };

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      proc.off("error", onProcessError);
      proc.off("close", onClose);
    };

    const onProcessError = (error: Error) => {
      finish(error);
    };

    const onClose = (code: number | null) => {
      if (signal?.aborted) {
        finish(new Error("Download cancelled."));
        return;
      }

      const customError = getExitError?.();
      if (customError) {
        finish(customError);
        return;
      }

      if (code === 0) {
        finish();
        return;
      }

      finish(new Error(`${processName} exited with code ${code ?? "unknown"}`));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    proc.on("error", onProcessError);
    proc.on("close", onClose);
  });
}

function buildArgs(
  kind: DownloadKind,
  url: string,
  outputTemplate: string,
  ffmpegLocation?: string,
  videoFormat?: DownloadOptions["videoFormat"],
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

  const withFfmpeg =
    ffmpegLocation != null && ffmpegLocation.length > 0
      ? [
          ...common.slice(0, 3),
          "--ffmpeg-location",
          ffmpegLocation,
          ...common.slice(3),
        ]
      : common;

  if (kind === "mp3") {
    return [
      ...withFfmpeg.slice(0, 3),
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "320K",
      "--embed-thumbnail",
      "--add-metadata",
      "--postprocessor-args",
      "ffmpeg:-stats_period 1",
      ...withFfmpeg.slice(3),
    ];
  }

  if (kind === "video") {
    const formatSelector =
      videoFormat?.formatSelector ??
      "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/best[vcodec^=avc1]/b";

    return [
      ...withFfmpeg.slice(0, 3),
      "-f",
      formatSelector,
      "--merge-output-format",
      "mp4",
      "--add-metadata",
      "--write-thumbnail",
      ...withFfmpeg.slice(3),
    ];
  }

  return [
    ...withFfmpeg.slice(0, 3),
    "--skip-download",
    "--write-thumbnail",
    "--convert-thumbnails",
    "jpg",
    ...withFfmpeg.slice(3),
  ];
}

export async function downloadMedia(
  options: DownloadOptions,
): Promise<DownloadResult> {
  const ytDlp = await findYtDlp();
  const ffmpegLocation = await resolveFfmpegLocation();
  const outputTemplate = path.join(options.outputDir, "%(title)s.%(ext)s");
  const args = buildArgs(
    options.kind,
    options.url,
    outputTemplate,
    ffmpegLocation,
    options.videoFormat,
  );

  const startedAt = Date.now();
  let sawByteProgress = false;
  let outputPath = "";
  const tracker = new PipelineProgressTracker(options.kind);
  const idleRef: { bump: () => void } = { bump: () => {} };

  void fetchMediaDuration(options.url).then((seconds) => {
    if (seconds != null) {
      tracker.setMediaDuration(seconds);
    }
  });

  tracker.start((payload) => {
    idleRef.bump();
    options.onProgress?.({
      phase: payload.phase,
      stage: payload.stage,
      userPercent: payload.userPercent,
      etaSeconds: payload.etaSeconds,
      message: payload.message,
      downloadPercent: payload.downloadPercent,
      downloadSizeLabel: payload.downloadSizeLabel,
    });
  });

  try {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ytDlp, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      detached: process.platform !== "win32",
    });
    trackActiveProcess(proc);

    if (proc.pid != null) {
      void registerActiveDownloadPid(proc.pid);
    }

    const idleTimeoutMs = 600_000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let stalled = false;

    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const resetIdleTimer = () => {
      clearIdleTimer();
      idleTimer = setTimeout(() => {
        stalled = true;
        killProcessTree(proc);
      }, idleTimeoutMs);
    };

    idleRef.bump = resetIdleTimer;
    resetIdleTimer();

    const handleLine = (line: string) => {
      resetIdleTimer();

      const ffmpegTime = line.match(/time=(\d+:\d+:\d+(?:\.\d+)?|\d+:\d+(?:\.\d+)?)/);
      if (ffmpegTime && options.kind === "mp3") {
        tracker.noteFfmpegProgress(ffmpegTime[1]!, "extract");
      } else if (ffmpegTime && options.kind === "video") {
        tracker.noteFfmpegProgress(ffmpegTime[1]!, "merge");
      }

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

    waitForProcessExit(proc, options.signal, () =>
      stalled
        ? new Error(
            "Download stalled with no output from yt-dlp for 10 minutes.",
          )
        : null,
    )
      .then(() => {
        clearIdleTimer();
        stdoutStream.flush();
        stderrStream.flush();
        resolve();
      })
      .catch((error) => {
        clearIdleTimer();
        reject(error);
      });
  });

  if (!outputPath && options.kind === "thumb") {
    outputPath = await findNewestImageSince(options.outputDir, startedAt - 1000);
  }

  if (!outputPath) {
    throw new Error("Download finished but no output file was reported.");
  }

  await access(outputPath);

  if (options.kind === "video" && options.videoFormat?.needsConversion) {
    await resolveFfmpegBinary();
    tracker.noteMerge("Converting to H.264 with ffmpeg...");
    outputPath = await convertVideoToQuickTimeMp4({
      sourcePath: outputPath,
      signal: options.signal,
      onLine: (line) => {
        const ffmpegTime = line.match(
          /time=(\d+:\d+:\d+(?:\.\d+)?|\d+:\d+(?:\.\d+)?)/,
        );
        if (ffmpegTime) {
          tracker.noteFfmpegProgress(ffmpegTime[1]!, "merge");
        }
      },
    });
    await access(outputPath);
  }

  tracker.complete((payload) => {
    options.onProgress?.({
      phase: payload.phase,
      stage: payload.stage,
      userPercent: payload.userPercent,
      etaSeconds: payload.etaSeconds,
      message: outputPath,
    });
  });

  const title = path.basename(outputPath, path.extname(outputPath));

  return {
    outputPath,
    title,
  };
  } finally {
    tracker.stop();
    await clearActiveDownloadPid();
  }
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
