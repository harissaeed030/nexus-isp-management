import { cp, mkdir, rm } from "node:fs/promises";

const root = process.cwd();
const target = new URL("../www/", import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const name of ["index.html", "manifest.webmanifest", "sw.js"]) {
  await cp(new URL("../" + name, import.meta.url), new URL(name, target));
}
await cp(new URL("../assets", import.meta.url), new URL("assets", target), { recursive: true });
console.log("Bundled NEXUS HTML, CSS, JavaScript, manifest and icons into www/ for offline Android use.");
