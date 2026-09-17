const prefix = "hamrah-compose-v1:";
const handoff = "hamrah-compose-handoff-v1";
const lifetime = 30 * 60 * 1000;
export function saveComposeDraft(owner: string, text: string, storage?: Storage) {
  try { (storage ?? sessionStorage).setItem(prefix + owner, JSON.stringify({ text: text.slice(0, 2000), expires: Date.now() + lifetime })); } catch { /* Memory input remains usable. */ }
}
export function readComposeDraft(owner: string, storage?: Storage): string {
  try { const value = JSON.parse((storage ?? sessionStorage).getItem(prefix + owner) || "null"); return typeof value?.text === "string" && value.expires > Date.now() ? value.text.slice(0, 2000) : ""; } catch { return ""; }
}
export function offerGuestDraft(storage?: Storage) {
  try { (storage ?? sessionStorage).setItem(handoff, String(Date.now() + lifetime)); } catch { /* No persistent storage required. */ }
}
export function claimGuestDraft(storage?: Storage): string {
  try { const store = storage ?? sessionStorage; const expires = Number(store.getItem(handoff)); store.removeItem(handoff); return expires > Date.now() ? readComposeDraft("guest", store) : ""; } catch { return ""; }
}
