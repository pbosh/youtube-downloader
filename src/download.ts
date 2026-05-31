import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export type DownloadKind = "mp3" | "video" | "thumb";
export type DownloadPhase = "download" | "extract" | "merge" | "done";

export interface DownloadProgress {
  phase: DownloadPhase;
  percent?: number;
  message?: string;
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

const DOWNLOAD_RE =
  /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\s*\w+)/i;
const EXTRACT_RE = /\[ExtractAudio\]\s+Destination:\s+(.+)/i;
const MERGER_RE = /\[Merger\]\s+Merging formats into "(.+)"/i;

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
    "-o",
    outputTemplate,
    "--print",
    "after_move:filepath",
    "--print",
    "title",
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

  const printedLines: string[] = [];
  const startedAt = Date.now();

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ytDlp, args, { stdio: ["ignore", "pipe", "pipe"] });

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const downloadMatch = trimmed.match(DOWNLOAD_RE);
      if (downloadMatch) {
        options.onProgress?.({
          phase: "download",
          percent: parseFloat(downloadMatch[1]!),
          message: downloadMatch[2]!.trim(),
        });
        return;
      }

      if (trimmed.includes("[ExtractAudio]")) {
        const extractMatch = trimmed.match(EXTRACT_RE);
        options.onProgress?.({
          phase: "extract",
          message: extractMatch?.[1]?.trim() ?? "Converting to MP3...",
        });
        return;
      }

      if (trimmed.includes("[Merger]")) {
        const mergeMatch = trimmed.match(MERGER_RE);
        options.onProgress?.({
          phase: "merge",
          percent: 100,
          message: mergeMatch?.[1]?.trim() ?? "Merging video and audio...",
        });
      }
    };

    let stdoutBuffer = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) printedLines.push(trimmed);
      }
    });

    let stderrBuffer = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (stderrBuffer) handleLine(stderrBuffer);
      if (stdoutBuffer.trim()) printedLines.push(stdoutBuffer.trim());

      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });
  });

  let outputPath =
    printedLines.find(
      (line) => path.isAbsolute(line) && path.extname(line) !== "",
    ) ?? "";
  const title =
    printedLines.find((line) => line !== outputPath && line.length > 0) ?? "";

  if (!outputPath && options.kind === "thumb") {
    outputPath = await findNewestImageSince(options.outputDir, startedAt - 1000);
  }

  if (!outputPath) {
    throw new Error("Download finished but no output file was reported.");
  }

  await access(outputPath);

  options.onProgress?.({ phase: "done", message: outputPath });

  return {
    outputPath,
    title: title || path.basename(outputPath, path.extname(outputPath)),
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
