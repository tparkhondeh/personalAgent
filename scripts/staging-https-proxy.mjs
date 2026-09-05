import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { request } from "node:http";

const listenHost = process.env.STAGING_LISTEN_HOST || "0.0.0.0";
const listenPort = Number(process.env.STAGING_LISTEN_PORT || 8443);
const targetHost = process.env.STAGING_TARGET_HOST || "127.0.0.1";
const targetPort = Number(process.env.STAGING_TARGET_PORT || 3010);
const keyPath = process.env.STAGING_TLS_KEY;
const certPath = process.env.STAGING_TLS_CERT;

if (!keyPath || !certPath) throw new Error("STAGING_TLS_KEY and STAGING_TLS_CERT are required.");

const server = createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath), minVersion: "TLSv1.2" },
  (incoming, outgoing) => {
    const forwarded = request({
      hostname: targetHost,
      port: targetPort,
      method: incoming.method,
      path: incoming.url,
      headers: {
        ...incoming.headers,
        "x-forwarded-for": incoming.socket.remoteAddress || "",
        "x-forwarded-host": incoming.headers.host || "",
        "x-forwarded-proto": "https",
      },
    }, (response) => {
      outgoing.writeHead(response.statusCode || 502, response.headers);
      response.pipe(outgoing);
    });
    forwarded.setTimeout(20_000, () => forwarded.destroy(new Error("Staging upstream timed out.")));
    forwarded.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      outgoing.end('{"status":"unavailable"}');
    });
    incoming.pipe(forwarded);
  },
);

server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
server.listen(listenPort, listenHost, () => {
  process.stdout.write(`Stable staging HTTPS proxy listening on ${listenHost}:${listenPort}, target ${targetHost}:${targetPort}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
