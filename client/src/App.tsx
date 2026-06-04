import { useEffect, useRef } from "react";
import { CopyRegion } from "./components/CopyRegion";
import { DownloadForm } from "./components/DownloadForm";
import { SceneBanner } from "./components/SceneBanner";
import { SkinBar } from "./components/SkinBar";
import { useDownload } from "./hooks/useDownload";
import { useVideoFormats } from "./hooks/useVideoFormats";
import { focusAppMain, initSkinSystem } from "./lib/skinSystem.js";

export function App() {
  const mainRef = useRef<HTMLElement>(null);
  const logFnRef = useRef<(message: string) => void>(() => {});

  const formats = useVideoFormats((message) => logFnRef.current(message));

  const download = useDownload({
    getDownloadQuery: () => formats.getDownloadQuery(),
    isFormatLoading: () => formats.isLoading(),
  });

  logFnRef.current = download.appendLog;

  useEffect(() => {
    void initSkinSystem().then(() => {
      focusAppMain();
    });
  }, []);

  useEffect(() => {
    const node = document.getElementById("console-log");
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [download.logText]);

  useEffect(() => {
    if (download.url.trim()) {
      formats.scheduleRefresh(download.url);
    }
  }, []);

  const actionsDisabled = download.downloadBusy || formats.loading;

  return (
    <main tabIndex={-1} ref={mainRef}>
      <SceneBanner />
      <SkinBar />
      <CopyRegion
        showActivity={download.showActivity}
        logText={download.logText}
        copyLabel={download.copyLabel}
        stopDisabled={!download.downloadBusy}
        onStop={() => void download.stopDownload()}
        onDismiss={download.dismissConsole}
        onCopy={() => void download.copyConsoleLog()}
      />
      <DownloadForm
        url={download.url}
        formatLoading={formats.loading}
        formatOptions={formats.options}
        selectedOptionId={formats.selectedOptionId}
        emptyOptionLabel={formats.emptyOptionLabel}
        actionsDisabled={actionsDisabled}
        progressSnapshot={download.progressSnapshot}
        onUrlChange={(value) => {
          download.setUrl(value);
          formats.scheduleRefresh(value);
        }}
        onUrlPaste={() => {
          window.requestAnimationFrame(() => {
            const input = document.getElementById("url") as HTMLInputElement | null;
            const value = input?.value ?? download.url;
            download.setUrl(value);
            formats.scheduleRefresh(value);
          });
        }}
        onClearUrl={() => {
          download.setUrl("");
          formats.scheduleRefresh("");
          document.getElementById("url")?.focus();
        }}
        onFormatChange={formats.selectOption}
        onDownload={download.startDownload}
      />
    </main>
  );
}
