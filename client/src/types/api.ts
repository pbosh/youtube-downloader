export type DownloadKind = "mp3" | "video" | "thumb" | "all";

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

export interface SkinMeta {
  id: string;
  title: string;
  icon: string;
  mode: "light" | "dark";
  iconImage?: string;
  banner?: string;
  bannerThumb?: string;
}

export interface DownloadProgressPayload {
  phase?: string;
  stage?: string;
  userPercent?: number;
  percent?: number;
  stepPercent?: number;
  message?: string;
  etaSeconds?: number;
  downloadPercent?: number;
  downloadSizeLabel?: string;
  step?: DownloadKind;
  stepIndex?: number;
  stepTotal?: number;
  overallUserPercent?: number;
}

export interface DownloadCompletePayload {
  title?: string;
  fileName?: string;
  outputPath?: string;
  kind?: DownloadKind;
  files?: Array<{ fileName: string; outputPath: string }>;
}

export interface DownloadFailedPayload {
  message?: string;
}

declare global {
  interface Window {
    electronDesktop?: {
      requestResize?: () => void;
    };
  }
}

export {};
