import cliProgress from "cli-progress";
import type { DownloadProgress } from "./download.js";

const barFormat =
  "{bar} {percentage}% | {phase} | {message}";

export function createProgressBar() {
  const bar = new cliProgress.SingleBar(
    {
      format: barFormat,
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: true,
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(100, 0, {
    phase: "starting",
    message: "Preparing...",
  });

  return {
    update(progress: DownloadProgress) {
      if (progress.phase === "download" && progress.percent != null) {
        bar.update(Math.min(100, Math.round(progress.percent)), {
          phase: "downloading",
          message: progress.message ?? "",
        });
        return;
      }

      if (progress.phase === "extract") {
        bar.update(100, {
          phase: "converting",
          message: progress.message ?? "Converting to 320 kbps MP3...",
        });
        return;
      }

      if (progress.phase === "done") {
        bar.update(100, {
          phase: "done",
          message: "Complete",
        });
        bar.stop();
      }
    },
    fail(message: string) {
      bar.stop();
      console.error(message);
    },
  };
}
