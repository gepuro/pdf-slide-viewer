import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

interface PageCanvasProps {
  pdf: PDFDocumentProxy | null;
  pageNumber: number;
  className?: string;
}

export function PageCanvas({ pdf, pageNumber, className = "" }: PageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdf || !canvas || size.width < 2 || size.height < 2 || pageNumber > pdf.numPages) {
      return;
    }

    let active = true;
    let renderTask: RenderTask | null = null;
    setStatus("loading");
    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (!active) return;
        const base = page.getViewport({ scale: 1 });
        const fitScale = Math.min(size.width / base.width, size.height / base.height);
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: fitScale });

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas is unavailable");

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        return renderTask.promise;
      })
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch((error) => {
        if (active && error?.name !== "RenderingCancelledException") setStatus("error");
      });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [pageNumber, pdf, size.height, size.width]);

  return (
    <div ref={hostRef} className={`page-canvas ${className}`}>
      {!pdf || status === "loading" ? <div className="canvas-loader">描画中</div> : null}
      {status === "error" ? <div className="canvas-error">ページを描画できません</div> : null}
      <canvas ref={canvasRef} aria-label={`PDF ${pageNumber}ページ`} />
    </div>
  );
}
