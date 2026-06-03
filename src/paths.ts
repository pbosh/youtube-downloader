import os from "node:os";
import path from "node:path";

export function getDesktopPath(): string {
  return path.join(os.homedir(), "Desktop");
}

export function getAppStateDir(): string {
  const fromEnv = process.env.YT_DOWNLOADER_STATE_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "youtube-downloader",
    );
  }

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), "youtube-downloader");
  }

  return path.join(os.homedir(), ".config", "youtube-downloader");
}
