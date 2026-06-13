import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PdfSelection } from "../shared/types";

GlobalWorkerOptions.workerSrc = workerUrl;

export async function validatePdf(selection: PdfSelection): Promise<number> {
  if (!selection.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("PDFファイルを選択してください。");
  }
  if (selection.data.byteLength === 0) {
    throw new Error("ファイルが空です。");
  }

  const task = getDocument({ data: selection.data.slice() });
  try {
    const pdf = await task.promise;
    const pageCount = pdf.numPages;
    await task.destroy();
    return pageCount;
  } catch (error) {
    void task.destroy();
    if (error instanceof Error && error.name === "PasswordException") {
      throw new Error("暗号化されたPDFには対応していません。");
    }
    throw new Error("PDFを読み込めませんでした。ファイルが破損している可能性があります。");
  }
}

export async function loadCurrentPdf(): Promise<PDFDocumentLoadingTask | null> {
  const data = await window.presenter.getPdfData();
  if (!data) return null;
  return getDocument({ data: data.slice() });
}
