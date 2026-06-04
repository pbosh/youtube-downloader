export function SkinBar() {
  return (
    <div className="skin-bar">
      <div className="skin-bar-row">
        <div className="skin-controls">
          <button
            type="button"
            id="skin-shuffle"
            className="skin-control skin-shuffle"
          >
            <span
              className="skin-control-icon skin-control-icon-svg"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                preserveAspectRatio="xMidYMid meet"
              >
                <path d="M16 3h5v5" />
                <path d="M4 20 20 4" />
                <path d="M21 16v5h-5" />
                <path d="M15 15l6 6" />
                <path d="M4 4l5 5" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            id="skin-fav-filter"
            className="skin-control skin-fav-filter"
            aria-pressed="false"
          >
            <span
              className="skin-control-icon skin-control-icon-svg"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                preserveAspectRatio="xMidYMid meet"
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            </span>
          </button>
          <div
            id="skin-mode-switch"
            className="skin-mode-switch"
            role="group"
            data-mode="light"
            aria-label="Skin brightness: showing light skins"
          >
            <span className="skin-mode-switch-thumb" aria-hidden="true" />
            <button
              type="button"
              id="skin-mode-light"
              className="skin-mode-switch-option is-active"
              aria-pressed="true"
              title="Light skins"
            >
              <span className="skin-control-icon-svg" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              </span>
            </button>
            <button
              type="button"
              id="skin-mode-dark"
              className="skin-mode-switch-option"
              aria-pressed="false"
              title="Dark skins"
            >
              <span className="skin-control-icon-svg" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              </span>
            </button>
          </div>
        </div>
        <div className="skin-scroll" id="skin-scroll" aria-label="UI skins" />
      </div>
    </div>
  );
}
