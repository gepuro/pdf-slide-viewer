import { useEffect, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { DisplaySetup, PresentationState } from "../shared/types";
import { loadCurrentPdf } from "./pdf";

const emptyState: PresentationState = {
  document: null,
  page: 1,
  isBlack: false,
  isPresenting: false,
  mode: "idle",
  audienceDisplayId: null,
  startedAt: null,
  warning: null,
};

const fallbackSetup: DisplaySetup = {
  kind: "fallback",
  mode: "practice",
  audienceDisplayId: null,
  presenterDisplayId: null,
  warning: null,
};

export function usePresentationState(): PresentationState {
  const [state, setState] = useState(emptyState);

  useEffect(() => {
    let active = true;
    window.presenter.getState().then((next) => {
      if (active) setState(next);
    });
    const unsubscribe = window.presenter.onStateChange(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}

export function useDisplaySetup(): DisplaySetup {
  const [setup, setSetup] = useState(fallbackSetup);

  useEffect(() => {
    let active = true;
    window.presenter.getDisplaySetup().then((next) => {
      if (active) setSetup(next);
    });
    const unsubscribe = window.presenter.onDisplaySetupChange(setSetup);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return setup;
}

export function usePdfDocument(documentId: string | undefined): {
  pdf: PDFDocumentProxy | null;
  error: string | null;
} {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | null = null;
    setPdf(null);
    setError(null);
    if (!documentId) return;

    loadCurrentPdf()
      .then(async (loadingTask) => {
        task = loadingTask;
        const document = loadingTask ? await loadingTask.promise : null;
        if (active) setPdf(document);
      })
      .catch(() => {
        if (active) setError("PDFの描画データを読み込めませんでした。");
      });

    return () => {
      active = false;
      if (task) void task.destroy();
    };
  }, [documentId]);

  return { pdf, error };
}

export function useClock(startedAt: number | null): {
  clock: string;
  elapsed: string;
} {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return {
    clock: new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now),
    elapsed: [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":"),
  };
}
