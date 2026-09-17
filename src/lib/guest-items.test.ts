import { afterEach, describe, expect, it, vi } from "vitest";
import { guestItemsLockName, readGuestItems, saveGuestItems, type GuestItem } from "./guest-items";
const item: GuestItem = { id:"existing",title:"اطلاعات قبلی",category:"personal",priority:"normal",source:"task",done:false };
function storage(initial: string | null) {
  let value=initial;
  return {getItem:()=>value,setItem:vi.fn((_key:string,next:string)=>{value=next;})};
}
function snapshot(store: Pick<Storage, "getItem">) {
  const value = readGuestItems(store);
  return value.ok ? value.snapshot : undefined;
}
// Models an origin-wide exclusive Web Lock, including ifAvailable contention.
function lockManager() {
  let held = false;
  const request = vi.fn(async (name: string, _options: LockOptions, callback: LockGrantedCallback<unknown>) => {
    if (held) return callback(null);
    held = true;
    try { await Promise.resolve(); return await callback({ name, mode: "exclusive" }); }
    finally { held = false; }
  });
  return { request } as unknown as Pick<LockManager, "request">;
}
afterEach(() => vi.unstubAllGlobals());
describe("empty start without destroying guest data",()=>{
  it("has no sample records on a fresh start",()=>expect(readGuestItems(storage(null))).toEqual({ok:true,items:[],snapshot:null}));
  it("retains existing records including completed statistics and unknown legacy fields",async()=>{
    const old=[{...item,done:true,legacy:"preserve"}]; const store=storage(JSON.stringify(old));
    const loaded=readGuestItems(store);expect(loaded.items).toEqual(old);expect(await saveGuestItems(store,loaded.items,snapshot(store),lockManager())).toMatchObject({ok:true});
    expect(JSON.parse(store.getItem()!)).toEqual(old);
  });
  it.each(['{broken','null','{}','[{"id":"incomplete"}]'])("preserves unreadable content %s",async raw=>{
    const store=storage(raw);expect(readGuestItems(store).ok).toBe(false);expect(await saveGuestItems(store,[],raw,lockManager())).toEqual({ok:false,reason:"storage"});expect(store.getItem()).toBe(raw);expect(store.setItem).not.toHaveBeenCalled();
  });
  it("does not overwrite data when storage becomes corrupt after a successful read",async()=>{
    const store=storage(JSON.stringify([item])), observed=snapshot(store);expect(readGuestItems(store).ok).toBe(true);
    store.setItem("hamrah.items.v2","broken");expect(await saveGuestItems(store,[item],observed,lockManager())).toEqual({ok:false,reason:"storage"});expect(store.getItem()).toBe("broken");
  });
  it("reports denied reads and quota errors without a destructive fallback",async()=>{
    expect(readGuestItems({getItem:()=>{throw Error("denied")}}).ok).toBe(false);
    const raw=JSON.stringify([item]);const store={getItem:()=>raw,setItem:()=>{throw Error("quota")}};
    expect(await saveGuestItems(store,[],raw,lockManager())).toEqual({ok:false,reason:"storage"});expect(store.getItem()).toBe(raw);
  });
  it("persists completion without deleting statistics and supports reload",async()=>{
    const store=storage(JSON.stringify([item]));expect(await saveGuestItems(store,[{...item,done:true}],snapshot(store),lockManager())).toMatchObject({ok:true});
    expect(readGuestItems(store).items).toEqual([{...item,done:true}]);
  });
});

describe("guest writes across tabs", () => {
  it.each(["create", "complete", "delete"])("rejects a stale %s without losing another tab's record", async operation => {
    const store = storage(JSON.stringify([item])), locks = lockManager();
    const observed = snapshot(store), tabB = readGuestItems(store).items;
    await saveGuestItems(store, [...tabB, { ...item, id: "other-tab" }], observed, locks);
    const next = operation === "create" ? [...tabB, { ...item, id: "new" }] : operation === "delete" ? [] : tabB.map(value => ({ ...value, done: true }));
    expect(await saveGuestItems(store, next, observed, locks)).toEqual({ ok: false, reason: "conflict" });
    expect(readGuestItems(store).items).toEqual([item, { ...item, id: "other-tab" }]);
    expect(store.setItem).toHaveBeenCalledTimes(1);
  });
  it("serializes competing writes with a real-lock contract, then rejects the stale retry", async () => {
    const store = storage(null), locks = lockManager();
    const first = saveGuestItems(store, [item], null, locks);
    const second = saveGuestItems(store, [{ ...item, id: "second" }], null, locks);
    expect(await second).toEqual({ ok: false, reason: "busy" });
    expect(await first).toMatchObject({ ok: true });
    expect(await saveGuestItems(store, [{ ...item, id: "second" }], null, locks)).toEqual({ ok: false, reason: "conflict" });
    expect(readGuestItems(store).items).toEqual([item]);
    expect(locks.request).toHaveBeenCalledWith(guestItemsLockName, { mode: "exclusive", ifAvailable: true }, expect.any(Function));
    const current = readGuestItems(store);
    expect(await saveGuestItems(store, [...current.items, { ...item, id: "second" }], snapshot(store), locks)).toMatchObject({ ok: true });
    expect(readGuestItems(store).items.map(value => value.id)).toEqual(["existing", "second"]);
  });
  it("cannot resurrect a completion or deletion made by another tab", async () => {
    const store = storage(JSON.stringify([item])), before = snapshot(store), locks = lockManager();
    await saveGuestItems(store, [{ ...item, done: true }], before, locks);
    expect(await saveGuestItems(store, [item], before, locks)).toMatchObject({ ok: false, reason: "conflict" });
    await saveGuestItems(store, [], snapshot(store), locks);
    expect(await saveGuestItems(store, [item], before, locks)).toMatchObject({ ok: false, reason: "conflict" });
    expect(readGuestItems(store).items).toEqual([]);
  });
  it("refuses writing without a snapshot, lock support or permission", async () => {
    const store = storage(null);
    vi.stubGlobal("navigator", {});
    expect(await saveGuestItems(store, [item], null)).toEqual({ ok: false, reason: "unavailable" });
    expect(await saveGuestItems(store, [item], undefined, lockManager())).toEqual({ ok: false, reason: "storage" });
    const denied = { request: vi.fn(async () => { throw Error("denied"); }) } as unknown as Pick<LockManager, "request">;
    expect(await saveGuestItems(store, [item], null, denied)).toEqual({ ok: false, reason: "storage" });
    expect(store.getItem()).toBeNull(); expect(store.setItem).not.toHaveBeenCalled();
  });
});
