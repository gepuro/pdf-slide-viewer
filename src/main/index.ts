import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  powerMonitor,
  screen,
  type Display,
  type MenuItemConstructorOptions,
} from "electron";
import type {
  DisplaySetup,
  LoadDocumentInput,
  PdfSelection,
  PresentationCommand,
} from "../shared/types.js";
import {
  classifyDisplaySetup,
  fallbackDisplaySetup,
  type NativeDisplayOutput,
} from "./display-setup.js";
import { PresentationStore } from "./presentation-store.js";

const execFileAsync = promisify(execFile);
const isDev = !app.isPackaged;
const store = new PresentationStore();
let presenterWindow: BrowserWindow | null = null;
let audienceWindow: BrowserWindow | null = null;
let originalPresenterBounds: Electron.Rectangle | null = null;
let displayRefreshTimer: NodeJS.Timeout | null = null;
let displayDetectionSequence = 0;
let currentDisplaySetup: DisplaySetup = {
  kind: "fallback",
  mode: "practice",
  audienceDisplayId: null,
  presenterDisplayId: null,
  warning: null,
};

function rendererUrl(view: "presenter" | "audience"): string {
  if (isDev) return `http://127.0.0.1:5173/?view=${view}`;
  return `file://${join(__dirname, "../../dist/index.html")}?view=${view}`;
}

function windowOptions(): Electron.BrowserWindowConstructorOptions {
  return {
    backgroundColor: "#090d14",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

function createPresenterWindow(): void {
  presenterWindow = new BrowserWindow({
    ...windowOptions(),
    title: "PDF Slide Viewer",
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    show: false,
  });
  presenterWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      dialog.showErrorBox(
        "画面を読み込めませんでした",
        `${errorDescription}\n${validatedUrl}`,
      );
    },
  );
  void presenterWindow.loadURL(rendererUrl("presenter"));
  presenterWindow.once("ready-to-show", () => presenterWindow?.show());
  presenterWindow.on("closed", () => {
    presenterWindow = null;
    closeAudienceWindow();
  });
}

