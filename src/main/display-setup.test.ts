import { describe, expect, it } from "vitest";
import {
  classifyDisplaySetup,
  fallbackDisplaySetup,
  type NativeDisplay,
} from "./display-setup.js";

const display = (overrides: Partial<NativeDisplay>): NativeDisplay => ({
  id: 1,
  isBuiltin: true,
  isMain: true,
  isAsleep: false,
  isInMirrorSet: false,
  mirrorsDisplay: null,
  ...overrides,
});

describe("classifyDisplaySetup", () => {
  it("uses practice mode for the built-in display only", () => {
    expect(
      classifyDisplaySetup([display({})], [{ id: 1, isPrimary: true }]),
    ).toEqual({
      kind: "internal-only",
      mode: "practice",
      audienceDisplayId: null,
      presenterDisplayId: 1,
      warning: null,
    });
  });

  it("places the presenter on built-in and audience on external in extended mode", () => {
    expect(
      classifyDisplaySetup(
        [display({}), display({ id: 4, isBuiltin: false, isMain: false })],
        [
          { id: 1, isPrimary: true },
          { id: 4, isPrimary: false },
        ],
      ),
    ).toMatchObject({
      kind: "extended",
      mode: "dual-screen",
      audienceDisplayId: 4,
      presenterDisplayId: 1,
    });
  });

  it("uses the mirror source as the single logical audience display", () => {
    expect(
      classifyDisplaySetup(
        [
          display({ isInMirrorSet: true }),
          display({
            id: 8,
            isBuiltin: false,
            isMain: false,
            isInMirrorSet: true,
            mirrorsDisplay: 1,
          }),
        ],
        [{ id: 1, isPrimary: true }],
      ),
    ).toMatchObject({
      kind: "mirrored",
      mode: "mirrored",
      audienceDisplayId: 1,
      presenterDisplayId: null,
    });
  });

  it("uses full-screen single display mode for clamshell or external-only setups", () => {
    expect(
      classifyDisplaySetup(
        [
          display({ isAsleep: true }),
          display({ id: 5, isBuiltin: false, isMain: true }),
        ],
        [{ id: 5, isPrimary: true }],
      ),
    ).toMatchObject({
      kind: "external-only",
      mode: "single-screen",
      audienceDisplayId: 5,
      presenterDisplayId: null,
    });
  });

  it("prefers a non-main external display and then the lowest id", () => {
    expect(
      classifyDisplaySetup(
        [
          display({}),
          display({ id: 9, isBuiltin: false, isMain: true }),
          display({ id: 6, isBuiltin: false, isMain: false }),
          display({ id: 3, isBuiltin: false, isMain: false }),
        ],
        [
          { id: 1, isPrimary: true },
          { id: 3, isPrimary: false },
          { id: 6, isPrimary: false },
          { id: 9, isPrimary: false },
        ],
      ).audienceDisplayId,
    ).toBe(3);
  });

  it("falls back to Electron displays with a warning", () => {
    expect(
      fallbackDisplaySetup([
        { id: 1, isPrimary: true },
        { id: 2, isPrimary: false },
      ]),
    ).toMatchObject({
      kind: "fallback",
      mode: "dual-screen",
      audienceDisplayId: 2,
      presenterDisplayId: 1,
      warning: expect.any(String),
    });
  });
});
