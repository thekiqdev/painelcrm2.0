import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const distLanding = path.join(root, "dist-landing");
const landingHtml = path.join(distLanding, "landing.html");

if (!fs.existsSync(landingHtml)) {
  console.error("[merge-landing-dist] Falta dist-landing/landing.html. Rode npm run build:landing antes do merge.");
  process.exit(1);
}

if (!fs.existsSync(dist)) {
  console.error("[merge-landing-dist] Falta dist/. Rode o build do CRM antes do merge.");
  process.exit(1);
}

fs.copyFileSync(landingHtml, path.join(dist, "landing.html"));

const assetsSrc = path.join(distLanding, "assets");
if (fs.existsSync(assetsSrc)) {
  const assetsDest = path.join(dist, "assets");
  fs.mkdirSync(assetsDest, { recursive: true });
  for (const name of fs.readdirSync(assetsSrc)) {
    fs.copyFileSync(path.join(assetsSrc, name), path.join(assetsDest, name));
  }
}

console.log("[merge-landing-dist] landing.html e assets da landing copiados para dist/.");
