import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const maplibreDist = new URL("../node_modules/maplibre-gl/dist/", import.meta.url);
const publicDirectory = new URL("../public/maplibre/", import.meta.url);
const assets = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(publicDirectory, { recursive: true });
await Promise.all(
  assets.map((asset) => copyFile(new URL(asset, maplibreDist), new URL(asset, publicDirectory))),
);

console.log(`Synced MapLibre worker assets to ${fileURLToPath(publicDirectory)}`);
