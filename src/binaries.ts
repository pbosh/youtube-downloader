import { access, constants } from "node:fs/promises";
import path from "node:path";

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

function bundledBinDir(): string | null {
  const dir = process.env.YT_DLP_BIN_DIR?.trim();
  return dir ? path.resolve(dir) : null;
}

function bundledNames(base: string, names: readonly string[]): string[] {
  const dir = bundledBinDir();
  if (!dir) return [];
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
