/**
 * Skin picker system — catalog, favorites, filter, shuffle, and apply.
 */
const SkinSystem = (() => {
  const STORAGE = {
    activeSkin: "youtube-downloader-skin",
    favorites: "youtube-downloader-skin-favorites",
    favFilter: "youtube-downloader-skin-fav-filter",
  };

  const LONG_PRESS_MS = 550;
  const LONG_PRESS_MOVE_PX = 20;

  /** @type {Array<{ id: string, title: string, icon: string, iconImage?: string, banner?: string }>} */
  let catalog = [];

  const state = {
    favFilter: false,
    favorites: new Set(),
  };

  let activeSkinStylesheet = document.getElementById("skin-stylesheet");

  let shuffleButton = null;
  let favFilterButton = null;
  let scrollContainer = null;

  let longPressTimer = null;
  let longPressSkinId = null;
  let longPressStart = null;
  let longPressButton = null;
  let longPressPointerId = null;
  let longPressMoved = false;
  let longPressHandled = false;
  let suppressNextClick = false;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function shuffleArray(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
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

  /** Skins shown in the horizontal picker (catalog order is shuffled each launch). */
  function getPickerSkins() {
    if (!state.favFilter) return catalog;
    return getFavoriteSkins();
  }

  function getShufflePool(excludeId = null) {
    const source = getPickerSkins();
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

    render();
  }

  function toggleFavFilter() {
    if (getFavoriteSkins().length === 0) return;

    state.favFilter = !state.favFilter;
    writeFavFilter();
    render();
  }

  function pickRandomSkin(excludeId) {
    const pool = getShufflePool(excludeId);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function shuffleToRandomSkin() {
    const skin = pickRandomSkin(getCurrentSkinId());
    if (skin) applySkin(skin);
  }

  function updateControlButtons() {
    if (shuffleButton) {
      const canShuffle = getShufflePool().length > 1;
      shuffleButton.disabled = !canShuffle;

      let shuffleTitle;
      if (!canShuffle) {
        shuffleTitle = "Add more skins or favorites to shuffle.";
      } else if (state.favFilter) {
        shuffleTitle = "Pick a random favorite skin.";
      } else {
        shuffleTitle = "Pick a random skin.";
      }

      shuffleButton.title = shuffleTitle;
      shuffleButton.setAttribute("aria-label", shuffleTitle);
    }

    if (favFilterButton) {
      const hasFavorites = state.favorites.size > 0;
      favFilterButton.classList.toggle("active", state.favFilter);
      favFilterButton.setAttribute("aria-pressed", String(state.favFilter));
      favFilterButton.disabled = !hasFavorites;

      let favTitle;
      if (!hasFavorites) {
        favTitle = "Favorite a skin first to filter the list.";
      } else if (state.favFilter) {
        favTitle = "Click to show all skins again.";
      } else {
        favTitle = "Click to show only your favorite skins.";
      }

      favFilterButton.title = favTitle;
      favFilterButton.setAttribute("aria-label", favTitle);
    }
  }

  function applySkin(skin) {
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
    render();
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
        '<p class="skin-scroll-empty">Favorite a skin with ♡ to add it here.</p>';
      return;
    }

    scrollContainer.innerHTML = pickerSkins
      .map((skin) => {
        const isActive = skin.id === activeId;
        const isFav = isFavorite(skin.id);
        const title = escapeHtml(skin.title);
        const favLabel = isFav ? "Remove from favorites" : "Add to favorites";

        const deleteHint = "Hold to delete";
        const selectTitle = `${skin.title} — ${deleteHint}`;

        return `
          <div
            class="skin-option${isActive ? " active" : ""}${isFav ? " is-favorite" : ""}"
            data-skin-id="${skin.id}"
          >
            <button
              type="button"
              class="skin-option-select"
              title="${escapeHtml(selectTitle)}"
              aria-label="Apply ${title} skin. ${deleteHint}."
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
              <span aria-hidden="true">${isFav ? "♥" : "♡"}</span>
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

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (longPressButton && longPressPointerId !== null) {
      try {
        if (longPressButton.hasPointerCapture(longPressPointerId)) {
          longPressButton.releasePointerCapture(longPressPointerId);
        }
      } catch {
        // Pointer may already be released.
      }
    }

    if (longPressButton) {
      longPressButton.classList.remove("skin-option-holding");
      longPressButton = null;
    }

    longPressSkinId = null;
    longPressStart = null;
    longPressPointerId = null;
    longPressMoved = false;
  }

  function triggerLongPressDelete(id) {
    if (longPressHandled || !id) return;

    longPressHandled = true;
    suppressNextClick = true;
    longPressButton?.classList.remove("skin-option-holding");
    navigator.vibrate?.(50);
    void deleteSkin(id).finally(() => {
      longPressHandled = false;
    });
  }

  function onPickerPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest(".skin-fav-toggle")) return;

    const selectButton = event.target.closest(".skin-option-select");
    if (!selectButton) return;

    const option = selectButton.closest("[data-skin-id]");
    if (!option?.dataset.skinId) return;

    clearLongPress();

    longPressSkinId = option.dataset.skinId;
    longPressButton = selectButton;
    longPressPointerId = event.pointerId;
    longPressMoved = false;
    longPressStart = {
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
    };
    selectButton.classList.add("skin-option-holding");
    selectButton.setPointerCapture(event.pointerId);

    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      triggerLongPressDelete(longPressSkinId);
    }, LONG_PRESS_MS);
  }

  function onPickerPointerMove(event) {
    if (longPressPointerId !== null && event.pointerId !== longPressPointerId) {
      return;
    }

    if (!longPressStart) return;

    const dx = event.clientX - longPressStart.x;
    const dy = event.clientY - longPressStart.y;

    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_PX) {
      longPressMoved = true;
      clearLongPress();
    }
  }

  function onPickerPointerEnd(event) {
    if (longPressPointerId !== null && event.pointerId !== longPressPointerId) {
      return;
    }

    const skinId = longPressSkinId;
    const start = longPressStart;
    const moved = longPressMoved;
    const heldMs = start ? Date.now() - start.time : 0;

    clearLongPress();

    if (!moved && !longPressHandled && skinId && heldMs >= LONG_PRESS_MS) {
      triggerLongPressDelete(skinId);
    }
  }

  function onPickerClick(event) {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

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

  /** Hold a skin tile ~600ms to remove it from disk (with confirm). */
  async function deleteSkin(id) {
    const skin = findSkin(id);
    if (!skin) return;

    const confirmed = window.confirm(
      `Delete skin “${skin.title}”?\n\nThis permanently removes skins/${skin.id}/ from disk.`,
    );
    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/skins/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      let payload = {};
      const raw = await response.text();
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }

      if (!response.ok) {
        const message =
          payload.error ||
          (raw.includes("Cannot DELETE")
            ? "Delete is unavailable — restart the app server (npm run launch)."
            : "Could not delete skin.");
        window.alert(message);
        return;
      }

      const wasActive = getCurrentSkinId() === id;
      catalog = catalog.filter((entry) => entry.id !== id);

      if (state.favorites.has(id)) {
        state.favorites.delete(id);
        writeFavorites();
      }

      if (state.favFilter && state.favorites.size === 0) {
        state.favFilter = false;
        writeFavFilter();
      }

      if (wasActive) {
        const nextSkin =
          findSkin(getSavedSkinId()) ||
          (state.favFilter ? getFavoriteSkins()[0] : null) ||
          catalog[0];
        if (nextSkin) applySkin(nextSkin);
        else render();
      } else {
        render();
      }
    } catch {
      window.alert("Could not delete skin.");
    }
  }

  async function init() {
    shuffleButton = document.getElementById("skin-shuffle");
    favFilterButton = document.getElementById("skin-fav-filter");
    scrollContainer = document.getElementById("skin-scroll");

    state.favorites = readFavorites();
    state.favFilter = readFavFilter();

    try {
      const response = await fetch("/api/skins");
      catalog = shuffleArray(await response.json());
    } catch {
      catalog = [];
    }

    pruneFavorites();

    if (state.favFilter && state.favorites.size === 0) {
      state.favFilter = false;
      writeFavFilter();
    }

    scrollContainer?.addEventListener("pointerdown", onPickerPointerDown);
    document.addEventListener("pointermove", onPickerPointerMove);
    document.addEventListener("pointerup", onPickerPointerEnd);
    document.addEventListener("pointercancel", onPickerPointerEnd);
    scrollContainer?.addEventListener("click", onPickerClick);
    scrollContainer?.addEventListener("contextmenu", (event) => {
      if (event.target.closest(".skin-option-select")) {
        event.preventDefault();
      }
    });
    shuffleButton?.addEventListener("click", shuffleToRandomSkin);
    favFilterButton?.addEventListener("click", toggleFavFilter);

    if (catalog.length === 0) {
      shuffleButton?.setAttribute("disabled", "true");
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

  return { init, deleteSkin };
})();

SkinSystem.init();
