import { access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const YT_DLP_NAMES = ["yt-dlp", "yt-dlp.exe"] as const;
const FFMPEG_NAMES = ["ffmpeg", "ffmpeg.exe"] as const;

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function firstExecutable(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

function repoBundledBinDir(): string {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const arch = process.arch === "x64" ? "x64" : process.arch;
  return path.join(repoRoot, "resources", "bin", process.platform, arch);
}

function bundledBinDir(): string {
  const fromEnv = process.env.YT_DLP_BIN_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  return repoBundledBinDir();
}

export async function configureBundledToolPaths(): Promise<void> {
  const binDir = bundledBinDir();
  const ytDlpName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const ytDlpPath = path.join(binDir, ytDlpName);
  const ffmpegPath = path.join(binDir, ffmpegName);

  if (await isExecutable(ytDlpPath)) {
    process.env.YT_DLP_BIN_DIR = binDir;
    process.env.YT_DLP_PATH = ytDlpPath;
  }

  if (await isExecutable(ffmpegPath)) {
    process.env.FFMPEG_PATH = ffmpegPath;
  }
}

export interface VerifiedDownloadTools {
  ytDlp: string;
  ffmpeg?: string;
}

export async function verifyDownloadTools(): Promise<VerifiedDownloadTools> {
  const ytDlp = await resolveYtDlp();
  const ffmpeg = await resolveFfmpegLocation();
  return { ytDlp, ffmpeg };
}

function bundledNames(base: string, names: readonly string[]): string[] {
  const dir = bundledBinDir();
  return names.map((name) => path.join(dir, name));
}

export async function resolveYtDlp(): Promise<string> {
  const fromEnv = process.env.YT_DLP_PATH?.trim();
  const candidates = [
    ...(fromEnv ? [path.resolve(fromEnv)] : []),
    ...bundledNames("yt-dlp", YT_DLP_NAMES),
    ...YT_DLP_NAMES,
  ];

  const resolved = await firstExecutable(candidates);
  if (resolved) {
    return resolved;
  }

  throw new Error(
    "yt-dlp not found. Install it with: brew install yt-dlp",
  );
}

export async function resolveFfmpegLocation(): Promise<string | undefined> {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  const candidates = [
    ...(fromEnv ? [path.resolve(fromEnv)] : []),
    ...bundledNames("ffmpeg", FFMPEG_NAMES),
    ...FFMPEG_NAMES,
  ];

  const resolved = await firstExecutable(candidates);
  if (!resolved) {
    return undefined;
  }

  const statPath = path.resolve(resolved);
  try {
    const { stat } = await import("node:fs/promises");
    const fileStat = await stat(statPath);
    if (fileStat.isDirectory()) {
      return statPath;
    }
  } catch {
    return path.dirname(statPath);
  }

  return path.dirname(statPath);
}

export async function resolveFfmpegBinary(): Promise<string> {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  const candidates = [
    ...(fromEnv ? [path.resolve(fromEnv)] : []),
    ...bundledNames("ffmpeg", FFMPEG_NAMES),
    ...FFMPEG_NAMES,
  ];

  const resolved = await firstExecutable(candidates);
  if (resolved) {
    return resolved;
  }

  throw new Error(
    "ffmpeg not found. Install it with: brew install ffmpeg",
  );
}
