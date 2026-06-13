import { describe, expect, it, vi } from "vitest";
import { PresentationStore } from "./presentation-store.js";

function loadedStore(pageCount = 5): PresentationStore {
  const store = new PresentationStore();
  store.loadDocument({
    name: "slides.pdf",
    data: new Uint8Array([1, 2, 3]),
    pageCount,
  });
  return store;
}

describe("PresentationStore", () => {
  it("keeps page navigation within the document", () => {
    const store = loadedStore(3);
    store.command({ type: "previous" });
    expect(store.getState().page).toBe(1);
    store.command({ type: "last" });
    store.command({ type: "next" });
    expect(store.getState().page).toBe(3);
    store.command({ type: "go-to", page: 99 });
    expect(store.getState().page).toBe(3);
    store.command({ type: "go-to", page: -4 });
    expect(store.getState().page).toBe(1);
    store.command({ type: "go-to", page: Number.NaN });
    expect(store.getState().page).toBe(1);
  });

  it("rejects empty and non-PDF documents", () => {
    const store = new PresentationStore();
    expect(() =>
      store.loadDocument({ name: "slides.txt", data: new Uint8Array([1]), pageCount: 1 }),
    ).toThrow("PDFファイル");
    expect(() =>
      store.loadDocument({ name: "slides.pdf", data: new Uint8Array(), pageCount: 0 }),
    ).toThrow("有効なPDF");
  });

  it("toggles the audience blackout", () => {
    const store = loadedStore();
    store.command({ type: "toggle-black" });
    expect(store.getState().isBlack).toBe(true);
    store.command({ type: "toggle-black" });
    expect(store.getState().isBlack).toBe(false);
  });

  it("starts and stops the presentation timer", () => {
    vi.spyOn(Date, "now").mockReturnValue(123456);
    const store = loadedStore();
    store.start("dual-screen", 7);
    expect(store.getState()).toMatchObject({
      isPresenting: true,
      mode: "dual-screen",
      audienceDisplayId: 7,
      startedAt: 123456,
    });
    store.stop();
    expect(store.getState()).toMatchObject({
      isPresenting: false,
      mode: "idle",
      startedAt: null,
    });
  });

  it("notifies every synchronized view with snapshots", () => {
    const store = loadedStore();
    const presenter = vi.fn();
    const audience = vi.fn();
    store.subscribe(presenter);
    store.subscribe(audience);
    store.command({ type: "next" });
    expect(presenter).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    expect(audience).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("keeps the timer and presentation state while reconfiguring displays", () => {
    const store = loadedStore();
    store.start("dual-screen", 3);
    const startedAt = store.getState().startedAt;
    store.command({ type: "next" });
    store.command({ type: "toggle-black" });
    store.reconfigure("mirrored", 1, "display changed");
    expect(store.getState()).toMatchObject({
      mode: "mirrored",
      audienceDisplayId: 1,
      warning: "display changed",
      startedAt,
      page: 2,
      isBlack: true,
    });
  });
});
