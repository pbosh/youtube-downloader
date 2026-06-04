import { spawn } from "node:child_process";
import { resolveYtDlp } from "./binaries.js";
import { isValidYouTubeUrl, normalizeYouTubeUrl } from "./youtube-url.js";

export interface VideoFormatOption {
  id: string;
  label: string;
  height: number;
  width: number;
  videoCodec: string;
  audioCodec: string;
  formatSelector: string;
  needsConversion: boolean;
  quickTimeReady: boolean;
  fps?: number;
  note?: string;
}

export interface VideoFormatInfo {
  url: string;
  title: string;
  duration?: number;
  options: VideoFormatOption[];
  defaultOptionId: string;
}

interface YtDlpFormat {
  format_id?: string;
  format_note?: string;
  ext?: string;
  height?: number;
  width?: number;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  protocol?: string;
}

interface YtDlpJson {
  title?: string;
  duration?: number;
  formats?: YtDlpFormat[];
}

function simplifyVideoCodec(vcodec: string): string {
  const value = vcodec.toLowerCase();
  if (value === "none" || !value) return "Unknown";
  if (value.startsWith("avc1") || value === "h264") return "H.264";
  if (value.startsWith("vp9")) return "VP9";
  if (value.startsWith("av01") || value === "av1") return "AV1";
  if (value.startsWith("hev1") || value.startsWith("hvc1") || value === "hevc") {
    return "H.265";
  }
  return vcodec.split(".")[0]?.toUpperCase() ?? vcodec;
}

function simplifyAudioCodec(acodec: string): string {
  const value = acodec.toLowerCase();
  if (value === "none" || !value) return "None";
  if (value.startsWith("mp4a") || value === "aac") return "AAC";
  if (value.startsWith("opus")) return "Opus";
  if (value.startsWith("vorbis")) return "Vorbis";
  return acodec.split(".")[0]?.toUpperCase() ?? acodec;
}

function isH264(vcodec: string): boolean {
  const value = vcodec.toLowerCase();
  return value.startsWith("avc1") || value === "h264";
}

function isAac(acodec: string): boolean {
  const value = acodec.toLowerCase();
  return value.startsWith("mp4a") || value === "aac";
}

function formatScore(format: YtDlpFormat): number {
  const size = format.filesize ?? format.filesize_approx ?? 0;
  const fps = format.fps ?? 0;
  return size + fps * 10_000;
}

function resolutionLabel(height: number, width?: number): string {
  if (height > 0) {
    return width && width > 0 ? `${height}p (${width}×${height})` : `${height}p`;
  }
  return "Unknown resolution";
}

function buildOption(params: {
  id: string;
  height: number;
  width: number;
  videoCodec: string;
  audioCodec: string;
  formatSelector: string;
  needsConversion: boolean;
  fps?: number;
  note?: string;
}): VideoFormatOption {
  const audioLabel =
    params.audioCodec === "None" ? "no audio" : params.audioCodec;
  const label = `${resolutionLabel(params.height, params.width)} · ${params.videoCodec} + ${audioLabel}`;

  return {
    id: params.id,
    label,
    height: params.height,
    width: params.width,
    videoCodec: params.videoCodec,
    audioCodec: params.audioCodec,
    formatSelector: params.formatSelector,
    needsConversion: params.needsConversion,
    quickTimeReady: !params.needsConversion,
    fps: params.fps,
    note: params.note,
  };
}

