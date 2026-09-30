/**
 * Copies the built site into _site/ for hosting (Netlify, GitHub Pages or any static host): the pages, the bundled CSS/JS, the
 * page scripts and the images the pages use. Source files, READMEs and original PNGs that already have a lighter
 * .webp/.jpg twin are left out. Run after `node scripts/build.mjs`, or use `npm run package` which does both.
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "_site");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of ["index.html", "robots.txt", "sitemap.xml", "th", "en"]) {
  const from = path.join(root, name);
  if (existsSync(from)) await cp(from, path.join(out, name), { recursive: true });
}

// A site-wide "not found" page for the host.
await copyFile(path.join(root, "th", "404.html"), path.join(out, "404.html"));

/** Copies assets/, skipping READMEs, the unbundled CSS and PNG originals that have a lighter twin. */
async function copyAssets(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name);
    const rel = path.relative(root, from);
    if (entry.isDirectory()) {
      if (rel === path.join("assets", "css")) continue;
      await copyAssets(from);
      continue;
    }
    if (/^readme\.md$/i.test(entry.name)) continue;
    if (/\.png$/i.test(entry.name)) {
      const base = from.slice(0, -4);
      if ([".webp", ".jpg", ".jpeg"].some((ext) => existsSync(base + ext))) continue;
    }
    await mkdir(path.join(out, path.dirname(rel)), { recursive: true });
    await copyFile(from, path.join(out, rel));
  }
}
await copyAssets(path.join(root, "assets"));

// While the site is a prototype (demoData on), ask search engines to stay away. Netlify reads the X-Robots-Tag in
// _headers; GitHub Pages ignores _headers, so robots.txt says it too, and .nojekyll serves every file as it is.
const config = JSON.parse(await readFile(path.join(root, "src", "site.config.json"), "utf8"));
if (config.demoData) await writeFile(path.join(out, "robots.txt"), "User-agent: *\nDisallow: /\n");
await writeFile(path.join(out, ".nojekyll"), "");

// Caching and security headers (Netlify).
await writeFile(
  path.join(out, "_headers"),
  `/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=86400
`,
);

let files = 0;
let bytes = 0;
async function measure(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await measure(p);
    else {
      files += 1;
      bytes += (await stat(p)).size;
    }
  }
}
await measure(out);
console.log(`_site/ ready: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
