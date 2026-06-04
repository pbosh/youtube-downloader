import type { DownloadKind, DownloadProgressPayload } from "../types/api";

export const STEP_KINDS: DownloadKind[] = ["mp3", "video", "thumb"];
export const DOWNLOAD_LOG_INTERVAL_MS = 5000;
export const STALL_MS = 300_000;

export function formatEtaLabel(etaSeconds: number) {
  const total = Math.max(0, Math.round(etaSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `~${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} left`;
  }
  return `~${minutes}:${String(seconds).padStart(2, "0")} left`;
}

export function parseDownloadSizeLabel(value: unknown) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const embedded = trimmed.match(
    /^([\d.]+\s*(?:KiB|MiB|GiB|TiB|KB|MB|GB|TB|B))(?:\s|$|·)/i,
  );
  if (embedded) {
    return embedded[1]!.replace(/\s+/g, "");
  }
  if (/^[\d.]+\s*(?:KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)$/i.test(trimmed)) {
    return trimmed.replace(/\s+/g, "");
  }
  return null;
}

function parseDownloadSizeToBytes(label: string) {
  const match = label.match(/^([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const units: Record<string, number> = {
    B: 1,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
  };
  const multiplier = units[match[2]!.toUpperCase()];
  return multiplier ? amount * multiplier : null;
}

export function formatDownloadByteProgress(percent: number, totalSizeLabel: string) {
  const normalized = parseDownloadSizeLabel(totalSizeLabel) ?? totalSizeLabel;
  const totalBytes = parseDownloadSizeToBytes(normalized);
  if (totalBytes == null || totalBytes <= 0) return null;

  const clamped = Math.min(100, Math.max(0, percent));
  const downloadedBytes = (clamped / 100) * totalBytes;
  const toMb = (bytes: number) => bytes / (1024 * 1024);
  const downloadedMb = toMb(downloadedBytes);
  const totalMb = toMb(totalBytes);

  if (totalMb < 1) {
    return `${downloadedMb.toFixed(1)}/${totalMb.toFixed(1)}MB`;
  }

  return `${Math.round(downloadedMb)}/${Math.round(totalMb)}MB`;
}

export function isDownloadStage(data: DownloadProgressPayload) {
  return data.stage === "download" || data.phase === "download";
}

export function downloadConsoleDetail(data: DownloadProgressPayload) {
  if (!isDownloadStage(data)) {
    return data.message ? ` — ${data.message}` : "";
  }

  const sizeLabel =
    parseDownloadSizeLabel(data.downloadSizeLabel) ??
    parseDownloadSizeLabel(data.message);

  if (typeof data.downloadPercent === "number" && sizeLabel) {
    const formatted = formatDownloadByteProgress(data.downloadPercent, sizeLabel);
    if (formatted) {
      return ` — ${formatted}`;
    }
  }

  if (data.message && /^\d+\/\d+(?:\.\d+)?MB$/.test(data.message)) {
    return ` — ${data.message}`;
  }

  return data.message ? ` — ${data.message}` : "";
}

export function phaseLabel(phase: string | undefined, kind: DownloadKind, stage?: string) {
  if (stage === "prepare") return "Preparing";
  switch (phase) {
    case "starting":
      return "Starting";
    case "download":
      if (kind === "video") return "Downloading video";
      if (kind === "thumb") return "Downloading thumbnail";
      return "Downloading MP3";
    case "extract":
      return "Converting to MP3";
    case "merge":
      return "Merging video";
    case "finalize":
      return "Finishing up";
    case "done":
      return "Done";
    default:
      return "Working";
  }
}

export function shouldLogProgress(
  kind: DownloadKind,
  data: DownloadProgressPayload,
  state: {
    lastProgressLogKey: string;
    lastDownloadLogAt: number;
  },
) {
  if (isDownloadStage(data)) {
    const now = Date.now();
    if (
      state.lastDownloadLogAt > 0 &&
      now - state.lastDownloadLogAt < DOWNLOAD_LOG_INTERVAL_MS
    ) {
      return false;
    }
    state.lastDownloadLogAt = now;
    return true;
  }

  const step =
    kind === "all"
      ? data.step ??
        STEP_KINDS[Math.max(0, (data.stepIndex ?? 1) - 1)] ??
        "mp3"
      : kind;
  const etaBucket =
    typeof data.etaSeconds === "number" ? Math.floor(data.etaSeconds / 5) : "";
  const key = `${step}:${data.stage ?? ""}:${data.phase}:${data.message ?? ""}:${etaBucket}`;
  if (key === state.lastProgressLogKey) return false;
  state.lastProgressLogKey = key;
  return true;
}

export function requestDesktopResize() {
  window.electronDesktop?.requestResize?.();
}
