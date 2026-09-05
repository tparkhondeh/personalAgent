import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageName = process.argv[2];
const outputPath = resolve(process.argv[3] || "artifacts/android/webview.json");
const requiredText = process.argv[4] || "همراه";
const action = process.argv[5] || "";

if (!packageName) throw new Error("Android package name is required.");

const adb = (...args) => execFileSync("adb", args, { encoding: "utf8" }).trim();
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function inspect() {
  const pid = adb("shell", "pidof", packageName).replace(/\r/g, "").split(/\s+/)[0];
  if (!pid) throw new Error(`No running process found for ${packageName}`);

  // A fresh CI emulator has no previous forward yet. Removing a missing
  // listener returns exit code 1, which is harmless and must not fail QA.
  try {
    adb("forward", "--remove", "tcp:9222");
  } catch {}
  adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);

  let targets = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      targets = await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json());
      if (targets.some((target) => target.webSocketDebuggerUrl)) break;
    } catch {}
    await delay(1_000);
  }

  const target = targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl) || targets.find((entry) => entry.webSocketDebuggerUrl);
  if (!target) throw new Error("No debuggable Android WebView target was found.");
  process.stdout.write(`WebView target: ${target.title || "(untitled)"} ${target.url || "(no URL)"}\n`);

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  const snapshotExpression = `JSON.stringify({title:document.title,url:location.href,text:document.body?document.body.innerText:"",direction:document.documentElement.dir})`;
  let requestId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    resolver(message);
  });
  const evaluate = (expression = snapshotExpression) => new Promise((resolveResponse, rejectResponse) => {
    requestId += 1;
    const currentId = requestId;
    const timeout = setTimeout(() => {
      pending.delete(currentId);
      rejectResponse(new Error("WebView evaluation timed out."));
    }, 5_000);
    pending.set(currentId, (message) => {
      clearTimeout(timeout);
      resolveResponse(message);
    });
    socket.send(JSON.stringify({ id: currentId, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
  });

  let lastCandidate = null;
  const waitForText = async (text) => {
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const response = await evaluate();
      const serialized = response?.result?.result?.value;
      if (serialized) {
        const candidate = JSON.parse(serialized);
        lastCandidate = candidate;
        if (candidate.text?.trim() && candidate.text.includes(text)) return candidate;
        if (attempt === 0 || attempt % 10 === 9) {
          process.stdout.write(`Rendered candidate ${attempt + 1}: ${JSON.stringify({
            title: candidate.title,
            url: candidate.url,
            direction: candidate.direction,
            text: candidate.text?.slice(0, 300),
          })}\n`);
        }
      }
      await delay(1_000);
    }
    return null;
  };

  if (action === "open-offline") {
    const recovery = await waitForText("اتصال برقرار نشد");
    if (!recovery) throw new Error("The Persian recovery page was not ready for offline fallback.");
    const actionResponse = await evaluate(`(() => {
      const button = document.querySelector("#offline");
      if (!button) throw new Error("Offline recovery button was not found.");
      button.click();
      return { clicked: true, bridge: typeof window.HamrahRecovery, url: location.href };
    })()`);
    if (actionResponse?.result?.exceptionDetails) {
      throw new Error(`Clicking the offline recovery button failed: ${JSON.stringify(actionResponse.result.exceptionDetails)}`);
    }
    process.stdout.write(`Offline action: ${JSON.stringify(actionResponse?.result?.result?.value)}\n`);
    await delay(1_500);
  }

  const result = await waitForText(requiredText);
  socket.close();

  if (!result) {
    throw new Error(`Expected Persian text was not rendered within the timeout: ${requiredText}. Last page: ${JSON.stringify(lastCandidate)}`);
  }
  if (result.direction !== "rtl") throw new Error("Android WebView document is not RTL.");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({ ...result, packageName, pid }, null, 2)}\n`, "utf8");
  process.stdout.write(`${result.title}\n${result.url}\n${result.text.slice(0, 500)}\n`);
}

await inspect();
