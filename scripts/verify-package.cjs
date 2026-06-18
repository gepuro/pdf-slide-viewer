const { accessSync, constants, existsSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const asar = require("@electron/asar");

const productName = "PDF Slide Viewer";
const appName = `${productName}.app`;
const distDir = join(process.cwd(), "dist");

function fail(message) {
  console.error(`Package verification failed: ${message}`);
  process.exitCode = 1;
}

function assertExists(path, label) {
  if (!existsSync(path)) {
    fail(`${label} is missing: ${path}`);
    return false;
  }
  return true;
}

function assertExecutable(path, label) {
  try {
    accessSync(path, constants.X_OK);
  } catch {
    fail(`${label} is not executable: ${path}`);
  }
}

function findPackagedApp() {
  if (!assertExists(distDir, "electron-builder output directory")) return null;

  const candidates = readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(distDir, entry.name, appName))
    .filter((path) => existsSync(path));

  const directApp = join(distDir, appName);
  if (existsSync(directApp)) candidates.unshift(directApp);

  return candidates[0] ?? null;
}

function assertAsarFile(archivePath, filePath) {
  try {
    const stat = asar.statFile(archivePath, filePath);
    if (!stat || stat.files) {
      fail(`asar entry is not a file: ${filePath}`);
    }
  } catch (error) {
    fail(`asar entry is missing: ${filePath}`);
  }
}

function verifyRendererAssets(archivePath) {
  const files = asar.listPackage(archivePath);
  const assetFiles = files.filter((file) => file.startsWith("/dist/assets/"));

  const requiredAssets = [
    [".js", "renderer JavaScript bundle"],
    [".css", "renderer CSS bundle"],
    [".mjs", "PDF.js worker bundle"],
  ];

  for (const [extension, label] of requiredAssets) {
    if (!assetFiles.some((file) => file.endsWith(extension))) {
      fail(`${label} is missing from app.asar`);
    }
  }
}

const appPath = findPackagedApp();
if (!appPath) {
  fail(`packaged app was not found under ${distDir}`);
} else {
  const appStat = statSync(appPath);
  if (!appStat.isDirectory()) {
    fail(`packaged app is not a directory: ${appPath}`);
  }

  const resourcesPath = join(appPath, "Contents", "Resources");
  const archivePath = join(resourcesPath, "app.asar");
  const displayInfoPath = join(resourcesPath, "display-info");
  const electronBinaryPath = join(appPath, "Contents", "MacOS", productName);

  assertExists(archivePath, "app.asar");
  assertExists(displayInfoPath, "display-info helper");
  assertExists(electronBinaryPath, "Electron app executable");
  assertExecutable(displayInfoPath, "display-info helper");
  assertExecutable(electronBinaryPath, "Electron app executable");

  if (existsSync(archivePath)) {
    assertAsarFile(archivePath, "package.json");
    assertAsarFile(archivePath, "dist-electron/main/index.js");
    assertAsarFile(archivePath, "dist-electron/preload/index.js");
    assertAsarFile(archivePath, "dist/index.html");
    verifyRendererAssets(archivePath);
  }
}

if (process.exitCode) {
  process.exit();
}

console.log(`Package verification passed: ${appPath}`);
