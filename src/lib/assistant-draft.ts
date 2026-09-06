const prefix = "hamrah-compose-v1:";
const handoff = "hamrah-compose-handoff-v1";
const lifetime = 30 * 60 * 1000;
export function saveComposeDraft(owner: string, text: string, storage: Storage = sessionStorage) {
  try { storage.setItem(prefix + owner, JSON.stringify({ text: text.slice(0, 2000), expires: Date.now() + lifetime })); } catch { /* Memory input remains usable. */ }
}
export function readComposeDraft(owner: string, storage: Storage = sessionStorage): string {
  try { const value = JSON.parse(storage.getItem(prefix + owner) || "null"); return typeof value?.text === "string" && value.expires > Date.now() ? value.text.slice(0, 2000) : ""; } catch { return ""; }
}
export function offerGuestDraft(storage: Storage = sessionStorage) {
  try { storage.setItem(handoff, String(Date.now() + lifetime)); } catch { /* No persistent storage required. */ }
}
export function claimGuestDraft(storage: Storage = sessionStorage): string {
  try { const expires = Number(storage.getItem(handoff)); storage.removeItem(handoff); return expires > Date.now() ? readComposeDraft("guest", storage) : ""; } catch { return ""; }
}
