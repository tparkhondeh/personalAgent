// Offline-only preparation. No key generation, upload, retention deletion or live restore.
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";

const magic = Buffer.from("TIABKP01");
const limit = 64 * 1024 * 1024;
const derive = promisify(scrypt);
const digest = data => createHash("sha256").update(data).digest("hex");
function validSecret(secret) {
  if (!Buffer.isBuffer(secret) || secret.length < 20 || secret.length > 1024) throw Error("A separately approved private passphrase file (20–1024 bytes) is required.");
}
async function deriveKey(secret, salt) {
  validSecret(secret);
  return derive(secret, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
export async function sealBackup(data, secret) {
  if (!Buffer.isBuffer(data) || !data.length || data.length > limit) throw Error("Backup size is outside the supported bound.");
  const salt = randomBytes(32), nonce = randomBytes(12);
  const header = Buffer.concat([magic, salt, nonce]);
  const key = await deriveKey(secret, salt);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
    cipher.setAAD(header);
    return Buffer.concat([header, cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  } finally { key.fill(0); }
}
export async function openBackup(envelope, secret) {
  if (!Buffer.isBuffer(envelope) || envelope.length < 69 || envelope.length > limit + 68 || !envelope.subarray(0, 8).equals(magic)) throw Error("Invalid backup format or size.");
  const key = await deriveKey(secret, envelope.subarray(8, 40));
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(40, 52), { authTagLength: 16 });
    decipher.setAAD(envelope.subarray(0, 52));
    decipher.setAuthTag(envelope.subarray(-16));
    return Buffer.concat([decipher.update(envelope.subarray(52, -16)), decipher.final()]);
  } catch { throw Error("Backup verification failed; wrong passphrase or damaged file. Nothing restored."); }
  finally { key.fill(0); }
}
async function inside(root, target) {
  const actualRoot = await realpath(root), actual = await realpath(target);
  const relative = path.relative(actualRoot, actual);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw Error("Input must be an existing snapshot inside the documented backup directory.");
  return actual;
}
async function boundedRead(file, maximum) {
  const info = await stat(file);
  if (!info.isFile() || info.size > maximum) throw Error("Unsupported input file or size.");
  const bytes = await readFile(file);
  if (bytes.length > maximum) throw Error("Input changed beyond the supported size.");
  return bytes;
}
async function verifyDatabase(file) {
  const client = createClient({ url: pathToFileURL(file).href });
  try {
    await client.execute("PRAGMA query_only=ON");
    const rows = (await client.execute("PRAGMA integrity_check")).rows;
    if (rows.length !== 1 || rows[0].integrity_check !== "ok" || (await client.execute("PRAGMA foreign_key_check")).rows.length) throw Error("Restored database failed verification.");
  } finally { client.close(); }
}
export async function runPrivateBackup(mode, sourceFile, secretFile) {
  if (!["seal", "restore"].includes(mode) || !sourceFile || !secretFile) throw Error("Use seal|restore with an explicit backup file and TIA_BACKUP_PASSPHRASE_FILE. Never pass a secret on the command line.");
  const root = path.resolve("backups/local");
  const encryptedRoot = path.resolve("backups/offhost-ready");
  const source = await inside(mode === "seal" ? root : encryptedRoot, sourceFile);
  const secretPath = await realpath(secretFile);
  const secretRelative = path.relative(await realpath("."), secretPath);
  if (!secretRelative.startsWith("..") && !path.isAbsolute(secretRelative)) throw Error("Keep the approved passphrase outside the repository and backups.");
  const secret = await boundedRead(secretPath, 1024);
  try {
    validSecret(secret);
    if (mode === "seal") {
      if (!source.endsWith(".db")) throw Error("A verified SQLite snapshot is required.");
      const metadata = JSON.parse(await readFile(`${source}.json`, "utf8"));
      if (metadata.integrity !== "ok") throw Error("Missing snapshot verification.");
      await verifyDatabase(source);
      const data = await boundedRead(source, limit);
      const envelope = await sealBackup(data, secret);
      if (!(await openBackup(envelope, secret)).equals(data)) throw Error("Backup round-trip failed.");
      await mkdir(encryptedRoot, { recursive: true, mode: 0o700 });
      const dir = await mkdtemp(path.join(encryptedRoot, "tia-"));
      const output = path.join(dir, "snapshot.tiabackup");
      await writeFile(output, envelope, { flag: "wx", mode: 0o600 });
      const written = await boundedRead(output, limit + 68);
      if (!(await openBackup(written, secret)).equals(data)) throw Error("Written backup failed verification.");
      return { mode, output, sha256: digest(written), verified: true, uploaded: false, operationalKeyCreated: false };
    }
    const data = await openBackup(await boundedRead(source, limit + 68), secret);
    if (!data.subarray(0, 16).equals(Buffer.from("SQLite format 3\0"))) throw Error("Not a SQLite backup.");
    await mkdir(root, { recursive: true, mode: 0o700 });
    const dir = await mkdtemp(path.join(root, "private-restore-"));
    const output = path.join(dir, "restored.db");
    await writeFile(output, data, { flag: "wx", mode: 0o600 });
    await verifyDatabase(output);
    if (digest(await boundedRead(output, limit)) !== digest(data)) throw Error("Restored bytes changed.");
    await writeFile(`${output}.json`, JSON.stringify({ integrity: "ok", encrypted: false, createdAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
    return { mode, output, sha256: digest(data), verified: true, liveDatabaseChanged: false, schedulersStarted: false };
  } finally { secret.fill(0); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runPrivateBackup(process.argv[2], process.argv[3], process.env.TIA_BACKUP_PASSPHRASE_FILE))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
