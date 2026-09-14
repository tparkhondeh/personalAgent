// Opt-in, loopback-only synthetic fault harness. No account, key or real storage.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const root = new URL("../mobile-shell/", import.meta.url);
const files = new Set(["index.html", "appearance.js", "voice-capture.js", "app.css", "theme.css", "app.js", "storage.js", "domain.js", "planner.js", "input-controls.js", "content.js", "Vazirmatn.woff2"]);
const scenarios = new Set(["fresh", "existing", "corrupt", "denied", "quota"]);
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const file = url.pathname.slice(1) || "index.html";
  if (!files.has(file) || req.method !== "GET") { res.writeHead(404).end(); return; }
  try {
    let content = await readFile(new URL(file, root));
    if (file === "index.html") {
      const mode = url.searchParams.get("scenario") || "fresh";
      if (!scenarios.has(mode)) { res.writeHead(400).end(); return; }
      const fixture = [{ id: "synthetic-storage-test", title: "کار ساختگی آزمون حافظه", category: "personal", priority: "normal", done: false }];
      const initial = mode === "fresh" ? null : mode === "corrupt" ? "corrupt synthetic fixture" : JSON.stringify(fixture);
      const harness = `<script>(()=>{const mode=${JSON.stringify(mode)},key="hamrah-local-v2";const values=new Map();const initial=${JSON.stringify(initial)};if(initial!==null)values.set(key,initial);let writes=0;const display=()=>{const el=document.querySelector('#fault-evidence');if(el)el.textContent='سناریوی کاملاً ساختگی: '+mode+' — نوشتن موفق: '+writes;};Object.defineProperty(window,'localStorage',{value:{getItem:k=>{if(k===key&&mode==='denied')throw new DOMException('synthetic read denied','SecurityError');return values.get(k)??null;},setItem:(k,v)=>{if(k===key&&mode==='quota')throw new DOMException('synthetic quota','QuotaExceededError');values.set(k,String(v));if(k===key)writes++;display();}}});document.addEventListener('DOMContentLoaded',display);})();</script>`;
      content = Buffer.from(content.toString().replace("<head>", "<head>" + harness).replace("<body>", '<body><p id="fault-evidence" role="status"></p>'));
    }
    const ext = file.split(".").at(-1);
    res.writeHead(200, { "Content-Type": ({ html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8", css: "text/css; charset=utf-8", woff2: "font/woff2" })[ext], "Cache-Control": "no-store" });
    res.end(content);
  } catch { res.writeHead(500).end("Synthetic preview failed"); }
}).listen(3018, "127.0.0.1", () => console.log("Synthetic storage QA only: http://127.0.0.1:3018/?scenario=quota"));
