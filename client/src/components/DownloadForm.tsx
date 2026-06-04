import type { FormEvent } from "react";
import type { VideoFormatOption } from "../types/api";
import type { ProgressSnapshot } from "../lib/progressEngine";
import { DownloadButton } from "./DownloadButton";

interface DownloadFormProps {
  url: string;
  formatLoading: boolean;
  formatOptions: VideoFormatOption[];
  selectedOptionId: string;
  emptyOptionLabel: string;
  actionsDisabled: boolean;
  progressSnapshot: ProgressSnapshot | null;
  onUrlChange: (value: string) => void;
  onUrlPaste: () => void;
  onClearUrl: () => void;
  onFormatChange: (optionId: string) => void;
  onDownload: (kind: "mp3" | "video" | "thumb" | "all") => void;
}

export function DownloadForm({
  url,
  formatLoading,
  formatOptions,
  selectedOptionId,
  emptyOptionLabel,
  actionsDisabled,
  progressSnapshot,
  onUrlChange,
  onUrlPaste,
  onClearUrl,
  onFormatChange,
  onDownload,
}: DownloadFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onDownload("mp3");
  };

  const buttons = progressSnapshot?.buttons;

  return (
    <form
      id="download-form"
      className={formatLoading ? "is-format-loading" : undefined}
      onSubmit={handleSubmit}
    >
      <label htmlFor="url">YouTube URL</label>
      <div className="url-field">
        <input
          id="url"
          name="url"
          type="text"
          placeholder="https://www.youtube.com/watch?v=..."
          required
          autoComplete="off"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          onPaste={onUrlPaste}
        />
        <button
          type="button"
          id="url-clear"
          className={`url-clear${url.length > 0 ? " visible" : ""}`}
          aria-label="Clear URL"
          title="Clear"
          onClick={onClearUrl}
        >
          ×
        </button>
      </div>

      <div
        className={`video-format-field${formatLoading ? " is-loading" : ""}`}
        id="video-format-field"
      >
        <select
          id="video-format"
          disabled={formatLoading || formatOptions.length === 0}
          aria-label="Video format"
          value={selectedOptionId || ""}
          onChange={(event) => onFormatChange(event.target.value)}
        >
          {formatOptions.length === 0 ? (
            <option value="">{emptyOptionLabel}</option>
          ) : (
            formatOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.quickTimeReady
                  ? `${option.label} · QuickTime ready`
                  : option.label}
              </option>
            ))
          )}
        </select>
      </div>

      <DownloadButton
        id="mp3-btn"
        kind="mp3"
        type="submit"
        label="Download MP3"
        disabled={actionsDisabled}
        state={buttons?.mp3}
      />
      <DownloadButton
        id="video-btn"
        kind="video"
        label="Download Video"
        disabled={actionsDisabled}
        state={buttons?.video}
        onClick={() => {
          if (!url.trim()) {
            document.getElementById("url")?.focus();
            return;
          }
          onDownload("video");
        }}
      />
      <DownloadButton
        id="thumb-btn"
        kind="thumb"
        label="Download Thumb"
        disabled={actionsDisabled}
        state={buttons?.thumb}
        onClick={() => {
          if (!url.trim()) {
            document.getElementById("url")?.focus();
            return;
          }
          onDownload("thumb");
        }}
      />
      <DownloadButton
        id="all-btn"
        kind="all"
        label="Download ALL"
        disabled={actionsDisabled}
        state={buttons?.all}
        onClick={() => {
          if (!url.trim()) {
            document.getElementById("url")?.focus();
            return;
          }
          onDownload("all");
        }}
      />
    </form>
  );
}
