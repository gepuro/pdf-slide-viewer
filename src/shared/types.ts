export interface DocumentInfo {
  id: string;
  name: string;
  pageCount: number;
}

export type PresentationMode =
  | "idle"
  | "practice"
  | "dual-screen"
  | "mirrored"
  | "single-screen";

export type DisplaySetupKind =
  | "internal-only"
  | "extended"
  | "mirrored"
  | "external-only"
  | "fallback";

export interface DisplaySetup {
  kind: DisplaySetupKind;
  mode: Exclude<PresentationMode, "idle">;
  audienceDisplayId: number | null;
  presenterDisplayId: number | null;
  warning: string | null;
}

export interface PresentationState {
  document: DocumentInfo | null;
  page: number;
  isBlack: boolean;
  isPresenting: boolean;
  mode: PresentationMode;
  audienceDisplayId: number | null;
  startedAt: number | null;
  warning: string | null;
}

export type PresentationCommand =
  | { type: "next" }
  | { type: "previous" }
  | { type: "first" }
  | { type: "last" }
  | { type: "go-to"; page: number }
  | { type: "toggle-black" };

export interface PdfSelection {
  name: string;
  data: Uint8Array;
}

export interface LoadDocumentInput extends PdfSelection {
  pageCount: number;
}

export interface StartPresentationResult {
  ok: boolean;
  message?: string;
}

export interface PresenterApi {
  choosePdf: () => Promise<PdfSelection | null>;
  loadDocument: (input: LoadDocumentInput) => Promise<void>;
  getPdfData: () => Promise<Uint8Array | null>;
  getDisplaySetup: () => Promise<DisplaySetup>;
  getState: () => Promise<PresentationState>;
  startPresentation: () => Promise<StartPresentationResult>;
  stopPresentation: () => Promise<void>;
  sendCommand: (command: PresentationCommand) => Promise<void>;
  onStateChange: (listener: (state: PresentationState) => void) => () => void;
  onDisplaySetupChange: (listener: (setup: DisplaySetup) => void) => () => void;
  onPdfSelected: (listener: (selection: PdfSelection) => void) => () => void;
}
