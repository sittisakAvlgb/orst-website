#!/usr/bin/env node
/**
 * Local preview server (no dependencies). Unlike `python -m http.server` it sends
 * Cache-Control: no-cache, so browsers always revalidate pages after a rebuild instead of
 * showing a stale copy. Usage: node scripts/serve.mjs [port]
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 5187;
const HOST = "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const target = path.normalize(path.join(ROOT, decoded));
  // Refuse anything that escapes the project folder.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      const index = path.join(target, "index.html");
      return (await stat(index)).isFile() ? index : null;
    }
    return info.isFile() ? target : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  const url = new URL(request.url, `http://${HOST}`);
  // Directory URLs without a trailing slash would break relative links; redirect them.
  const file = await resolveFile(url.pathname);
  if (file && file.endsWith(`${path.sep}index.html`) && !url.pathname.endsWith("/") && !url.pathname.endsWith(".html")) {
    response.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
    return;
  }

  const found = file ?? (await resolveFile("/th/404.html"));
  // A rebuild wipes and rewrites th/ and en/, so for a moment even the 404 page is missing.
  if (!found) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    response.end("Not found (the site may be rebuilding — reload in a moment).");
    return;
  }
  const status = file ? 200 : 404;
  const headers = {
    "Content-Type": TYPES[path.extname(found).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  };

  response.writeHead(status, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(found).pipe(response);
});

server.listen(PORT, HOST, () => {
  console.log(`ORST preview: http://${HOST}:${PORT}/th/`);
});
