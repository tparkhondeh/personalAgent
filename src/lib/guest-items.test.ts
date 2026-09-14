import { describe, expect, it } from "vitest";
import { readGuestItems, saveGuestItems, type GuestItem } from "./guest-items";
const item: GuestItem = { id:"existing",title:"اطلاعات قبلی",category:"personal",priority:"normal",source:"task",done:false };
function storage(initial: string | null) {
  let value=initial;
  return {getItem:()=>value,setItem:(_key:string,next:string)=>{value=next;}};
}
describe("empty start without destroying guest data",()=>{
  it("has no sample records on a fresh start",()=>expect(readGuestItems(storage(null))).toEqual({ok:true,items:[]}));
  it("retains existing records including completed statistics and unknown legacy fields",()=>{
    const old=[{...item,done:true,legacy:"preserve"}]; const store=storage(JSON.stringify(old));
    const loaded=readGuestItems(store);expect(loaded.items).toEqual(old);expect(saveGuestItems(store,loaded.items)).toBe(true);
    expect(JSON.parse(store.getItem()!)).toEqual(old);
  });
  it.each(['{broken','null','{}','[{"id":"incomplete"}]'])("preserves unreadable content %s",raw=>{
    const store=storage(raw);expect(readGuestItems(store).ok).toBe(false);expect(saveGuestItems(store,[])).toBe(false);expect(store.getItem()).toBe(raw);
  });
  it("does not overwrite data when storage becomes corrupt after a successful read",()=>{
    const store=storage(JSON.stringify([item]));expect(readGuestItems(store).ok).toBe(true);
    store.setItem("hamrah.items.v2","broken");expect(saveGuestItems(store,[item])).toBe(false);expect(store.getItem()).toBe("broken");
  });
  it("reports denied reads and quota errors without a destructive fallback",()=>{
    expect(readGuestItems({getItem:()=>{throw Error("denied")}}).ok).toBe(false);
    const raw=JSON.stringify([item]);const store={getItem:()=>raw,setItem:()=>{throw Error("quota")}};
    expect(saveGuestItems(store,[])).toBe(false);expect(store.getItem()).toBe(raw);
  });
  it("persists completion without deleting statistics and supports reload",()=>{
    const store=storage(JSON.stringify([item]));expect(saveGuestItems(store,[{...item,done:true}])).toBe(true);
    expect(readGuestItems(store).items).toEqual([{...item,done:true}]);
  });
});
