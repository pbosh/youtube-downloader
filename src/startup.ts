import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { configureBundledToolPaths, verifyDownloadTools } from "./binaries.js";
import { getAppStateDir } from "./paths.js";

const ACTIVE_DOWNLOAD_PID = "active-download.pid";

export function activeDownloadPidPath(): string {
  return path.join(getAppStateDir(), ACTIVE_DOWNLOAD_PID);
}

export async function registerActiveDownloadPid(pid: number): Promise<void> {
  const stateDir = getAppStateDir();
  await mkdir(stateDir, { recursive: true });
  await writeActiveDownloadPid(pid);
}

export async function clearActiveDownloadPid(): Promise<void> {
  try {
    await unlink(activeDownloadPidPath());
  } catch {
    // No active download marker.
  }
}

async function writeActiveDownloadPid(pid: number): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(activeDownloadPidPath(), `${pid}\n`, "utf8");
}

export async function cleanupStaleDownloadProcess(): Promise<number | null> {
  let killedPid: number | null = null;

  try {
    const raw = await readFile(activeDownloadPidPath(), "utf8");
    const pid = Number.parseInt(raw.trim(), 10);

    if (Number.isFinite(pid) && pid > 0) {
      killedPid = pid;
      if (process.platform !== "win32") {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          try {
            process.kill(pid, "SIGTERM");
          } catch {
            killedPid = null;
          }
        }
      } else {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          killedPid = null;
        }
      }
    }
  } catch {
    // No stale marker from a prior run.
  } finally {
    await clearActiveDownloadPid();
  }

  return killedPid;
}

export interface StartupCheckResult {
  ytDlp: string;
  ffmpeg?: string;
  cleanedStaleDownloadPid: number | null;
}

export async function runStartupChecks(): Promise<StartupCheckResult> {
  await configureBundledToolPaths();
  const cleanedStaleDownloadPid = await cleanupStaleDownloadProcess();
  const tools = await verifyDownloadTools();

  console.log(`Using yt-dlp: ${tools.ytDlp}`);
  if (tools.ffmpeg) {
    console.log(`Using ffmpeg: ${tools.ffmpeg}`);
  } else {
    console.warn("ffmpeg not found — video/audio conversion may fail.");
  }

  if (cleanedStaleDownloadPid != null) {
    console.log(
      `Stopped stale download process from previous run (pid ${cleanedStaleDownloadPid}).`,
    );
  }

  return {
    ...tools,
    cleanedStaleDownloadPid,
  };
}
