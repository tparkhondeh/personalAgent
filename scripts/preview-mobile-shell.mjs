import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const files = new Set(["index.html", "connection-error.html", "app.css", "theme.css", "app.js", "domain.js", "planner.js", "input-controls.js", "content.js", "Vazirmatn.woff2"]);
const types = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", woff2: "font/woff2" };
const root = new URL("../mobile-shell/", import.meta.url);
createServer(async (request, response) => {
  const name = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
  if (!files.has(name)) { response.writeHead(404).end(); return; }
  try {
    response.writeHead(200, { "Content-Type": types[name.split(".").at(-1)], "Cache-Control": "no-store" });
    response.end(await readFile(fileURLToPath(new URL(name, root))));
  } catch { response.writeHead(500).end("Preview asset unavailable"); }
}).listen(3012, "127.0.0.1", () => console.log("Bundled mobile preview: http://localhost:3012"));
