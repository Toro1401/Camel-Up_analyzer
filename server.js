#!/usr/bin/env node

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { analyze } = require("./camel-up-analyzer");

const PUBLIC_DIRECTORY = path.join(__dirname, "public");
const SAMPLE_PATH = path.join(__dirname, "sample-state.json");
const MAX_BODY_BYTES = 1_000_000;
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("The request body is not valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function serveStatic(requestPath, response) {
  const pathname = requestPath === "/" ? "/index.html" : requestPath;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }
  const filePath = path.resolve(PUBLIC_DIRECTORY, `.${decodedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIRECTORY}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(data);
  });
}

function createServer() {
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://localhost");

    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/sample-state") {
      try {
        sendJson(response, 200, JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf8")));
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/analyze") {
      try {
        const state = await readJsonBody(request);
        sendJson(response, 200, analyze(state));
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    serveStatic(requestUrl.pathname, response);
  });
}

function openLocalUrl(url) {
  const command = process.platform === "win32" ? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const argumentsList = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, argumentsList, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {
    console.log(`Open this address in a browser: ${url}`);
  });
  child.unref();
}

function startServer(
  port = Number(process.env.PORT) || (process.pkg ? 0 : 4173),
  options = {},
) {
  const server = createServer();
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}`;
    console.log(`Camel Up analyzer: ${url}`);
    console.log("Press Ctrl+C to stop.");
    const shouldOpenBrowser = options.openBrowser ?? (Boolean(process.pkg) || process.argv.includes("--open"));
    if (shouldOpenBrowser && !process.argv.includes("--no-open")) {
      openLocalUrl(url);
    }
  });
  server.on("error", (error) => {
    console.error(`Could not start the Camel Up analyzer: ${error.message}`);
    process.exitCode = 1;
  });
  return server;
}

if (require.main === module) startServer();

module.exports = { createServer, startServer };