async function choosePdfFromDialog(): Promise<PdfSelection | null> {
  const options: Electron.OpenDialogOptions = {
    title: "プレゼンテーション用PDFを選択",
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  };
  const result = presenterWindow
    ? await dialog.showOpenDialog(presenterWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;

  const path = result.filePaths[0];
  const data = await readFile(path);
  return {
    name: path.split("/").pop() ?? "presentation.pdf",
    data: new Uint8Array(data),
  };
}

async function requestPdfOpen(): Promise<void> {
  if (!presenterWindow || presenterWindow.isDestroyed()) {
    createPresenterWindow();
    await new Promise<void>((resolve) => {
      presenterWindow?.webContents.once("did-finish-load", () => resolve());
    });
  }
  presenterWindow?.show();
  presenterWindow?.focus();
  try {
    const selection = await choosePdfFromDialog();
    if (selection && presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.webContents.send("pdf:selected", selection);
    }
  } catch (error) {
    dialog.showErrorBox(
      "PDFを開けませんでした",
      error instanceof Error ? error.message : "ファイルの読み込み中にエラーが発生しました。",
    );
  }
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about", label: "PDF Slide Viewerについて" },
        { type: "separator" },
        { role: "services", label: "サービス" },
        { type: "separator" },
        { role: "hide", label: "PDF Slide Viewerを隠す" },
        { role: "hideOthers", label: "ほかを隠す" },
        { role: "unhide", label: "すべてを表示" },
        { type: "separator" },
        { role: "quit", label: "PDF Slide Viewerを終了" },
      ],
    },
    {
      label: "ファイル",
      submenu: [
        {
          label: "PDFを開く…",
          accelerator: "CmdOrCtrl+O",
          click: () => void requestPdfOpen(),
        },
        { type: "separator" },
        { role: "close", label: "ウィンドウを閉じる" },
      ],
    },
    {
      label: "編集",
      submenu: [
        { role: "undo", label: "取り消す" },
        { role: "redo", label: "やり直す" },
        { type: "separator" },
        { role: "cut", label: "切り取り" },
        { role: "copy", label: "コピー" },
        { role: "paste", label: "ペースト" },
        { role: "selectAll", label: "すべてを選択" },
      ],
    },
    {
      label: "表示",
      submenu: [
        { role: "reload", label: "再読み込み" },
        { role: "togglefullscreen", label: "フルスクリーンにする" },
      ],
    },
    {
      label: "ウィンドウ",
      submenu: [
        { role: "minimize", label: "しまう" },
        { role: "zoom", label: "拡大／縮小" },
        { type: "separator" },
        { role: "front", label: "すべてを手前に移動" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function electronDisplays(): Array<{ id: number; isPrimary: boolean }> {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .map((display) => ({ id: display.id, isPrimary: display.id === primaryId }));
}

function nativeDisplayHelperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "display-info")
    : join(app.getAppPath(), "native-bin/display-info");
}

async function detectDisplaySetup(): Promise<DisplaySetup> {
  const displays = electronDisplays();
  try {
    const { stdout } = await execFileAsync(nativeDisplayHelperPath(), {
      timeout: 3000,
      maxBuffer: 1024 * 1024,
    });
    const output = JSON.parse(stdout) as NativeDisplayOutput;
    if (!output || !Array.isArray(output.displays)) {
      throw new Error("Invalid display helper output.");
    }
    return classifyDisplaySetup(output.displays, displays);
  } catch (error) {
    console.warn("Native display detection failed:", error);
    return fallbackDisplaySetup(displays);
  }
}

function sameDisplaySetup(left: DisplaySetup, right: DisplaySetup): boolean {
  return (
    left.kind === right.kind &&
    left.mode === right.mode &&
    left.audienceDisplayId === right.audienceDisplayId &&
    left.presenterDisplayId === right.presenterDisplayId &&
    left.warning === right.warning
  );
}

function broadcastState(): void {
  const state = store.getState();
  for (const window of [presenterWindow, audienceWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send("presentation:state-changed", state);
    }
  }
}

function broadcastDisplaySetup(): void {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.webContents.send("display:setup-changed", currentDisplaySetup);
  }
}

function closeAudienceWindow(): void {
  const window = audienceWindow;
  audienceWindow = null;
  if (!window || window.isDestroyed()) return;
  window.removeAllListeners("closed");
  window.destroy();
}

function restorePresenterWindow(): void {
  if (!presenterWindow || presenterWindow.isDestroyed()) return;
  presenterWindow.show();
  presenterWindow.setFullScreen(false);
  presenterWindow.setAlwaysOnTop(false);
  if (originalPresenterBounds) {
    presenterWindow.unmaximize();
    presenterWindow.setBounds(originalPresenterBounds);
    originalPresenterBounds = null;
  }
}

function placePresenterOn(target: Display): void {
  if (!presenterWindow || presenterWindow.isDestroyed()) return;
  originalPresenterBounds ??= presenterWindow.getBounds();
  presenterWindow.show();
  presenterWindow.setFullScreen(false);
  presenterWindow.unmaximize();
  presenterWindow.setBounds(target.workArea);
  presenterWindow.maximize();
  presenterWindow.focus();
}

function createAudienceWindow(target: Display): void {
  closeAudienceWindow();
  const window = new BrowserWindow({
    ...windowOptions(),
    title: "PDF Slide Viewer - Audience",
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    frame: false,
    fullscreen: true,
    simpleFullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
  });
  audienceWindow = window;
  void window.loadURL(rendererUrl("audience"));
  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });
  window.on("closed", () => {
    if (audienceWindow === window) audienceWindow = null;
    if (!store.getState().isPresenting) return;
    restorePresenterWindow();
    store.reconfigure(
      "practice",
      null,
      "聴衆用ウィンドウが閉じられたため、練習モードに切り替えました。",
    );
  });
}

function getElectronDisplay(displayId: number | null): Display | undefined {
  if (displayId === null) return undefined;
  return screen.getAllDisplays().find((display) => display.id === displayId);
}

