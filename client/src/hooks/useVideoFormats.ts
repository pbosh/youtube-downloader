import { useCallback, useEffect, useRef, useState } from "react";
import { isValidYouTubeUrl, normalizeYouTubeUrl } from "@shared/youtube-url.js";
import type { VideoFormatInfo, VideoFormatOption } from "../types/api";

const STORAGE_KEY = "youtube-downloader-video-format";
const DEBOUNCE_MS = 350;
const EMPTY_OPTION = "\u200b";

interface FormatPreference {
  id?: string;
  height?: number;
  videoCodec?: string;
}

function loadPreference(): FormatPreference | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FormatPreference) : null;
  } catch {
    return null;
  }
}

function savePreference(option: VideoFormatOption) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      id: option.id,
      height: option.height,
      videoCodec: option.videoCodec,
    }),
  );
}

function resolveSelectedOption(info: VideoFormatInfo): VideoFormatOption | null {
  const pref = loadPreference();
  if (pref?.id) {
    const byId = info.options.find((option) => option.id === pref.id);
    if (byId) return byId;
  }

  if (pref?.height && pref?.videoCodec) {
    const byPair = info.options.find(
      (option) =>
        option.height === pref.height && option.videoCodec === pref.videoCodec,
    );
    if (byPair) return byPair;
  }

    return (
      info.options.find(
        (option) => option.height === 1080 && option.quickTimeReady,
      ) ??
      info.options.find((option) => option.id === info.defaultOptionId) ??
      info.options[0] ??
      null
    );
}

export function useVideoFormats(onLog: (message: string) => void) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<VideoFormatOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<VideoFormatOption | null>(
    null,
  );

  const fetchControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const requestSerialRef = useRef(0);
  const currentInfoRef = useRef<VideoFormatInfo | null>(null);

  const clearOptions = useCallback(() => {
    currentInfoRef.current = null;
    setOptions([]);
    setSelectedOption(null);
  }, []);

  const refresh = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      const normalized = normalizeYouTubeUrl(url);

      if (!normalized || !isValidYouTubeUrl(normalized)) {
        fetchControllerRef.current?.abort();
        fetchControllerRef.current = null;
        setLoading(false);
        clearOptions();
        return;
      }

      setLoading(true);
      onLog(`Fetching available formats for ${normalized} ...`);

      fetchControllerRef.current?.abort();
      const controller = new AbortController();
      fetchControllerRef.current = controller;
      const serial = ++requestSerialRef.current;

      try {
        const response = await fetch(
          `/api/formats?url=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as VideoFormatInfo & {
          error?: string;
        };

        if (serial !== requestSerialRef.current) return;

        if (!response.ok) {
          throw new Error(payload.error || "Could not fetch formats.");
        }

        currentInfoRef.current = payload;
        setOptions(payload.options);
        const selected = resolveSelectedOption(payload);
        setSelectedOption(selected);

        onLog(
          `Loaded ${payload.options.length} video format option(s) for "${payload.title}".`,
        );
        for (const option of payload.options) {
          const suffix = option.quickTimeReady ? " · QuickTime ready" : "";
          onLog(`  · ${option.label}${suffix}`);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        clearOptions();
        onLog(
          `Could not load formats: ${error instanceof Error ? error.message : error}`,
        );
      } finally {
        if (serial === requestSerialRef.current) {
          fetchControllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [clearOptions, onLog],
  );

  const scheduleRefresh = useCallback(
    (rawUrl: string) => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const url = rawUrl.trim();
      const normalized = normalizeYouTubeUrl(url);
      const isValid = Boolean(normalized) && isValidYouTubeUrl(normalized);

      if (!isValid) {
        fetchControllerRef.current?.abort();
        fetchControllerRef.current = null;
        setLoading(false);
        clearOptions();
        return;
      }

      setLoading(true);
      onLog("Checking YouTube link...");

      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void refresh(rawUrl);
      }, DEBOUNCE_MS);
    },
    [clearOptions, onLog, refresh],
  );

  const selectOption = useCallback((optionId: string) => {
    const info = currentInfoRef.current;
    if (!info) return;

    const option = info.options.find((entry) => entry.id === optionId) ?? null;
    setSelectedOption(option);
    if (option) {
      savePreference(option);
    }
  }, []);

  const getDownloadQuery = useCallback(() => {
    if (!selectedOption) return "";

    const params = new URLSearchParams();
    params.set("videoFormatSelector", selectedOption.formatSelector);
    params.set(
      "videoNeedsConversion",
      selectedOption.needsConversion ? "1" : "0",
    );
    params.set("videoFormatLabel", selectedOption.label);
    return `&${params.toString()}`;
  }, [selectedOption]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      fetchControllerRef.current?.abort();
    };
  }, []);

  return {
    loading,
    options,
    selectedOption,
    selectedOptionId: selectedOption?.id ?? "",
    emptyOptionLabel: EMPTY_OPTION,
    scheduleRefresh,
    selectOption,
    getDownloadQuery,
    isLoading: () =>
      loading ||
      debounceTimerRef.current != null ||
      fetchControllerRef.current != null,
  };
}
