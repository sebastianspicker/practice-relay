/**
 * Dependency-free static server for the repository's alpha browser surfaces.
 * Why: local UI checks need reproducible loopback URLs without a network install.
 */
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

/** Return the response content type for a static file path. */
export function contentTypeFor(path) {
  return CONTENT_TYPES.get(extname(path).toLowerCase()) ?? "application/octet-stream";
}

/** Parse and validate a TCP port supplied through a package script or environment. */
export function parseStaticPort(value, fallback) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid static server port: ${value ?? fallback}`);
  }
  return port;
}

/** Resolve a request path while rejecting attempts to leave the configured root. */
export function resolveStaticPath(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    throw new Error("malformed URL path");
  }
  if (decoded.includes("\0")) throw new Error("invalid URL path");
  const normalizedRequest = decoded === "/" ? "/index.html" : decoded;
  const candidate = resolve(root, `.${normalizedRequest}`);
  const relativePath = relative(resolve(root), candidate);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error("URL path leaves the static root");
  }
  return candidate;
}

async function resolveReadableFile(root, requestPath) {
  const candidate = resolveStaticPath(root, requestPath);
  const info = await stat(candidate);
  if (!info.isFile()) throw new Error("not a file");
  const [realRoot, realCandidate] = await Promise.all([
    realpath(root),
    realpath(candidate),
  ]);
  const relativePath = relative(realRoot, realCandidate);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error("resolved file leaves the static root");
  }
  return { path: realCandidate, size: info.size };
}

/** Select an allowlisted mounted root for a request, or the primary root. */
export function selectStaticRoot(primaryRoot, mounts, requestPath) {
  for (const mount of mounts ?? []) {
    if (!mount.urlPrefix.startsWith("/") || !mount.urlPrefix.endsWith("/")) {
      throw new Error(`static mount prefix must start and end with a slash: ${mount.urlPrefix}`);
    }
    if (requestPath.startsWith(mount.urlPrefix)) {
      return {
        root: mount.root,
        requestPath: `/${requestPath.slice(mount.urlPrefix.length)}`,
      };
    }
  }
  return { root: primaryRoot, requestPath };
}

/** Start a loopback static server and return it after the listener is ready. */
export async function startStaticServer(options) {
  const root = resolve(options.root);
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
    throw new Error(`static development server requires a loopback host, received ${host}`);
  }
  const port = parseStaticPort(options.port, 5173);
  const label = options.label ?? "Static application";
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed\n");
      return;
    }
    try {
      const url = new URL(request.url ?? "/", `http://${host}:${port}`);
      const selected = selectStaticRoot(root, options.mounts, url.pathname);
      const file = await resolveReadableFile(selected.root, selected.requestPath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": String(file.size),
        "Content-Type": contentTypeFor(file.path),
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(file.path).pipe(response);
    } catch {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      response.end("Not found\n");
    }
  });
  await new Promise((ready, failed) => {
    server.once("error", failed);
    server.listen(port, host, ready);
  });
  console.log(`${label}: http://${host}:${port}/`);
  return server;
}
