import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type {
  DisplaySetup,
  PdfSelection,
  PresentationCommand,
  PresentationState,
} from "../shared/types";
import {
  useClock,
  useDisplaySetup,
  usePdfDocument,
  usePresentationState,
} from "./hooks";
import { PageCanvas } from "./PageCanvas";
import { validatePdf } from "./pdf";

export function App() {
  const view = new URLSearchParams(window.location.search).get("view");
  const state = usePresentationState();
  const { pdf, error } = usePdfDocument(state.document?.id);

  if (view === "audience") {
    return <AudienceView state={state} pdf={pdf} />;
  }
  return <PresenterView state={state} pdf={pdf} pdfError={error} />;
}

function usePresentationKeys(state: PresentationState, enabled = true) {
  const numberBuffer = useRef("");
  const numberTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const send = (command: PresentationCommand) => void window.presenter.sendCommand(command);
    const commitNumber = () => {
      if (numberBuffer.current) {
        send({ type: "go-to", page: Number(numberBuffer.current) });
        numberBuffer.current = "";
      }
      if (numberTimer.current) window.clearTimeout(numberTimer.current);
    };
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, select, textarea, button")) return;

      const commands: Record<string, PresentationCommand> = {
        ArrowRight: { type: "next" },
        ArrowDown: { type: "next" },
        " ": { type: "next" },
        PageDown: { type: "next" },
        ArrowLeft: { type: "previous" },
        ArrowUp: { type: "previous" },
        PageUp: { type: "previous" },
        Home: { type: "first" },
        End: { type: "last" },
        b: { type: "toggle-black" },
        B: { type: "toggle-black" },
      };
      if (commands[event.key]) {
        event.preventDefault();
        send(commands[event.key]);
      } else if (/^\d$/.test(event.key)) {
        numberBuffer.current += event.key;
        if (numberTimer.current) window.clearTimeout(numberTimer.current);
        numberTimer.current = window.setTimeout(commitNumber, 900);
      } else if (event.key === "Enter") {
        commitNumber();
      } else if (event.key === "Escape" && state.isPresenting) {
        void window.presenter.stopPresentation();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (numberTimer.current) window.clearTimeout(numberTimer.current);
    };
  }, [enabled, state.isPresenting]);
}

function AudienceView({
  state,
  pdf,
}: {
  state: PresentationState;
  pdf: PDFDocumentProxy | null;
}) {
  usePresentationKeys(state);
  const handleClick = (event: React.MouseEvent) => {
    const command: PresentationCommand =
      event.clientX < window.innerWidth * 0.25 ? { type: "previous" } : { type: "next" };
    void window.presenter.sendCommand(command);
  };

  return (
    <main className="audience-view" onClick={handleClick}>
      <PageCanvas pdf={pdf} pageNumber={state.page} className="audience-page" />
      <div className={`blackout ${state.isBlack ? "visible" : ""}`} />
    </main>
  );
}

