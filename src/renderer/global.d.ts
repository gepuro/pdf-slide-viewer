import type { PresenterApi } from "../shared/types";

declare global {
  interface Window {
    presenter: PresenterApi;
  }
}

export {};
