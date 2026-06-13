import { contextBridge, ipcRenderer } from "electron";
import type {
  DisplaySetup,
  LoadDocumentInput,
  PdfSelection,
  PresentationCommand,
  PresentationState,
  PresenterApi,
} from "../shared/types.js";

const api: PresenterApi = {
  choosePdf: () => ipcRenderer.invoke("pdf:choose"),
  loadDocument: (input: LoadDocumentInput) => ipcRenderer.invoke("pdf:load", input),
  getPdfData: () => ipcRenderer.invoke("pdf:data"),
  getDisplaySetup: () => ipcRenderer.invoke("display:setup"),
  getState: () => ipcRenderer.invoke("presentation:state"),
  startPresentation: () => ipcRenderer.invoke("presentation:start"),
  stopPresentation: () => ipcRenderer.invoke("presentation:stop"),
  sendCommand: (command: PresentationCommand) =>
    ipcRenderer.invoke("presentation:command", command),
  onStateChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: PresentationState) =>
      listener(state);
    ipcRenderer.on("presentation:state-changed", handler);
    return () => ipcRenderer.removeListener("presentation:state-changed", handler);
  },
  onDisplaySetupChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, setup: DisplaySetup) =>
      listener(setup);
    ipcRenderer.on("display:setup-changed", handler);
    return () => ipcRenderer.removeListener("display:setup-changed", handler);
  },
  onPdfSelected: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, selection: PdfSelection) =>
      listener(selection);
    ipcRenderer.on("pdf:selected", handler);
    return () => ipcRenderer.removeListener("pdf:selected", handler);
  },
};

contextBridge.exposeInMainWorld("presenter", api);
