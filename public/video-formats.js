/**
 * YouTube format lookup, selector UI, and persistent video format preference.
 */
const VideoFormatManager = (() => {
  const STORAGE_KEY = "youtube-downloader-video-format";
  const DEBOUNCE_MS = 350;
  const EMPTY_OPTION = "\u200b";

  let selectEl = null;
  let currentInfo = null;
  let selectedOption = null;
  let fetchController = null;
  let debounceTimer = null;
  let requestSerial = 0;
  let loadingActive = false;
  let logFn = () => {};
  let onLoadingChange = () => {};

  function loadPreference() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function savePreference(option) {
    if (!option) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: option.id,
        height: option.height,
        videoCodec: option.videoCodec,
      }),
    );
  }

  function resolveSelectedOption(info) {
    const pref = loadPreference();
    if (pref?.id) {
      const byId = info.options.find((option) => option.id === pref.id);
      if (byId) return byId;
    }

    if (pref?.height && pref?.videoCodec) {
      const byPair = info.options.find(
        (option) =>
          option.height === pref.height &&
          option.videoCodec === pref.videoCodec,
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

  function setLoading(active) {
    if (loadingActive === active) return;
    loadingActive = active;
    onLoadingChange(active);
  }

  function setEmptySelect() {
    if (!selectEl) return;

    selectEl.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = EMPTY_OPTION;
    selectEl.appendChild(placeholder);
    selectEl.disabled = true;
  }

  function beginLoadingUi() {
    setLoading(true);
    setEmptySelect();
  }

  function renderOptions(info) {
    if (!selectEl) return;

    selectEl.innerHTML = "";
    for (const option of info.options) {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = option.quickTimeReady
        ? `${option.label} · QuickTime ready`
        : option.label;
      selectEl.appendChild(node);
    }

    selectedOption = resolveSelectedOption(info);
    if (selectedOption) {
      selectEl.value = selectedOption.id;
      selectEl.disabled = false;
    } else {
      selectEl.disabled = true;
    }
  }

  function clearOptions() {
    currentInfo = null;
    selectedOption = null;
    setEmptySelect();
  }

  function syncSelectedFromSelect() {
    if (!currentInfo || !selectEl) {
      selectedOption = null;
      return;
    }

    selectedOption =
      currentInfo.options.find((option) => option.id === selectEl.value) ??
      null;
  }

  async function refresh(rawUrl) {
    const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
    const normalized = window.YouTubeUrl?.normalizeYouTubeUrl?.(url) ?? url;

    if (!normalized || !window.YouTubeUrl?.isValidYouTubeUrl?.(normalized)) {
      if (fetchController) {
        fetchController.abort();
        fetchController = null;
      }
      setLoading(false);
      clearOptions();
      return;
    }

    beginLoadingUi();
    logFn(`Fetching available formats for ${normalized} ...`);

    if (fetchController) {
      fetchController.abort();
    }

    fetchController = new AbortController();
    const serial = ++requestSerial;

    try {
      const response = await fetch(
        `/api/formats?url=${encodeURIComponent(normalized)}`,
        { signal: fetchController.signal },
      );
      const payload = await response.json();

      if (serial !== requestSerial) return;

      if (!response.ok) {
        throw new Error(payload.error || "Could not fetch formats.");
      }

      currentInfo = payload;
      renderOptions(payload);
      selectedOption = resolveSelectedOption(payload);

      logFn(
        `Loaded ${payload.options.length} video format option(s) for "${payload.title}".`,
      );
      for (const option of payload.options) {
        const suffix = option.quickTimeReady ? " · QuickTime ready" : "";
        logFn(`  · ${option.label}${suffix}`);
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      clearOptions();
      logFn(
        `Could not load formats: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      if (serial === requestSerial) {
        fetchController = null;
        setLoading(false);
      }
    }
  }

  function scheduleRefresh(rawUrl) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
    const normalized = window.YouTubeUrl?.normalizeYouTubeUrl?.(url) ?? url;
    const isValid =
      Boolean(normalized) &&
      Boolean(window.YouTubeUrl?.isValidYouTubeUrl?.(normalized));

    if (!isValid) {
      if (fetchController) {
        fetchController.abort();
        fetchController = null;
      }
      setLoading(false);
      clearOptions();
      return;
    }

    beginLoadingUi();
    logFn("Checking YouTube link...");

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refresh(rawUrl);
    }, DEBOUNCE_MS);
  }

  function init(options) {
    selectEl = options.selectEl;
    logFn = typeof options.log === "function" ? options.log : () => {};
    onLoadingChange =
      typeof options.onLoadingChange === "function"
        ? options.onLoadingChange
        : () => {};

    clearOptions();

    selectEl?.addEventListener("change", () => {
      syncSelectedFromSelect();
      if (selectedOption) {
        savePreference(selectedOption);
      }
    });
  }

  function getDownloadQuery() {
    if (!selectedOption) {
      return "";
    }

    const params = new URLSearchParams();
    params.set("videoFormatSelector", selectedOption.formatSelector);
    params.set("videoNeedsConversion", selectedOption.needsConversion ? "1" : "0");
    params.set("videoFormatLabel", selectedOption.label);
    return `&${params.toString()}`;
  }

  function isLoading() {
    return loadingActive;
  }

  return {
    init,
    scheduleRefresh,
    refresh,
    getDownloadQuery,
    getSelectedOption: () => selectedOption,
    isLoading,
  };
})();
