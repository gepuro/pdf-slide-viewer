const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const html = readFileSync(join(process.cwd(), "dist/index.html"), "utf8");
const absoluteAssetPath = /(?:src|href)="\/assets\//;

if (absoluteAssetPath.test(html)) {
  throw new Error("Renderer build contains absolute asset paths and will fail under file://.");
}

if (!html.includes("./assets/")) {
  throw new Error("Renderer build does not reference relative assets.");
}

console.log("Renderer asset paths are compatible with file://.");
