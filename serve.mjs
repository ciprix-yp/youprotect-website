#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
]);

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function safePathname(rawUrl = "/") {
  const withoutQuery = rawUrl.split("?")[0];
  let decoded = "/";
  try {
    decoded = decodeURIComponent(withoutQuery || "/");
  } catch {
    decoded = "/";
  }
  return decoded === "/" ? "/index.html" : decoded;
}

function isInsideRoot(absPath) {
  const rel = path.relative(ROOT, absPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function resolveFile(absCandidate) {
  try {
    const st = await fsp.stat(absCandidate);
    if (st.isDirectory()) {
      const indexFile = path.join(absCandidate, "index.html");
      const indexStat = await fsp.stat(indexFile);
      return indexStat.isFile() ? indexFile : null;
    }
    return st.isFile() ? absCandidate : null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.method || (req.method !== "GET" && req.method !== "HEAD")) {
    send(res, 405, "Method Not Allowed");
    return;
  }

  const pathname = safePathname(req.url);
  const absCandidate = path.resolve(ROOT, "." + pathname);

  if (!isInsideRoot(absCandidate)) {
    send(res, 403, "Forbidden");
    return;
  }

  const absFile = await resolveFile(absCandidate);
  if (!absFile) {
    send(res, 404, "Not Found");
    return;
  }

  const ext = path.extname(absFile).toLowerCase();
  const contentType = MIME_TYPES.get(ext) || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = fs.createReadStream(absFile);
  stream.on("error", () => {
    if (!res.headersSent) send(res, 500, "Internal Server Error");
    else res.destroy();
  });
  stream.pipe(res);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.log(`[serve] Port ${PORT} already in use. Assuming active server on http://localhost:${PORT}`);
    process.exit(0);
  }
  console.error("[serve] Failed to start server:", err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`[serve] Serving "${ROOT}" on http://localhost:${PORT}`);
});
