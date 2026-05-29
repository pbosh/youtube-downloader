import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export type DownloadPhase = "download" | "extract" | "done" | "error";

export interface DownloadProgress {
  phase: DownloadPhase;
  percent?: number;
  message?: string;
}

export interface DownloadOptions {
  url: string;
  outputDir: string;
  onProgress?: (progress: DownloadProgress) => void;
}

export interface DownloadResult {
  outputPath: string;
  title: string;
}

const DOWNLOAD_RE =
  /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\s*\w+)/i;
const EXTRACT_RE = /\[ExtractAudio\]\s+Destination:\s+(.+)/i;
const MERGE_RE = /\[Merger\]\s+Merging formats into "(.+)"/i;

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

export async function downloadMp3(
  options: DownloadOptions,
): Promise<DownloadResult> {
  const ytDlp = await findYtDlp();
  const outputTemplate = path.join(options.outputDir, "%(title)s.%(ext)s");

  const args = [
    options.url,
    "--no-playlist",
    "--newline",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "320K",
    "--embed-thumbnail",
    "--add-metadata",
    "-o",
    outputTemplate,
    "--print",
    "after_move:filepath",
    "--print",
    "title",
  ];

  let outputPath = "";
  let title = "";

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
        options.onProgress?.({
          phase: "download",
          percent: 100,
          message: "Merging audio streams...",
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
        if (!trimmed) continue;

        if (!outputPath && trimmed.endsWith(".mp3")) {
          outputPath = trimmed;
          continue;
        }
        if (!title && outputPath && trimmed !== outputPath) {
          title = trimmed;
        }
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
      if (stdoutBuffer.trim()) {
        const line = stdoutBuffer.trim();
        if (!outputPath && line.endsWith(".mp3")) outputPath = line;
        else if (!title && outputPath) title = line;
      }

      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });
  });

  if (!outputPath) {
    throw new Error("Download finished but no output file was reported.");
  }

  await access(outputPath);

  options.onProgress?.({ phase: "done", message: outputPath });

  return {
    outputPath,
    title: title || path.basename(outputPath, ".mp3"),
  };
}

export async function ensureOutputDir(outputDir: string): Promise<string> {
  const resolved = path.resolve(outputDir);
  await access(resolved).catch(async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(resolved, { recursive: true });
  });
  return resolved;
}
