const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PORT = 47823;
const HOST = "127.0.0.1";
const APP_URL = `http://${HOST}:${PORT}/`;

/** @type {import("electron").BrowserWindow | null} */
let mainWindow = null;
let backendStarted = false;

const MEASURE_CONTENT_SIZE = `(() => {
  const main = document.querySelector("main");
  if (!main) return null;
  const rect = main.getBoundingClientRect();
  const bodyStyle = getComputedStyle(document.body);
  const padX =
    Number.parseFloat(bodyStyle.paddingLeft) +
    Number.parseFloat(bodyStyle.paddingRight);
  const padY =
    Number.parseFloat(bodyStyle.paddingTop) +
    Number.parseFloat(bodyStyle.paddingBottom);
  return {
    width: Math.ceil(rect.width + padX),
    height: Math.ceil(rect.height + padY),
  };
})()`;

async function fitWindowToContent(win = mainWindow, { center = false } = {}) {
  if (!win || win.isDestroyed()) {
    return;
  }

  const size = await win.webContents.executeJavaScript(
    MEASURE_CONTENT_SIZE,
    true,
  );

  if (!size?.width || !size?.height) {
    return;
  }

  win.setContentSize(size.width, size.height, false);

  if (center) {
    win.center();
  }
}

function electronArch() {
  return process.arch === "x64" ? "x64" : process.arch;
}

function bundledBinDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bin");
  }

  return path.join(__dirname, "..", "resources", "bin", process.platform, electronArch());
}

function configureToolPaths() {
  const binDir = bundledBinDir();
  const ytDlpName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const ytDlpPath = path.join(binDir, ytDlpName);
  const ffmpegPath = path.join(binDir, ffmpegName);

  if (fs.existsSync(ytDlpPath)) {
    process.env.YT_DLP_BIN_DIR = binDir;
    process.env.YT_DLP_PATH = ytDlpPath;
  }

  if (fs.existsSync(ffmpegPath)) {
    process.env.FFMPEG_PATH = ffmpegPath;
  }
}

function bundledSkinsDir() {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), "skins");
  }

  return path.join(process.resourcesPath, "app.asar.unpacked", "skins");
}

function ensureUserSkinsDir() {
  const bundledSkins = bundledSkinsDir();

  if (!app.isPackaged) {
    process.env.SKINS_DIR = bundledSkins;
    return bundledSkins;
  }

  const userSkins = path.join(app.getPath("userData"), "skins");
  const marker = path.join(userSkins, ".seed-complete");

  if (!fs.existsSync(marker)) {
    if (!fs.existsSync(bundledSkins)) {
      throw new Error(`Bundled skins not found at ${bundledSkins}`);
    }

    fs.rmSync(userSkins, { recursive: true, force: true });
    fs.mkdirSync(userSkins, { recursive: true });
    fs.cpSync(bundledSkins, userSkins, { recursive: true, force: true });
    fs.writeFileSync(marker, new Date().toISOString(), "utf8");
  }

  process.env.SKINS_DIR = userSkins;
  return userSkins;
}

async function waitForServer(maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(APP_URL, { redirect: "manual" });
      if (response.ok) {
        return;
      }
    } catch {
      // server still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("The local server did not start in time.");
}

async function startBackend() {
  if (backendStarted) {
    return;
  }

  configureToolPaths();
  ensureUserSkinsDir();

  process.env.PORT = String(PORT);
  process.env.HOST = HOST;

  const serverModule = pathToFileURL(
    path.join(app.getAppPath(), "dist", "server.js"),
  ).href;
  const server = await import(serverModule);
  if (typeof server.startServer !== "function") {
    throw new Error("Server module is missing startServer().");
  }
  await server.startServer(PORT, HOST);
  await waitForServer();
  backendStarted = true;
}

async function waitForSkinReady(win, maxAttempts = 120) {
  if (!win || win.isDestroyed()) {
    return;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const ready = await win.webContents.executeJavaScript(
      `document.documentElement.classList.contains("skin-ready")`,
      true,
    );
    if (ready) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 608,
    height: 720,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "YouTube Downloader",
    backgroundColor: "#0f1115",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    void (async () => {
      await waitForSkinReady(mainWindow);
      await fitWindowToContent(mainWindow, { center: true });
      mainWindow?.show();
    })();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(APP_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function boot() {
  try {
    await startBackend();
    await createMainWindow();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start YouTube Downloader.";
    dialog.showErrorBox("YouTube Downloader", message);
    app.quit();
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  // Intentionally no-op: auto-resize recenters the window and overrides user placement.
  ipcMain.handle("window:resize-to-content", () => {});

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      boot();
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
