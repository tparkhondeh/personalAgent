import { describe, it, expect } from "vitest";
import { personalPoemStore, validatePersonalPoem } from "./personal-poem";
const lines = ["مصراع اول من", "مصراع دوم من", "مصراع سوم من", "مصراع چهارم من"];
function memory() { const map = new Map<string, string>(); return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } }; }
describe("device-local daily personal poems", () => {
  it("validates four complete bounded lines, preserves meaningful text", () => {
    expect(validatePersonalPoem(lines.map(s => ` ${s} `))).toEqual(lines);
    for (const invalid of [[], ["a"], [...lines.slice(0,3), ""], [...lines.slice(0,3), "a".repeat(201)], [...lines.slice(0,3), "a\nb"]]) expect(validatePersonalPoem(invalid)).toBeNull();
    expect(validatePersonalPoem(["می‌روم", "وَ", "<script>not html</script>", "۱۲۳"])).toEqual(["می‌روم", "وَ", "<script>not html</script>", "۱۲۳"]);
  });
  it("survives reopen and isolates users, guests and days", () => {
    const storage = memory(), first = personalPoemStore(storage, "account:a", "2026-09-15"); first.read(); first.save(lines);
    expect(personalPoemStore(storage, "account:a", "2026-09-15").read()?.lines).toEqual(lines);
    for (const [scope, day] of [["account:b", "2026-09-15"], ["guest", "2026-09-15"], ["account:a", "2026-09-16"]]) expect(personalPoemStore(storage, scope, day).read()).toBeNull();
  });
  it("reset retains written lines for editing, without modifying other days", () => {
    const storage = memory(), store = personalPoemStore(storage, "guest", "2026-09-15"); store.read(); store.save(lines); store.deactivate();
    expect(store.read()).toMatchObject({ active:false, lines });
    expect(storage.map.size).toBe(1);
  });
  it("fails closed on corrupt storage, quota, unavailable storage and concurrent edits", () => {
    const storage = memory(), a = personalPoemStore(storage, "guest", "2026-09-15"), b = personalPoemStore(storage, "guest", "2026-09-15");
    a.read(); b.read(); a.save(lines); expect(() => b.save(lines)).toThrow();
    const key = [...storage.map.keys()][0]; storage.map.set(key, "corrupt"); expect(() => a.read()).toThrow(); expect(() => a.save(lines)).toThrow(); expect(storage.map.get(key)).toBe("corrupt");
    const quota = personalPoemStore({getItem:()=>null,setItem:()=>{throw Error("quota");}}, "guest", "2026-09-15"); quota.read(); expect(()=>quota.save(lines)).toThrow();
    expect(()=>personalPoemStore({getItem:()=>{throw Error("denied");},setItem:()=>{}}, "guest", "2026-09-15").read()).toThrow();
  });
});
