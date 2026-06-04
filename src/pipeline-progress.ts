import type { DownloadKind, DownloadPhase } from "./download.js";

export type PipelineStage =
  | "prepare"
  | "download"
  | "extract"
  | "merge"
  | "finalize";

export interface PipelineProgressPayload {
  phase: DownloadPhase;
  stage: PipelineStage;
  userPercent: number;
  etaSeconds?: number;
  message?: string;
  percent?: number;
  downloadPercent?: number;
  downloadSizeLabel?: string;
}

interface StageDef {
  stage: PipelineStage;
  weight: number;
  seconds: number;
}

const REFERENCE_DURATION_SECONDS = 600;

const BASE_PIPELINES: Record<DownloadKind, StageDef[]> = {
  mp3: [
    { stage: "prepare", weight: 0.05, seconds: 4 },
    { stage: "download", weight: 0.275, seconds: 45 },
    { stage: "extract", weight: 0.2, seconds: 120 },
    { stage: "finalize", weight: 0.475, seconds: 45 },
  ],
  video: [
    { stage: "prepare", weight: 0.05, seconds: 4 },
    { stage: "download", weight: 0.62, seconds: 120 },
    { stage: "merge", weight: 0.13, seconds: 12 },
    { stage: "finalize", weight: 0.2, seconds: 16 },
  ],
  thumb: [
    { stage: "prepare", weight: 0.1, seconds: 3 },
    { stage: "download", weight: 0.75, seconds: 12 },
    { stage: "finalize", weight: 0.15, seconds: 5 },
  ],
};

