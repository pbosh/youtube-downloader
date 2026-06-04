import { useCallback, useEffect, useRef, useState } from "react";
import { isValidYouTubeUrl, normalizeYouTubeUrl } from "@shared/youtube-url.js";
import {
  DownloadProgressEngine,
  type ProgressSnapshot,
} from "../lib/progressEngine";
import {
  downloadConsoleDetail,
  isDownloadStage,
  phaseLabel,
  requestDesktopResize,
  shouldLogProgress,
  STALL_MS,
} from "../lib/downloadUtils";
import type {
  DownloadCompletePayload,
  DownloadFailedPayload,
  DownloadKind,
  DownloadProgressPayload,
} from "../types/api";

interface UseDownloadOptions {
  getDownloadQuery: () => string;
  isFormatLoading: () => boolean;
}

export function useDownload({ getDownloadQuery, isFormatLoading }: UseDownloadOptions) {
  const [url, setUrl] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [logText, setLogText] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [progressSnapshot, setProgressSnapshot] = useState<ProgressSnapshot | null>(
    null,
  );

  const activeSourceRef = useRef<EventSource | null>(null);
  const finishedRef = useRef(false);
  const stallTimerRef = useRef<number | null>(null);
  const lastProgressAtRef = useRef(0);
  const logStateRef = useRef({ lastProgressLogKey: "", lastDownloadLogAt: 0 });
  const progressEngineRef = useRef(
    new DownloadProgressEngine((snapshot) => {
      setProgressSnapshot(snapshot);
    }),
  );

  const appendLog = useCallback((message: string) => {
    setShowActivity(true);
    requestDesktopResize();
    const stamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogText((current) => `${current}[${stamp}] ${message}\n`);
  }, []);

  const clearStallWatch = useCallback(() => {
    if (stallTimerRef.current != null) {
      window.clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const markProgressActivity = useCallback(() => {
    lastProgressAtRef.current = Date.now();
  }, []);

  const setButtonsDisabled = useCallback((disabled: boolean) => {
    setDownloadBusy(disabled);
  }, []);

  const resetUi = useCallback(() => {
    setLogText("");
    logStateRef.current = { lastProgressLogKey: "", lastDownloadLogAt: 0 };
    progressEngineRef.current.reset();
    setProgressSnapshot(null);
  }, []);

  const showDescriptionPanel = useCallback(() => {
    setShowActivity(false);
    resetUi();
    requestDesktopResize();
  }, [resetUi]);

  const closeActiveSource = useCallback(() => {
    activeSourceRef.current?.close();
    activeSourceRef.current = null;
  }, []);

  const startStallWatch = useCallback(
    (source: EventSource) => {
      clearStallWatch();
      markProgressActivity();
      stallTimerRef.current = window.setInterval(() => {
        if (finishedRef.current || source.readyState === EventSource.CLOSED) {
          clearStallWatch();
          return;
        }

        if (Date.now() - lastProgressAtRef.current > STALL_MS) {
          finishedRef.current = true;
          source.close();
          activeSourceRef.current = null;
          clearStallWatch();
          appendLog("Error: Download stalled with no updates for 5 minutes. Try again.");
          setButtonsDisabled(false);
        }
      }, 5000);
    },
    [appendLog, clearStallWatch, markProgressActivity, setButtonsDisabled],
  );

  const logSavedFiles = useCallback(
    (data: DownloadCompletePayload) => {
      appendLog("Complete.");
      if (data.title) appendLog(`Title: ${data.title}`);

      if (Array.isArray(data.files)) {
        for (const file of data.files) {
          appendLog(`Saved to Desktop: ${file.fileName}`);
        }
      } else if (data.fileName) {
        appendLog(`Saved to Desktop: ${data.fileName}`);
      }

      appendLog("Enjoy your files!");
    },
    [appendLog],
  );

  const stopDownload = useCallback(async () => {
    if (!downloadBusy) return;

    appendLog("Stopping download...");

    try {
      const res = await fetch("/api/download/stop", { method: "POST" });
      if (!res.ok) {
        throw new Error("Stop request failed");
      }
    } catch {
      appendLog("Could not reach server to stop.");
      if (activeSourceRef.current && !finishedRef.current) {
        finishedRef.current = true;
        clearStallWatch();
        closeActiveSource();
        setButtonsDisabled(false);
      }
    }
  }, [appendLog, clearStallWatch, closeActiveSource, downloadBusy, setButtonsDisabled]);

  const dismissConsole = useCallback(() => {
    if (activeSourceRef.current) {
      finishedRef.current = true;
      closeActiveSource();
      clearStallWatch();
      setButtonsDisabled(false);
    }
    showDescriptionPanel();
  }, [
    clearStallWatch,
    closeActiveSource,
    setButtonsDisabled,
    showDescriptionPanel,
  ]);

  const copyConsoleLog = useCallback(async () => {
    const text = logText.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1400);
    } catch {
      setCopyLabel("Failed");
      window.setTimeout(() => setCopyLabel("Copy"), 1400);
    }
  }, [logText]);

  const startDownload = useCallback(
    (kind: DownloadKind) => {
      const normalized = normalizeYouTubeUrl(url);
      if (!normalized || !isValidYouTubeUrl(normalized)) {
        appendLog(
          "Error: Please enter a valid YouTube link, video ID, or youtu.be URL.",
        );
        return;
      }

      if (isFormatLoading()) {
        return;
      }

      setUrl(normalized);
      closeActiveSource();
      clearStallWatch();
      resetUi();
      setShowActivity(true);
      appendLog(
        kind === "all"
          ? "Starting MP3, MP4, and thumbnail downloads..."
          : `Starting ${kind.toUpperCase()} download...`,
      );
      setButtonsDisabled(true);
      finishedRef.current = false;
      progressEngineRef.current.start(kind);

      const source = new EventSource(
        `/api/download?url=${encodeURIComponent(normalized)}&kind=${encodeURIComponent(kind)}${getDownloadQuery()}`,
      );
      activeSourceRef.current = source;
      startStallWatch(source);

      source.addEventListener("progress", (event) => {
        markProgressActivity();
        const data = JSON.parse(event.data) as DownloadProgressPayload;
        progressEngineRef.current.feed({ kind, ...data });

        if (!shouldLogProgress(kind, data, logStateRef.current)) return;

        const activeStepKind = kind === "all" ? (data.step ?? "mp3") : kind;
        const label = phaseLabel(data.phase, activeStepKind, data.stage);
        const stepDetail =
          kind === "all" && data.stepIndex
            ? ` (step ${data.stepIndex}/${data.stepTotal})`
            : "";
        const detail = downloadConsoleDetail(data);
        const eta =
          isDownloadStage(data) || typeof data.etaSeconds !== "number"
            ? ""
            : ` · ${formatEta(data.etaSeconds)}`;
        appendLog(`${label}${stepDetail}${detail}${eta}`);
      });

      source.addEventListener("complete", (event) => {
        finishedRef.current = true;
        clearStallWatch();
        const data = JSON.parse(event.data) as DownloadCompletePayload;
        progressEngineRef.current.finish(kind);
        logSavedFiles(data);
        source.close();
        activeSourceRef.current = null;
        setButtonsDisabled(false);
      });

      source.addEventListener("failed", (event) => {
        finishedRef.current = true;
        clearStallWatch();
        const data = JSON.parse(event.data) as DownloadFailedPayload;
        if (data.message === "Download stopped.") {
          appendLog("Download stopped.");
        } else {
          appendLog(`Error: ${data.message || "Download failed."}`);
        }
        source.close();
        activeSourceRef.current = null;
        setButtonsDisabled(false);
      });

      source.onerror = () => {
        if (finishedRef.current || source.readyState === EventSource.CLOSED) return;
        finishedRef.current = true;
        clearStallWatch();
        appendLog("Error: Connection lost. Please try again.");
        source.close();
        activeSourceRef.current = null;
        setButtonsDisabled(false);
      };
    },
    [
      appendLog,
      clearStallWatch,
      closeActiveSource,
      getDownloadQuery,
      isFormatLoading,
      logSavedFiles,
      markProgressActivity,
      resetUi,
      setButtonsDisabled,
      startStallWatch,
      url,
    ],
  );

  useEffect(() => {
    return () => {
      clearStallWatch();
      closeActiveSource();
      progressEngineRef.current.stop();
    };
  }, [clearStallWatch, closeActiveSource]);

  return {
    url,
    setUrl,
    showActivity,
    logText,
    downloadBusy,
    copyLabel,
    progressSnapshot,
    appendLog,
    startDownload,
    stopDownload,
    dismissConsole,
    copyConsoleLog,
  };
}

function formatEta(etaSeconds: number) {
  const total = Math.max(0, Math.round(etaSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `~${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} left`;
  }
  return `~${minutes}:${String(seconds).padStart(2, "0")} left`;
}
