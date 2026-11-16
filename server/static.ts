import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

// Serves the built frontend (`bun run build`) when the API runs in production,
// so one process and one port serve the whole app.

const DIST = resolve(process.env.STATIC_DIR ?? join(import.meta.dir, "..", "dist"));

export const staticEnabled = process.env.NODE_ENV === "production" && existsSync(join(DIST, "index.html"));

// The app is a single-page app that talks only to its own /api and to the
// wallet and chain RPC endpoints, so scripts are limited to our own files.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https: wss:",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

// Text files are compressed once and kept in memory (the whole build is a few MB).
const COMPRESSIBLE = /\.(js|css|html|svg|json|txt|map)$/;
const gzipCache = new Map<string, { mtimeMs: number; body: Uint8Array }>();

function gzipped(path: string, mtimeMs: number): Uint8Array {
  const hit = gzipCache.get(path);
  if (hit && hit.mtimeMs === mtimeMs) return hit.body;
  const body = Bun.gzipSync(readFileSync(path));
  gzipCache.set(path, { mtimeMs, body });
  return body;
}

function fileResponse(path: string, headers: Record<string, string>, acceptEncoding: string | null, contentType?: string): Response {
  const info = statSync(path);
  if (acceptEncoding?.includes("gzip") && COMPRESSIBLE.test(path) && info.size > 1024) {
    const type = contentType ?? Bun.file(path).type;
    return new Response(gzipped(path, info.mtimeMs), { headers: { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding", "Content-Type": type } });
  }
  return new Response(Bun.file(path), { headers: { ...headers, ...(contentType ? { "Content-Type": contentType } : {}) } });
}

export function serveStatic(pathname: string, acceptEncoding: string | null = null): Response {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const target = resolve(join(DIST, decoded));
  // Never leave the build folder, whatever the URL says.
  const inside = target === DIST || target.startsWith(DIST + sep);
  const isFile = inside && existsSync(target) && statSync(target).isFile();

  if (isFile) {
    const immutable = decoded.startsWith("/assets/");
    return fileResponse(target, { ...BASE_HEADERS, "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" }, acceptEncoding);
  }

  // A missing file with an extension is a real 404; anything else is an app route.
  if (/\.[a-zA-Z0-9]{1,8}$/.test(decoded)) return new Response("Not found", { status: 404, headers: BASE_HEADERS });

  return fileResponse(join(DIST, "index.html"), { ...BASE_HEADERS, "Content-Security-Policy": CSP, "Cache-Control": "no-cache" }, acceptEncoding, "text/html; charset=utf-8");
}