function PresenterView({
  state,
  pdf,
  pdfError,
}: {
  state: PresentationState;
  pdf: PDFDocumentProxy | null;
  pdfError: string | null;
}) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const displaySetup = useDisplaySetup();
  const { clock, elapsed } = useClock(state.startedAt);

  usePresentationKeys(state, Boolean(state.document));

  const importPdf = useCallback(async (selection: PdfSelection | null) => {
    if (!selection) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const pageCount = await validatePdf(selection);
      await window.presenter.loadDocument({ ...selection, pageCount });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "PDFを読み込めませんでした。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const choosePdf = useCallback(async () => {
    try {
      await importPdf(await window.presenter.choosePdf());
    } catch {
      setLoadError("ファイル選択を開始できませんでした。");
    }
  }, [importPdf]);

  useEffect(
    () => window.presenter.onPdfSelected((selection) => void importPdf(selection)),
    [importPdf],
  );

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    await importPdf({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
  };

  const start = async () => {
    const result = await window.presenter.startPresentation();
    if (!result.ok) setLoadError(result.message ?? "プレゼンテーションを開始できません。");
  };

  if (!state.document) {
    return (
      <main className="setup-shell">
        <section className="setup-card">
          <div className="brand-mark">P</div>
          <p className="eyebrow">PDF SLIDE VIEWER</p>
          <h1>PDFを、そのままプレゼンに。</h1>
          <p className="setup-lead">
            発表者ビューと聴衆向け全画面を同期して、Macからシンプルに発表できます。
          </p>
          <button
            className={`drop-zone ${isDragging ? "dragging" : ""}`}
            type="button"
            onClick={choosePdf}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <span className="upload-icon">↑</span>
            <strong>{isLoading ? "PDFを確認しています…" : "PDFを選択"}</strong>
            <small>または、ここにドラッグ＆ドロップ</small>
          </button>
          {loadError ? <p className="error-banner">{loadError}</p> : null}
          <div className="feature-row">
            <span>ローカル処理</span>
            <span>2画面対応</span>
            <span>オフライン動作</span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="presenter-shell">
      <header className="topbar">
        <div className="document-title">
          <div className="mini-brand">P</div>
          <div>
            <strong>{state.document.name}</strong>
            <span>{state.document.pageCount}ページ</span>
          </div>
        </div>
        <div className="topbar-center">
          <span className={`status-dot ${state.isPresenting ? "live" : ""}`} />
          {state.isPresenting
            ? presentationModeLabel(state.mode)
            : "準備中"}
        </div>
        <div className="time-cluster">
          <div>
            <span>経過時間</span>
            <strong>{elapsed}</strong>
          </div>
          <div>
            <span>現在時刻</span>
            <strong>{clock}</strong>
          </div>
        </div>
      </header>

      {state.warning ? <div className="warning-banner">{state.warning}</div> : null}
      {loadError || pdfError ? <div className="error-banner dashboard-error">{loadError || pdfError}</div> : null}

      <section className="presenter-grid">
        <div className="current-panel panel">
          <div className="panel-label">
            <span>現在のスライド</span>
            <strong>{state.page} / {state.document.pageCount}</strong>
          </div>
          <div className="slide-frame current-frame">
            <PageCanvas pdf={pdf} pageNumber={state.page} />
            <div className={`preview-blackout ${state.isBlack ? "visible" : ""}`}>
              <span>聴衆画面は黒画面です</span>
            </div>
          </div>
        </div>

        <aside className="side-column">
          <div className="next-panel panel">
            <div className="panel-label">
              <span>次のスライド</span>
              <strong>{Math.min(state.page + 1, state.document.pageCount)}</strong>
            </div>
            <div className="slide-frame next-frame">
              {state.page < state.document.pageCount ? (
                <PageCanvas pdf={pdf} pageNumber={state.page + 1} />
              ) : (
                <div className="end-card">最後のスライドです</div>
              )}
            </div>
          </div>

          {!state.isPresenting ? (
            <div className="launch-panel panel">
              <label>ディスプレイ設定</label>
              <div className="display-auto-card">
                <span className="display-auto-icon" aria-hidden="true">◎</span>
                <div>
                  <strong>{displaySetupTitle(displaySetup)}</strong>
                  <p>{displaySetupDescription(displaySetup)}</p>
                </div>
              </div>
              {displaySetup.warning ? (
                <div className="practice-note">{displaySetup.warning}</div>
              ) : null}
              <button className="primary-button" type="button" onClick={start}>
                プレゼンテーションを開始
              </button>
              <button className="text-button" type="button" onClick={choosePdf}>
                別のPDFを開く
              </button>
            </div>
          ) : (
            <Navigation state={state} />
          )}
        </aside>
      </section>

      <footer className="shortcut-bar">
        <span><kbd>←</kbd><kbd>→</kbd> スライド移動</span>
        <span><kbd>B</kbd> 黒画面</span>
        <span><kbd>数字</kbd> ページ指定</span>
        <span><kbd>Esc</kbd> 終了</span>
      </footer>
    </main>
  );
}

function presentationModeLabel(mode: PresentationState["mode"]): string {
  switch (mode) {
    case "dual-screen":
      return "プレゼンテーション中";
    case "mirrored":
      return "ミラー表示中";
    case "single-screen":
      return "全画面表示中";
    case "practice":
      return "練習モード";
    default:
      return "準備中";
  }
}

function displaySetupTitle(setup: DisplaySetup): string {
  switch (setup.kind) {
    case "extended":
      return "拡張ディスプレイを検出";
    case "mirrored":
      return "ミラーリングを検出";
    case "external-only":
      return "外部ディスプレイのみ";
    case "internal-only":
      return "内蔵ディスプレイのみ";
    case "fallback":
      return setup.mode === "dual-screen" ? "2画面を検出" : "1画面を検出";
  }
}

function displaySetupDescription(setup: DisplaySetup): string {
  switch (setup.mode) {
    case "dual-screen":
      return "発表者画面と聴衆画面を自動的に配置します。";
    case "mirrored":
      return "両方の画面にスライドを全画面表示します。";
    case "single-screen":
      return "接続中の外部画面にスライドを全画面表示します。";
    case "practice":
      return "発表者画面内のプレビューを使う練習モードで開始します。";
  }
}

function Navigation({ state }: { state: PresentationState }) {
  const [pageValue, setPageValue] = useState(String(state.page));

  useEffect(() => setPageValue(String(state.page)), [state.page]);
  const send = (command: PresentationCommand) => void window.presenter.sendCommand(command);
  const goToPage = () => {
    const page = Number(pageValue);
    if (Number.isFinite(page)) send({ type: "go-to", page });
  };

  return (
    <div className="navigation panel">
      <div className="nav-row">
        <button type="button" onClick={() => send({ type: "first" })} aria-label="先頭">|‹</button>
        <button type="button" onClick={() => send({ type: "previous" })} aria-label="前へ">‹</button>
        <div className="page-jump">
          <input
            aria-label="移動先ページ"
            type="number"
            min={1}
            max={state.document?.pageCount}
            value={pageValue}
            onChange={(event) => setPageValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") goToPage();
            }}
          />
          <button type="button" onClick={goToPage}>移動</button>
        </div>
        <button type="button" onClick={() => send({ type: "next" })} aria-label="次へ">›</button>
        <button type="button" onClick={() => send({ type: "last" })} aria-label="末尾">›|</button>
      </div>
      <button
        type="button"
        className={`black-button ${state.isBlack ? "active" : ""}`}
        onClick={() => send({ type: "toggle-black" })}
      >
        <span className="black-square" />
        {state.isBlack ? "スライド表示に戻す" : "聴衆画面を黒くする"}
      </button>
      <button className="stop-button" type="button" onClick={() => window.presenter.stopPresentation()}>
        プレゼンテーションを終了
      </button>
    </div>
  );
}
