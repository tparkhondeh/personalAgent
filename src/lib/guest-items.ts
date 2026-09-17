// Guest storage is independent of authenticated server data. Never repair it by wiping.
export type GuestItem = { id: string; title: string; category: "personal" | "work" | "meeting"; priority: "urgent" | "important" | "normal"; source: "task" | "meeting"; startsAt?: string; endsAt?: string; timezone?: string; dueAt?: string; done: boolean };
type Store = Pick<Storage, "getItem" | "setItem">;
const key = "hamrah.items.v2";
export const guestItemsLockName = "tia:guest-items:hamrah.items.v2";
export type GuestItemsSnapshot = { ok: true; items: GuestItem[]; snapshot: string | null } | { ok: false; items: GuestItem[] };
export type GuestSaveResult = { ok: true; snapshot: string } | { ok: false; reason: "conflict" | "busy" | "unavailable" | "storage" };
function isItem(value: unknown): value is GuestItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.title === "string" && typeof item.done === "boolean"
    && typeof item.category === "string" && ["personal", "work", "meeting"].includes(item.category)
    && typeof item.priority === "string" && ["urgent", "important", "normal"].includes(item.priority)
    && typeof item.source === "string" && ["task", "meeting"].includes(item.source)
    && (item.timezone === undefined || typeof item.timezone === "string")
    && [item.startsAt, item.endsAt, item.dueAt].every(date => date === undefined || typeof date === "string" && Number.isFinite(Date.parse(date)));
}
export function readGuestItems(store: Pick<Store, "getItem">): GuestItemsSnapshot {
  try {
    const raw = store.getItem(key);
    if (raw === null) return { ok: true, items: [], snapshot: null };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isItem)) return { ok: false, items: [] };
    return { ok: true, items: parsed, snapshot: raw };
  } catch { return { ok: false, items: [] }; }
}
export async function saveGuestItems(store: Store, items: GuestItem[], expected: string | null | undefined, locks?: Pick<LockManager, "request">): Promise<GuestSaveResult> {
  // The snapshot check is protected by a real origin-wide lock, never a localStorage CAS.
  // Every web writer uses this lock. Old/bundled clients need the same protocol separately.
  try {
    const manager = locks ?? globalThis.navigator?.locks;
    if (!manager) return { ok: false, reason: "unavailable" };
    const encoded = JSON.stringify(items);
    if (expected === undefined || !items.every(isItem)) return { ok: false, reason: "storage" };
    return await manager.request(guestItemsLockName, { mode: "exclusive", ifAvailable: true }, (lock): GuestSaveResult => {
      if (!lock) return { ok: false, reason: "busy" };
      const current = readGuestItems(store);
      if (!current.ok) return { ok: false, reason: "storage" };
      if (current.snapshot !== expected) return { ok: false, reason: "conflict" };
      store.setItem(key, encoded);
      return { ok: true, snapshot: encoded };
    });
  } catch { return { ok: false, reason: "storage" }; }
}