export function buildVideoFormatOptions(formats: YtDlpFormat[]): VideoFormatOption[] {
  const usable = formats.filter(
    (format) =>
      format.format_id &&
      format.protocol !== "m3u8_native" &&
      format.protocol !== "m3u8",
  );

  const options: VideoFormatOption[] = [];
  const seen = new Set<string>();

  for (const format of usable) {
    const vcodec = format.vcodec ?? "none";
    const acodec = format.acodec ?? "none";
    const height = format.height ?? 0;
    const width = format.width ?? 0;

    if (vcodec !== "none" && acodec !== "none" && height > 0) {
      const videoCodec = simplifyVideoCodec(vcodec);
      const audioCodec = simplifyAudioCodec(acodec);
      const id = `progressive-${format.format_id}`;
      if (seen.has(id)) continue;
      seen.add(id);

      options.push(
        buildOption({
          id,
          height,
          width,
          videoCodec,
          audioCodec,
          formatSelector: format.format_id!,
          needsConversion: !isH264(vcodec) || !isAac(acodec),
          fps: format.fps,
          note: format.format_note,
        }),
      );
      continue;
    }

    if (vcodec === "none" || height <= 0) {
      continue;
    }

    const videoCodec = simplifyVideoCodec(vcodec);
    const key = `${height}-${videoCodec}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bestForKey = usable
      .filter(
        (candidate) =>
          (candidate.height ?? 0) === height &&
          simplifyVideoCodec(candidate.vcodec ?? "none") === videoCodec &&
          (candidate.vcodec ?? "none") !== "none" &&
          (candidate.acodec ?? "none") === "none",
      )
      .sort((a, b) => formatScore(b) - formatScore(a))[0];

    if (!bestForKey?.format_id) continue;

    const formatSelector = `${bestForKey.format_id}+bestaudio[acodec^=mp4a]/bestaudio/best`;
    options.push(
      buildOption({
        id: `adaptive-${height}-${videoCodec.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        height,
        width: bestForKey.width ?? width,
        videoCodec,
        audioCodec: "AAC",
        formatSelector,
        needsConversion: !isH264(bestForKey.vcodec ?? "none"),
        fps: bestForKey.fps,
        note: bestForKey.format_note,
      }),
    );
  }

  options.sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height;
    if (a.quickTimeReady !== b.quickTimeReady) {
      return a.quickTimeReady ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
  });

  return options;
}

export function pickDefaultVideoFormatOption(
  options: VideoFormatOption[],
): string {
  const preferred1080QuickTime = options.find(
    (option) => option.height === 1080 && option.quickTimeReady,
  );
  if (preferred1080QuickTime) {
    return preferred1080QuickTime.id;
  }

  const quickTime = options.filter((option) => option.quickTimeReady);
  if (quickTime.length > 0) {
    return quickTime[0]!.id;
  }
  return options[0]?.id ?? "";
}

export function findVideoFormatOption(
  options: VideoFormatOption[],
  id: string | undefined,
): VideoFormatOption | undefined {
  if (!id) return undefined;
  return options.find((option) => option.id === id);
}

async function runYtDlpJson(
  url: string,
  signal?: AbortSignal,
): Promise<YtDlpJson> {
  const ytDlp = await resolveYtDlp();

  return new Promise((resolve, reject) => {
    const proc = spawn(
      ytDlp,
      [url, "--no-playlist", "--no-warnings", "-J"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );

    let output = "";
    let settled = false;

    const finish = (error?: Error, value?: YtDlpJson) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value ?? {});
    };

    const onAbort = () => {
      proc.kill("SIGTERM");
      finish(new Error("Format lookup cancelled."));
    };

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      finish(new Error("Timed out while fetching formats."));
    }, 45_000);

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.on("error", (error) => finish(error));
    proc.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(`Could not fetch formats (yt-dlp exit ${code ?? "unknown"}).`));
        return;
      }

      try {
        finish(undefined, JSON.parse(output) as YtDlpJson);
      } catch {
        finish(new Error("Could not parse format information from YouTube."));
      }
    });
  });
}

export async function fetchVideoFormatInfo(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<VideoFormatInfo> {
  const url = normalizeYouTubeUrl(rawUrl.trim());
  if (!url || !isValidYouTubeUrl(url)) {
    throw new Error("Please enter a valid YouTube link, video ID, or youtu.be URL.");
  }

  const json = await runYtDlpJson(url, signal);
  const options = buildVideoFormatOptions(json.formats ?? []);

  if (options.length === 0) {
    throw new Error("No downloadable video formats were found for this link.");
  }

  return {
    url,
    title: json.title ?? "Untitled video",
    duration: json.duration,
    options,
    defaultOptionId: pickDefaultVideoFormatOption(options),
  };
}