function cloneStages(stages: StageDef[]): StageDef[] {
  return stages.map((stage) => ({ ...stage }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseTimecodeToSeconds(value: string): number | null {
  const parts = value
    .trim()
    .split(":")
    .map((part) => Number.parseFloat(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }

  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }

  if (parts.length === 1) {
    return parts[0]!;
  }

  return null;
}

const SIZE_LABEL_RE =
  /^([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/i;

const SIZE_UNIT_BYTES: Record<string, number> = {
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

function extractSizeLabel(value: string): string | null {
  const trimmed = value.trim();
  const embedded = trimmed.match(
    /^([\d.]+\s*(?:KiB|MiB|GiB|TiB|KB|MB|GB|TB|B))(?:\s|$|·)/i,
  );
  if (embedded) {
    return embedded[1]!.replace(/\s+/g, "");
  }

  if (parseSizeLabelToBytes(trimmed) != null) {
    return trimmed.replace(/\s+/g, "");
  }

  return null;
}

function parseSizeLabelToBytes(label: string): number | null {
  const match = label.trim().match(SIZE_LABEL_RE);
  if (!match) return null;

  const value = Number.parseFloat(match[1]!);
  if (!Number.isFinite(value) || value < 0) return null;

  const unit = match[2]!.toUpperCase();
  const multiplier = SIZE_UNIT_BYTES[unit as keyof typeof SIZE_UNIT_BYTES];
  if (multiplier == null) return null;

  return value * multiplier;
}

export function formatDownloadByteProgress(
  percent: number,
  totalSizeLabel: string,
): string | null {
  const totalBytes = parseSizeLabelToBytes(totalSizeLabel);
  if (totalBytes == null || totalBytes <= 0) return null;

  const clamped = clamp(percent, 0, 100);
  const downloadedBytes = (clamped / 100) * totalBytes;
  const toMb = (bytes: number) => bytes / (1024 * 1024);
  const downloadedMb = toMb(downloadedBytes);
  const totalMb = toMb(totalBytes);

  if (totalMb < 1) {
    return `${downloadedMb.toFixed(1)}/${totalMb.toFixed(1)}MB`;
  }

  return `${Math.round(downloadedMb)}/${Math.round(totalMb)}MB`;
}

export function formatMediaDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

const STAGE_MESSAGES: Record<PipelineStage, string> = {
  prepare: "Preparing...",
  download: "Downloading...",
  extract: "Converting to MP3...",
  merge: "Merging video and audio...",
  finalize: "Adding artwork and metadata...",
};

function stageIndex(stages: StageDef[], stage: PipelineStage): number {
  return stages.findIndex((entry) => entry.stage === stage);
}

function phaseForStage(stage: PipelineStage): DownloadPhase {
  if (stage === "extract") return "extract";
  if (stage === "merge") return "merge";
  if (stage === "finalize") return "finalize";
  return "download";
}

export class PipelineProgressTracker {
  private readonly kind: DownloadKind;
  private readonly baseStages: StageDef[];
  private readonly stages: StageDef[];
  private mediaDurationSeconds: number | null = null;
  private stageStartedAt = Date.now();
  private stageIndex = 0;
  private stageFraction = 0;
  private userPercent = 0;
  private done = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private downloadEtaSeconds: number | null = null;
  private downloadBytePercent: number | null = null;
  private downloadTotalSizeLabel: string | null = null;
  private lastMessage = STAGE_MESSAGES.prepare;
  private lastEmitAt = 0;
  private lastEmitPercent = -1;
  private lastEmitStage = -1;
  private finalizeStep = 0;
  private onProgress: ((payload: PipelineProgressPayload) => void) | null =
    null;

  constructor(kind: DownloadKind) {
    this.kind = kind;
    this.baseStages = BASE_PIPELINES[kind];
    this.stages = cloneStages(this.baseStages);
  }

  setMediaDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    if (this.mediaDurationSeconds === seconds) {
      return;
    }

    this.mediaDurationSeconds = seconds;
    this.applyDurationScaling();
    this.emit(true);
  }

  noteFfmpegProgress(timecode: string, stage: "extract" | "merge") {
    this.enterStage(stage);

    const elapsed = parseTimecodeToSeconds(timecode);
    const total = this.mediaDurationSeconds;
    const label =
      stage === "extract" ? "Converting to MP3" : "Merging video and audio";

    if (elapsed != null && total != null && total > 0) {
      const fraction = clamp(elapsed / total, 0, 0.99);
      this.setStageFraction(fraction);
      this.lastMessage = `${label}... ${formatMediaDuration(elapsed)} / ${formatMediaDuration(total)}`;
    } else {
      this.lastMessage = `${label}... ${timecode}`;
      this.setStageFraction(Math.max(this.stageFraction, 0.05));
    }

    this.emit(true);
  }

  private applyDurationScaling() {
    if (this.mediaDurationSeconds == null) {
      return;
    }

    const factor = clamp(
      this.mediaDurationSeconds / REFERENCE_DURATION_SECONDS,
      0.15,
      6,
    );

    for (const stage of this.stages) {
      const base = this.baseStages.find((entry) => entry.stage === stage.stage);
      if (!base) continue;

      if (stage.stage === "prepare") {
        stage.seconds = base.seconds;
        continue;
      }

      if (stage.stage === "finalize") {
        stage.seconds = Math.max(
          base.seconds,
          Math.round(base.seconds * (0.75 + factor * 0.25)),
        );
        continue;
      }

      if (this.kind === "thumb" && stage.stage === "download") {
        stage.seconds = base.seconds;
        continue;
      }

      stage.seconds = Math.max(3, Math.round(base.seconds * factor));
    }
  }

  start(onProgress: (payload: PipelineProgressPayload) => void) {
    this.onProgress = onProgress;
    this.emit(true);
    this.heartbeat = setInterval(() => {
      if (this.done) return;
      this.creepCurrentStage();
      this.emit();
    }, 200);
  }

  stop() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.onProgress = null;
  }

  complete(onProgress: (payload: PipelineProgressPayload) => void) {
    this.done = true;
    this.stop();
    this.userPercent = 100;
    onProgress({
      phase: "done",
      stage: "finalize",
      userPercent: 100,
      etaSeconds: 0,
      message: "Done",
    });
  }

  notePrepare() {
    this.enterStage("prepare");
    this.emit(true);
  }

  noteDownloadProgress(percent: number, etaSeconds?: number, detail?: string) {
    this.enterStage("download");
    const current = this.stages[this.stageIndex]?.stage;
    if (current !== "download") {
      return;
    }

    if (typeof etaSeconds === "number" && etaSeconds >= 0) {
      this.downloadEtaSeconds = etaSeconds;
    }
    if (detail) {
      const sizeLabel = extractSizeLabel(detail);
      if (sizeLabel) {
        this.downloadTotalSizeLabel = sizeLabel;
      }
    }

    if (this.downloadTotalSizeLabel != null) {
      this.downloadBytePercent = percent;
      const byteProgress = formatDownloadByteProgress(
        percent,
        this.downloadTotalSizeLabel,
      );
      if (byteProgress) {
        this.lastMessage = byteProgress;
      } else if (detail) {
        this.lastMessage = detail;
      }
    } else if (detail) {
      this.lastMessage = detail;
    }
    this.setStageFraction(Math.min(1, Math.max(0, percent / 100)));

    if (percent >= 100) {
      this.finishDownloadStage();
    }

    this.emit(true);
  }

  noteDownloadComplete(detail?: string) {
    if (this.stages[this.stageIndex]?.stage !== "download") {
      return;
    }

    if (detail) {
      this.lastMessage = detail;
    }
    this.finishDownloadStage();
    this.emit(true);
  }

  noteArtworkFetch(detail?: string) {
    const current = this.stages[this.stageIndex]?.stage;
    if (current !== "prepare" && current !== "download") {
      return;
    }

    this.enterStage("download");
    this.lastMessage = detail ?? "Fetching artwork...";
    this.setStageFraction(Math.max(this.stageFraction, 0.04));
    this.emit(true);
  }

  noteExtract(detail?: string) {
    this.enterStage("extract");
    this.lastMessage = detail ?? STAGE_MESSAGES.extract;
    this.setStageFraction(Math.max(this.stageFraction, 0.05));
    this.emit(true);
  }

  noteMerge(detail?: string) {
    this.enterStage("merge");
    this.lastMessage = detail ?? STAGE_MESSAGES.merge;
    this.setStageFraction(Math.max(this.stageFraction, 0.05));
    this.emit(true);
  }

  noteFinalize(detail?: string) {
    this.enterStage("finalize");
    this.finalizeStep = Math.min(3, this.finalizeStep + 1);
    this.lastMessage = detail ?? STAGE_MESSAGES.finalize;
    this.setStageFraction(
      Math.max(this.stageFraction, this.finalizeStep / 3),
    );
    this.emit(true);
  }

  private finishDownloadStage() {
    this.setStageFraction(1);
    this.downloadEtaSeconds = null;
    this.downloadBytePercent = null;
    this.downloadTotalSizeLabel = null;
    this.advanceAfterDownload();
  }

  private advanceAfterDownload() {
    const nextByKind: Partial<Record<DownloadKind, PipelineStage>> = {
      mp3: "extract",
      video: "merge",
      thumb: "finalize",
    };
    const next = nextByKind[this.kind];
    if (next) {
      this.enterStage(next);
    }
  }

  private enterStage(stage: PipelineStage) {
    const nextIndex = stageIndex(this.stages, stage);
    if (nextIndex < 0) return;

    if (nextIndex >= this.stageIndex) {
      if (nextIndex > this.stageIndex) {
        this.stageIndex = nextIndex;
        this.stageStartedAt = Date.now();
        this.stageFraction = 0;
        this.lastMessage = STAGE_MESSAGES[stage];
        this.downloadEtaSeconds = null;
      }
    }
  }

  private setStageFraction(fraction: number) {
    this.stageFraction = Math.max(this.stageFraction, Math.min(0.99, fraction));
    this.recompute();
  }

  private creepCurrentStage() {
    const stage = this.stages[this.stageIndex];
    if (!stage) return;

    if (stage.stage === "download" && this.downloadEtaSeconds != null) {
      return;
    }

    const elapsed = (Date.now() - this.stageStartedAt) / 1000;
    const creepRate = stage.seconds;
    const timeFraction = Math.min(0.96, elapsed / Math.max(1, creepRate));
    this.stageFraction = Math.max(this.stageFraction, timeFraction);
    this.recompute();
  }

  private recompute() {
    let base = 0;
    for (let i = 0; i < this.stageIndex; i++) {
      base += this.stages[i]!.weight;
    }

    const current = this.stages[this.stageIndex];
    if (!current) return;

    const next = Math.min(
      99,
      (base + current.weight * this.stageFraction) * 100,
    );
    this.userPercent = Math.max(this.userPercent, next);
  }

  private estimateRemainingSeconds(): number | undefined {
    const stage = this.stages[this.stageIndex];
    if (!stage) return undefined;

    if (stage.stage === "prepare") {
      return undefined;
    }

    if (stage.stage === "download") {
      if (this.downloadEtaSeconds != null) {
        return Math.max(0, Math.round(this.downloadEtaSeconds));
      }
      return undefined;
    }

    const elapsed = (Date.now() - this.stageStartedAt) / 1000;
    let currentRemaining = stage.seconds;

    if (this.stageFraction > 0.1) {
      const projectedTotal = elapsed / this.stageFraction;
      currentRemaining = Math.max(1, projectedTotal - elapsed);
    } else {
      currentRemaining = Math.max(1, stage.seconds * (1 - this.stageFraction));
    }

    let future = 0;
    for (let i = this.stageIndex + 1; i < this.stages.length; i++) {
      future += this.stages[i]!.seconds;
    }

    return Math.max(1, Math.round(currentRemaining + future));
  }

  private displayMessage(stage: StageDef): string {
    const elapsed = Math.round((Date.now() - this.stageStartedAt) / 1000);

    if (stage.stage === "extract" || stage.stage === "merge") {
      if (this.lastMessage.includes("/")) {
        return this.lastMessage;
      }
      if (/\d+:\d+/.test(this.lastMessage)) {
        return this.lastMessage;
      }
      const label =
        stage.stage === "extract" ? "Converting to MP3" : "Merging video and audio";
      if (this.mediaDurationSeconds != null) {
        return `${label}... (${elapsed}s of ~${formatMediaDuration(this.mediaDurationSeconds)})`;
      }
      return `${label}... (${elapsed}s)`;
    }

    if (stage.stage === "finalize") {
      return `${this.lastMessage} (${elapsed}s)`;
    }

    if (stage.stage === "download") {
      if (
        this.downloadBytePercent != null &&
        this.downloadTotalSizeLabel != null
      ) {
        const byteProgress = formatDownloadByteProgress(
          this.downloadBytePercent,
          this.downloadTotalSizeLabel,
        );
        if (byteProgress) {
          return byteProgress;
        }
      }
    }

    return this.lastMessage;
  }

  private emit(force = false) {
    if (!this.onProgress) return;

    const stage = this.stages[this.stageIndex];
    if (!stage) return;

    const now = Date.now();
    const percentDelta = this.userPercent - this.lastEmitPercent;
    const stageChanged = this.stageIndex !== this.lastEmitStage;
    const slowStage =
      stage.stage === "extract" ||
      stage.stage === "merge" ||
      stage.stage === "finalize";

    if (
      !force &&
      !stageChanged &&
      now - this.lastEmitAt < 300 &&
      percentDelta < 0.5 &&
      !(slowStage && now - this.lastEmitAt >= 5000)
    ) {
      return;
    }

    this.lastEmitAt = now;
    this.lastEmitPercent = this.userPercent;
    this.lastEmitStage = this.stageIndex;

    this.onProgress({
      phase: phaseForStage(stage.stage),
      stage: stage.stage,
      userPercent: this.userPercent,
      etaSeconds: this.estimateRemainingSeconds(),
      message: this.displayMessage(stage),
      downloadPercent:
        stage.stage === "download" && this.downloadBytePercent != null
          ? this.downloadBytePercent
          : undefined,
      downloadSizeLabel:
        stage.stage === "download" && this.downloadTotalSizeLabel != null
          ? this.downloadTotalSizeLabel
          : undefined,
    });
  }
}

export function detectPipelineSignal(
  kind: DownloadKind,
  line: string,
):
  | {
      action:
        | "prepare"
        | "artwork"
        | "extract"
        | "merge"
        | "finalize"
        | "download-done";
      detail?: string;
    }
  | null {
  if (line.includes("[ExtractAudio]")) {
    return { action: "extract", detail: "Converting to MP3..." };
  }

  if (/\[download\]\s+100%/i.test(line) || /\[download\]\s+100\s+of/i.test(line)) {
    return { action: "download-done", detail: "Download complete" };
  }

  if (line.includes("[Merger]")) {
    return { action: "merge", detail: "Merging video and audio..." };
  }

  if (line.includes("[VideoConvertor]")) {
    return { action: "merge", detail: "Converting to H.264..." };
  }

  if (line.includes("[EmbedThumbnail]")) {
    return {
      action: "finalize",
      detail:
        kind === "mp3"
          ? "Embedding artwork in MP3..."
          : "Embedding artwork...",
    };
  }

  if (line.includes("[ThumbnailsConvertor]")) {
    return { action: "finalize", detail: "Converting artwork..." };
  }

  if (line.includes("[Metadata]") || line.includes("Adding metadata")) {
    return { action: "finalize", detail: "Writing metadata..." };
  }

  if (
    kind === "mp3" &&
    (line.includes("Downloading video thumbnail") ||
      line.includes("Writing video thumbnail"))
  ) {
    return { action: "artwork", detail: "Fetching artwork..." };
  }

  if (
    line.includes("[PostProcessor") &&
    (kind === "mp3" || kind === "video")
  ) {
    return { action: "finalize", detail: STAGE_MESSAGES.finalize };
  }

  if (
    line.includes("[info]") ||
    line.includes("[youtube]") ||
    line.includes("Downloading webpage")
  ) {
    return { action: "prepare" };
  }

  return null;
}

export function formatEtaLabel(etaSeconds: number): string {
  const total = Math.max(0, Math.round(etaSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `~${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} left`;
  }

  return `~${minutes}:${String(seconds).padStart(2, "0")} left`;
}
