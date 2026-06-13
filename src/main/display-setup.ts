import type { DisplaySetup } from "../shared/types.js";

export interface NativeDisplay {
  id: number;
  isBuiltin: boolean;
  isMain: boolean;
  isAsleep: boolean;
  isInMirrorSet: boolean;
  mirrorsDisplay: number | null;
}

export interface ElectronDisplaySnapshot {
  id: number;
  isPrimary: boolean;
}

export interface NativeDisplayOutput {
  displays: NativeDisplay[];
}

const detectionWarning =
  "ディスプレイの詳細情報を取得できなかったため、利用可能な画面情報で自動配置しました。";

function byId<T extends { id: number }>(left: T, right: T): number {
  return left.id - right.id;
}

function findElectronDisplay(
  id: number | null,
  displays: ElectronDisplaySnapshot[],
): ElectronDisplaySnapshot | undefined {
  if (id === null) return undefined;
  return displays.find((display) => display.id === id);
}

export function fallbackDisplaySetup(
  displays: ElectronDisplaySnapshot[],
  warning = detectionWarning,
): DisplaySetup {
  const sorted = [...displays].sort(byId);
  const primary = sorted.find((display) => display.isPrimary) ?? sorted[0];
  const audience = sorted.find((display) => !display.isPrimary);

  if (audience && primary) {
    return {
      kind: "fallback",
      mode: "dual-screen",
      audienceDisplayId: audience.id,
      presenterDisplayId: primary.id,
      warning,
    };
  }

  return {
    kind: "fallback",
    mode: "practice",
    audienceDisplayId: null,
    presenterDisplayId: primary?.id ?? null,
    warning,
  };
}

export function classifyDisplaySetup(
  nativeDisplays: NativeDisplay[],
  electronDisplays: ElectronDisplaySnapshot[],
): DisplaySetup {
  if (electronDisplays.length === 0) {
    return fallbackDisplaySetup([], "利用可能なディスプレイが見つかりません。");
  }

  const awakeDisplays = nativeDisplays.filter((display) => !display.isAsleep).sort(byId);
  if (awakeDisplays.length === 0) {
    return fallbackDisplaySetup(electronDisplays);
  }

  const mirroredDisplays = awakeDisplays.filter((display) => display.isInMirrorSet);
  if (mirroredDisplays.length > 0) {
    const mirrorSource =
      mirroredDisplays.find((display) => display.mirrorsDisplay === null) ??
      awakeDisplays.find((display) =>
        mirroredDisplays.some((candidate) => candidate.mirrorsDisplay === display.id),
      );
    const logicalDisplay =
      findElectronDisplay(mirrorSource?.id ?? null, electronDisplays) ??
      electronDisplays.find((display) => display.isPrimary) ??
      [...electronDisplays].sort(byId)[0];

    return {
      kind: "mirrored",
      mode: "mirrored",
      audienceDisplayId: logicalDisplay.id,
      presenterDisplayId: null,
      warning: null,
    };
  }

  const builtinDisplays = awakeDisplays.filter((display) => display.isBuiltin);
  const externalDisplays = awakeDisplays.filter((display) => !display.isBuiltin);

  if (builtinDisplays.length > 0 && externalDisplays.length > 0) {
    const externalCandidates = [
      ...externalDisplays.filter((display) => !display.isMain),
      ...externalDisplays.filter((display) => display.isMain),
    ];
    const nativeAudience = externalCandidates.find((display) =>
      findElectronDisplay(display.id, electronDisplays),
    );
    const audience =
      findElectronDisplay(nativeAudience?.id ?? null, electronDisplays) ??
      electronDisplays.find((display) => !display.isPrimary);
    const nativePresenter = builtinDisplays.find((display) =>
      findElectronDisplay(display.id, electronDisplays),
    );
    const presenter =
      findElectronDisplay(nativePresenter?.id ?? null, electronDisplays) ??
      electronDisplays.find((display) => display.isPrimary && display.id !== audience?.id) ??
      electronDisplays.find((display) => display.id !== audience?.id);

    if (audience && presenter) {
      return {
        kind: "extended",
        mode: "dual-screen",
        audienceDisplayId: audience.id,
        presenterDisplayId: presenter.id,
        warning: null,
      };
    }
    return fallbackDisplaySetup(electronDisplays);
  }

  if (externalDisplays.length > 0 && builtinDisplays.length === 0) {
    const nativeAudience = [
      ...externalDisplays.filter((display) => !display.isMain),
      ...externalDisplays.filter((display) => display.isMain),
    ].find((display) => findElectronDisplay(display.id, electronDisplays));
    const audience =
      findElectronDisplay(nativeAudience?.id ?? null, electronDisplays) ??
      electronDisplays.find((display) => display.isPrimary) ??
      [...electronDisplays].sort(byId)[0];

    return {
      kind: "external-only",
      mode: "single-screen",
      audienceDisplayId: audience.id,
      presenterDisplayId: null,
      warning: null,
    };
  }

  const presenter =
    builtinDisplays
      .map((display) => findElectronDisplay(display.id, electronDisplays))
      .find((display) => display !== undefined) ??
    electronDisplays.find((display) => display.isPrimary) ??
    [...electronDisplays].sort(byId)[0];

  return {
    kind: "internal-only",
    mode: "practice",
    audienceDisplayId: null,
    presenterDisplayId: presenter.id,
    warning: null,
  };
}
