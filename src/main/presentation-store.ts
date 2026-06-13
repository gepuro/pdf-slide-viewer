import { randomUUID } from "node:crypto";
import type {
  LoadDocumentInput,
  PresentationCommand,
  PresentationMode,
  PresentationState,
} from "../shared/types.js";

type Listener = (state: PresentationState) => void;

const initialState = (): PresentationState => ({
  document: null,
  page: 1,
  isBlack: false,
  isPresenting: false,
  mode: "idle",
  audienceDisplayId: null,
  startedAt: null,
  warning: null,
});

export class PresentationStore {
  private state = initialState();
  private pdfData: Uint8Array | null = null;
  private readonly listeners = new Set<Listener>();

  getState(): PresentationState {
    return structuredClone(this.state);
  }

  getPdfData(): Uint8Array | null {
    return this.pdfData ? new Uint8Array(this.pdfData) : null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  loadDocument(input: LoadDocumentInput): void {
    if (!input.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("PDFファイルを選択してください。");
    }
    if (input.data.byteLength === 0 || input.pageCount < 1) {
      throw new Error("有効なPDFファイルではありません。");
    }

    this.pdfData = new Uint8Array(input.data);
    this.state = {
      ...initialState(),
      document: {
        id: randomUUID(),
        name: input.name,
        pageCount: input.pageCount,
      },
    };
    this.emit();
  }

  command(command: PresentationCommand): void {
    const pageCount = this.state.document?.pageCount ?? 0;
    if (pageCount === 0) return;

    switch (command.type) {
      case "next":
        this.state.page = Math.min(pageCount, this.state.page + 1);
        break;
      case "previous":
        this.state.page = Math.max(1, this.state.page - 1);
        break;
      case "first":
        this.state.page = 1;
        break;
      case "last":
        this.state.page = pageCount;
        break;
      case "go-to":
        if (!Number.isFinite(command.page)) return;
        this.state.page = Math.min(pageCount, Math.max(1, Math.trunc(command.page)));
        break;
      case "toggle-black":
        this.state.isBlack = !this.state.isBlack;
        break;
    }
    this.emit();
  }

  start(
    mode: Exclude<PresentationMode, "idle">,
    displayId: number | null,
    warning: string | null = null,
  ): void {
    if (!this.state.document) {
      throw new Error("PDFを読み込んでください。");
    }
    this.state = {
      ...this.state,
      isPresenting: true,
      mode,
      audienceDisplayId: displayId,
      startedAt: Date.now(),
      warning,
    };
    this.emit();
  }

  stop(): void {
    this.state = {
      ...this.state,
      isPresenting: false,
      mode: "idle",
      audienceDisplayId: null,
      startedAt: null,
      isBlack: false,
      warning: null,
    };
    this.emit();
  }

  reconfigure(
    mode: Exclude<PresentationMode, "idle">,
    displayId: number | null,
    warning: string | null,
  ): void {
    if (!this.state.isPresenting) return;
    this.state = {
      ...this.state,
      isPresenting: true,
      mode,
      audienceDisplayId: displayId,
      warning,
    };
    this.emit();
  }

  clearWarning(): void {
    if (!this.state.warning) return;
    this.state.warning = null;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
