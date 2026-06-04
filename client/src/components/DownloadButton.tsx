import type { ButtonProgressState } from "../lib/progressEngine";

interface DownloadButtonProps {
  id: string;
  label: string;
  kind: "mp3" | "video" | "thumb" | "all";
  type?: "submit" | "button";
  disabled: boolean;
  state?: ButtonProgressState;
  onClick?: () => void;
}

export function DownloadButton({
  id,
  label,
  kind,
  type = "button",
  disabled,
  state,
  onClick,
}: DownloadButtonProps) {
  const percent = Math.max(0, Math.min(100, state?.percent ?? 0));
  const showFill = state?.active || state?.complete;
  const className = [
    kind === "all" ? "all" : "",
    state?.running && !state.complete ? "is-running" : "",
    state?.complete ? "is-complete" : "",
    showFill ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      id={id}
      className={className || undefined}
      data-kind={kind}
      disabled={disabled}
      onClick={onClick}
    >
      <span
        className="btn-progress"
        aria-hidden="true"
        style={{
          width: state?.complete ? "100%" : `${percent}%`,
          opacity: showFill ? 1 : undefined,
        }}
      />
      <span className="btn-label">{label}</span>
    </button>
  );
}
