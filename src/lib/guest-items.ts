// Guest storage is independent of authenticated server data. Never repair it by wiping.
export type GuestItem = { id: string; title: string; category: "personal" | "work" | "meeting"; priority: "urgent" | "important" | "normal"; source: "task" | "meeting"; startsAt?: string; endsAt?: string; timezone?: string; dueAt?: string; done: boolean };
type Store = Pick<Storage, "getItem" | "setItem">;
const key = "hamrah.items.v2";
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
export function readGuestItems(store: Pick<Store, "getItem">): { ok: boolean; items: GuestItem[] } {
  try {
    const raw = store.getItem(key);
    if (raw === null) return { ok: true, items: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isItem)) return { ok: false, items: [] };
    return { ok: true, items: parsed };
  } catch { return { ok: false, items: [] }; }
}
export function saveGuestItems(store: Store, items: GuestItem[]): boolean {
  // Recheck before writing: corruption/access failure after hydration must also be preserved.
  if (!items.every(isItem) || !readGuestItems(store).ok) return false;
  try { store.setItem(key, JSON.stringify(items)); return true; } catch { return false; }
}
