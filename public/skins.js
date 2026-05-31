/**
 * Skin picker system — catalog, favorites, filter, cycle, and apply.
 */
const SkinSystem = (() => {
  const STORAGE = {
    activeSkin: "youtube-downloader-skin",
    favorites: "youtube-downloader-skin-favorites",
    favFilter: "youtube-downloader-skin-fav-filter",
  };

  const CYCLE_MS = 30000;

  /** @type {Array<{ id: string, title: string, icon: string, iconImage?: string, banner?: string }>} */
  let catalog = [];

  const state = {
    cycling: false,
    favFilter: false,
    favorites: new Set(),
  };

  let cycleTimer = null;
  let activeSkinStylesheet = document.getElementById("skin-stylesheet");

  let cycleButton = null;
  let favFilterButton = null;
  let scrollContainer = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function readFavorites() {
    try {
      const raw = localStorage.getItem(STORAGE.favorites);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((id) => typeof id === "string" && id));
    } catch {
      return new Set();
    }
  }

  function writeFavorites() {
    localStorage.setItem(
      STORAGE.favorites,
      JSON.stringify([...state.favorites]),
    );
  }

  function readFavFilter() {
    return localStorage.getItem(STORAGE.favFilter) === "true";
  }

  function writeFavFilter() {
    localStorage.setItem(STORAGE.favFilter, String(state.favFilter));
  }

  function getSavedSkinId() {
    return localStorage.getItem(STORAGE.activeSkin);
  }

  function setSavedSkinId(id) {
    localStorage.setItem(STORAGE.activeSkin, id);
  }

  function findSkin(id) {
    return catalog.find((skin) => skin.id === id);
  }

  function getCurrentSkinId() {
    return (
      document.documentElement.dataset.skin ||
      getSavedSkinId() ||
      catalog[0]?.id ||
      ""
    );
  }

  function pruneFavorites() {
    const validIds = new Set(catalog.map((skin) => skin.id));
    for (const id of state.favorites) {
      if (!validIds.has(id)) state.favorites.delete(id);
    }
    writeFavorites();
  }

  function getFavoriteSkins() {
    return catalog.filter((skin) => state.favorites.has(skin.id));
  }

  /** Skins shown in the horizontal picker. */
  function getPickerSkins() {
    if (!state.favFilter) return catalog;
    return getFavoriteSkins();
  }

  /** Pool used when cycling (respects fav filter, not picker visibility alone). */
  function getCyclePool(excludeId = null) {
    const source = state.favFilter ? getFavoriteSkins() : catalog;
    if (source.length === 0) return [];
    if (!excludeId || source.length === 1) return source;
    const candidates = source.filter((skin) => skin.id !== excludeId);
    return candidates.length > 0 ? candidates : source;
  }

  function isFavorite(id) {
    return state.favorites.has(id);
  }

  function toggleFavorite(id) {
    if (!findSkin(id)) return;

    if (state.favorites.has(id)) {
      state.favorites.delete(id);
    } else {
      state.favorites.add(id);
    }

    writeFavorites();

    if (state.favFilter && state.favorites.size === 0) {
      state.favFilter = false;
      writeFavFilter();
    }

    validateCycleState();
    render();
  }

  function toggleFavFilter() {
    if (getFavoriteSkins().length === 0) return;

    state.favFilter = !state.favFilter;
    writeFavFilter();
    validateCycleState();
    render();
  }

  function pickRandomSkin(excludeId) {
    const pool = getCyclePool(excludeId);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function updateControlButtons() {
    if (cycleButton) {
      const canCycle = getCyclePool().length > 1;
      cycleButton.classList.toggle("active", state.cycling);
      cycleButton.setAttribute("aria-pressed", String(state.cycling));
      cycleButton.disabled = !canCycle;
      cycleButton.title = state.favFilter
        ? "Cycle favorite skins every 30 seconds"
        : "Cycle skins every 30 seconds";
    }

    if (favFilterButton) {
      const hasFavorites = state.favorites.size > 0;
      favFilterButton.classList.toggle("active", state.favFilter);
      favFilterButton.setAttribute("aria-pressed", String(state.favFilter));
      favFilterButton.disabled = !hasFavorites;
      favFilterButton.title = state.favFilter
        ? "Showing favorites only (click to show all)"
        : "Show favorites only";
    }
  }

  function stopCycle() {
    state.cycling = false;
    if (cycleTimer) {
      clearInterval(cycleTimer);
      cycleTimer = null;
    }
    updateControlButtons();
  }

  function cycleToRandomSkin() {
    const skin = pickRandomSkin(getCurrentSkinId());
    if (skin) applySkin(skin, { fromCycle: true });
  }

  function startCycle() {
    if (getCyclePool().length <= 1) return;

    state.cycling = true;
    updateControlButtons();
    cycleToRandomSkin();
    cycleTimer = setInterval(cycleToRandomSkin, CYCLE_MS);
  }

  function toggleCycle() {
    if (state.cycling) {
      stopCycle();
    } else {
      startCycle();
    }
  }

  function validateCycleState() {
    if (state.cycling && getCyclePool().length <= 1) {
      stopCycle();
    } else {
      updateControlButtons();
    }
  }

  function applyBanner(skin) {
    const bannerEl = document.querySelector(".scene-banner");
    if (!bannerEl) return;

    if (skin.banner) {
      bannerEl.style.backgroundImage = `url(/skins/${encodeURIComponent(skin.id)}/${encodeURIComponent(skin.banner)})`;
    } else {
      bannerEl.style.backgroundImage = "";
    }
  }

  function applySkin(skin, options = {}) {
    const { fromCycle = false } = options;
    if (!skin) return;

    if (!activeSkinStylesheet) {
      activeSkinStylesheet = document.createElement("link");
      activeSkinStylesheet.id = "skin-stylesheet";
      activeSkinStylesheet.rel = "stylesheet";
      document.head.appendChild(activeSkinStylesheet);
    }

    activeSkinStylesheet.href = `/skins/${encodeURIComponent(skin.id)}/skin.css`;
    document.documentElement.dataset.skin = skin.id;
    setSavedSkinId(skin.id);
    applyBanner(skin);

    if (!fromCycle) {
      stopCycle();
    }

    render();
  }

  function skinPickerIcon(skin) {
    const skinBase = `/skins/${encodeURIComponent(skin.id)}`;

    if (skin.banner) {
      const bannerUrl = `${skinBase}/${encodeURIComponent(skin.banner)}`;
      return `<span class="skin-option-thumb skin-option-banner" style="background-image:url(${bannerUrl})" aria-hidden="true"></span>`;
    }

    if (skin.iconImage) {
      return `<img src="${skinBase}/${encodeURIComponent(skin.iconImage)}" alt="" class="skin-option-thumb" />`;
    }

    return `<span class="skin-option-emoji">${skin.icon}</span>`;
  }

  function renderSkinPicker() {
    if (!scrollContainer) return;

    const activeId = getCurrentSkinId();
    const pickerSkins = getPickerSkins();

    if (pickerSkins.length === 0) {
      scrollContainer.innerHTML =
        '<p class="skin-scroll-empty">Star a skin to add favorites.</p>';
      return;
    }

    scrollContainer.innerHTML = pickerSkins
      .map((skin) => {
        const isActive = skin.id === activeId;
        const isFav = isFavorite(skin.id);
        const title = escapeHtml(skin.title);
        const favLabel = isFav ? "Remove from favorites" : "Add to favorites";

        return `
          <div
            class="skin-option${isActive ? " active" : ""}${isFav ? " is-favorite" : ""}"
            data-skin-id="${skin.id}"
          >
            <button
              type="button"
              class="skin-option-select"
              title="${title}"
              aria-label="Apply ${title} skin"
              aria-pressed="${isActive}"
            >
              ${skinPickerIcon(skin)}
            </button>
            <button
              type="button"
              class="skin-fav-toggle${isFav ? " favorited" : ""}"
              title="${favLabel}"
              aria-label="${favLabel}"
              aria-pressed="${isFav}"
            >
              <span aria-hidden="true">${isFav ? "★" : "☆"}</span>
            </button>
          </div>
        `;
      })
      .join("");
  }

  function render() {
    renderSkinPicker();
    updateControlButtons();
  }

  function onPickerClick(event) {
    const favButton = event.target.closest(".skin-fav-toggle");
    if (favButton) {
      event.preventDefault();
      event.stopPropagation();
      const option = favButton.closest("[data-skin-id]");
      if (option?.dataset.skinId) toggleFavorite(option.dataset.skinId);
      return;
    }

    const selectButton = event.target.closest(".skin-option-select");
    if (!selectButton) return;

    const option = selectButton.closest("[data-skin-id]");
    if (!option?.dataset.skinId) return;

    const skin = findSkin(option.dataset.skinId);
    if (skin) applySkin(skin);
  }

  async function init() {
    cycleButton = document.getElementById("skin-cycle");
    favFilterButton = document.getElementById("skin-fav-filter");
    scrollContainer = document.getElementById("skin-scroll");

    state.favorites = readFavorites();
    state.favFilter = readFavFilter();

    try {
      const response = await fetch("/api/skins");
      catalog = await response.json();
    } catch {
      catalog = [];
    }

    pruneFavorites();

    if (state.favFilter && state.favorites.size === 0) {
      state.favFilter = false;
      writeFavFilter();
    }

    scrollContainer?.addEventListener("click", onPickerClick);
    cycleButton?.addEventListener("click", toggleCycle);
    favFilterButton?.addEventListener("click", toggleFavFilter);

    if (catalog.length === 0) {
      cycleButton?.setAttribute("disabled", "true");
      favFilterButton?.setAttribute("disabled", "true");
      return;
    }

    const savedId = getSavedSkinId();
    const initialSkin =
      findSkin(savedId) ||
      (state.favFilter ? getFavoriteSkins()[0] : null) ||
      catalog[0];

    applySkin(initialSkin);
  }

  return { init };
})();

SkinSystem.init();
