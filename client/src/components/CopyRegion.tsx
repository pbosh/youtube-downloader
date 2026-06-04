interface CopyRegionProps {
  showActivity: boolean;
  logText: string;
  copyLabel: string;
  stopDisabled: boolean;
  onStop: () => void;
  onDismiss: () => void;
  onCopy: () => void;
}

export function CopyRegion({
  showActivity,
  logText,
  copyLabel,
  stopDisabled,
  onStop,
  onDismiss,
  onCopy,
}: CopyRegionProps) {
  return (
    <div
      className={`copy-region${showActivity ? " show-activity" : ""}`}
      id="copy-region"
    >
      <div className="copy-frame">
        <div className="copy-idle">
          <h1>YouTube Downloader</h1>
          <p id="description" className="description">
            Paste a YouTube link. Save these to your desktop:
            <br />
            320 kbps MP3, max-quality MP4 video, JPG thumbnail, or all three.
          </p>
        </div>

        <section className="console" id="console" aria-live="polite">
          <button
            type="button"
            id="stop-btn"
            className="console-stop"
            disabled={stopDisabled}
            title="Stop download"
            aria-label="Stop download"
            onClick={onStop}
          >
            Stop
          </button>
          <button
            type="button"
            id="console-copy"
            className="console-copy"
            aria-label="Copy log to clipboard"
            title="Copy log"
            onClick={onCopy}
          >
            {copyLabel}
          </button>
          <button
            type="button"
            id="console-dismiss"
            className="console-dismiss"
            aria-label="Back to description"
            title="Dismiss"
            onClick={onDismiss}
          >
            ×
          </button>
          <div className="console-log" id="console-log">
            {logText}
          </div>
        </section>
      </div>
    </div>
  );
}