function applyDisplaySetup(setup: DisplaySetup, initialStart: boolean): void {
  closeAudienceWindow();
  restorePresenterWindow();

  let appliedSetup = setup;
  if (setup.mode === "dual-screen") {
    const audience = getElectronDisplay(setup.audienceDisplayId);
    const presenter = getElectronDisplay(setup.presenterDisplayId);
    if (audience && presenter) {
      createAudienceWindow(audience);
      placePresenterOn(presenter);
    } else {
      appliedSetup = {
        kind: "fallback",
        mode: "practice",
        audienceDisplayId: null,
        presenterDisplayId: screen.getPrimaryDisplay().id,
        warning: "画面構成が変更されたため、練習モードに切り替えました。",
      };
    }
  } else if (setup.mode === "mirrored" || setup.mode === "single-screen") {
    const audience =
      getElectronDisplay(setup.audienceDisplayId) ?? screen.getPrimaryDisplay();
    createAudienceWindow(audience);
    presenterWindow?.hide();
  }

  currentDisplaySetup = appliedSetup;
  broadcastDisplaySetup();
  if (initialStart) {
    store.start(
      appliedSetup.mode,
      appliedSetup.audienceDisplayId,
      appliedSetup.warning,
    );
  } else {
    store.reconfigure(
      appliedSetup.mode,
      appliedSetup.audienceDisplayId,
      appliedSetup.warning,
    );
  }
}

async function refreshDisplaySetup(reconfigurePresentation: boolean): Promise<DisplaySetup> {
  const sequence = ++displayDetectionSequence;
  const setup = await detectDisplaySetup();
  if (sequence !== displayDetectionSequence) return currentDisplaySetup;

  const changed = !sameDisplaySetup(currentDisplaySetup, setup);
  currentDisplaySetup = setup;
  if (changed) broadcastDisplaySetup();
  if (reconfigurePresentation && store.getState().isPresenting && changed) {
    applyDisplaySetup(setup, false);
  }
  return setup;
}

function scheduleDisplayRefresh(): void {
  if (displayRefreshTimer) clearTimeout(displayRefreshTimer);
  displayRefreshTimer = setTimeout(() => {
    displayRefreshTimer = null;
    void refreshDisplaySetup(true);
  }, 600);
}

function registerIpc(): void {
  ipcMain.handle("pdf:choose", () => choosePdfFromDialog());
  ipcMain.handle("pdf:load", (_event, input: LoadDocumentInput) => {
    store.loadDocument(input);
    closeAudienceWindow();
    restorePresenterWindow();
  });
  ipcMain.handle("pdf:data", () => store.getPdfData());
  ipcMain.handle("display:setup", () => currentDisplaySetup);
  ipcMain.handle("window:set-fullscreen", (event, enabled: boolean) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return;
    targetWindow.setFullScreen(enabled);
  });
  ipcMain.handle("presentation:state", () => store.getState());
  ipcMain.handle("presentation:command", (_event, command: PresentationCommand) => {
    store.command(command);
  });
  ipcMain.handle("presentation:start", async () => {
    try {
      const setup = await refreshDisplaySetup(false);
      applyDisplaySetup(setup, true);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "開始できませんでした。",
      };
    }
  });
  ipcMain.handle("presentation:stop", () => {
    store.stop();
    closeAudienceWindow();
    restorePresenterWindow();
    presenterWindow?.focus();
  });
}

app.whenReady().then(async () => {
  registerIpc();
  store.subscribe(broadcastState);
  createPresenterWindow();
  installApplicationMenu();
  await refreshDisplaySetup(false);

  screen.on("display-added", scheduleDisplayRefresh);
  screen.on("display-removed", scheduleDisplayRefresh);
  screen.on("display-metrics-changed", scheduleDisplayRefresh);
  powerMonitor.on("resume", scheduleDisplayRefresh);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createPresenterWindow();
  });
});

app.on("window-all-closed", () => app.quit());
