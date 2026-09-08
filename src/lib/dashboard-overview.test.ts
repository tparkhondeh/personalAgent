import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createPoemNavigator, dailyPoemIndex, poemPreferenceKey, selectDashboardItems, summarizeDashboardItems, type OverviewItem } from "./dashboard-overview";

const now = new Date("2026-09-08T12:00:00Z");
const fixtures: OverviewItem[] = [
  { id:"1", category:"personal", dueAt:"2026-09-08T10:00:00Z" },
  { id:"2", category:"work", dueAt:"2026-09-08T12:00:00Z", done:true },
  { id:"1", category:"work", source:"meeting", startsAt:"2026-09-08T13:00:00Z" },
  { id:"3", category:"personal", dueAt:"2026-09-07T20:29:59Z" },
  { id:"4", category:"personal", dueAt:"2026-09-08T20:30:00Z" },
  { id:"5", category:"personal" },
  { id:"6", category:"personal", archived:true },
];
describe("shared dashboard scope", () => {
  it("counts exactly today's dated items, including completion, without duplicate meetings", () => {
    const visible = selectDashboardItems([...fixtures, fixtures[0]],"today","all",now);
    expect(visible).toHaveLength(3);
    expect(summarizeDashboardItems(visible).map(g=>[g.total,g.done])).toEqual([[3,1],[1,0],[1,1],[1,0]]);
  });
  it("keeps undated and other-day tasks in Tasks, and matches the active filter", () => {
    expect(selectDashboardItems(fixtures,"tasks")).toHaveLength(6);
    expect(summarizeDashboardItems(selectDashboardItems(fixtures,"today","work",now)).map(g=>g.total)).toEqual([1,0,1,0]);
    expect(selectDashboardItems(fixtures,"tasks","meeting")).toEqual([fixtures[2]]);
  });
  it("updates after create/edit/complete/delete without mutating stored records", () => {
    const original=structuredClone(fixtures);
    const created=[...fixtures,{id:"new",category:"company",deadline:now.toISOString()}];
    expect(summarizeDashboardItems(selectDashboardItems(created,"today","all",now))[2].total).toBe(2);
    const edited=created.map(t=>t.id==="new"?{...t,category:"personal",done:true}:t);
    expect(summarizeDashboardItems(selectDashboardItems(edited,"today","all",now))[1]).toMatchObject({total:2,done:1});
    expect(selectDashboardItems(edited.filter(t=>t.id!=="new"),"today","all",now)).toHaveLength(3);
    expect(fixtures).toEqual(original);
  });
  it("uses the same executable implementation in bundled Android", () => {
    const context={window:{}};runInNewContext(readFileSync("mobile-shell/content.js","utf8"),context);
    const api=(context.window as {HamrahOverview:{selectDashboardItems:typeof selectDashboardItems;summarizeDashboardItems:typeof summarizeDashboardItems;dailyPoemIndex:typeof dailyPoemIndex}}).HamrahOverview;
    for(const view of ["today","tasks"])for(const filter of ["all","personal","work","company","meeting"]){
      expect(api.summarizeDashboardItems(api.selectDashboardItems(fixtures,view,filter,now))).toEqual(summarizeDashboardItems(selectDashboardItems(fixtures,view,filter,now)));
    }
    expect(api.dailyPoemIndex(360,now)).toBe(dailyPoemIndex(360,now));
  });
});
describe("daily poem with a same-day manual preference", () => {
  function storage(){const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);}};}
  it("advances without immediate repeats, persists across reload and wraps at 360", () => {
    const store=storage(), clock=()=>now, nav=createPoemNavigator(360,store,clock), initial=nav.current();
    expect(nav.next()).toBe((initial+1)%360);
    expect(createPoemNavigator(360,store,clock).current()).toBe((initial+1)%360);
    for(let i=1;i<360;i++)nav.next();expect(nav.current()).toBe(initial);
  });
  it("resumes the scheduled daily poem at Tehran midnight, not 24h after a click", () => {
    const store=storage();let time=new Date("2026-09-08T20:29:59Z");const nav=createPoemNavigator(360,store,()=>time);
    nav.next();nav.next();time=new Date("2026-09-08T20:30:00Z");
    expect(nav.current()).toBe(dailyPoemIndex(360,time));
    expect(createPoemNavigator(360,store,()=>time).current()).toBe(nav.current());
  });
  it("recovers corrupt/out-of-range/stale preferences without affecting tasks", () => {
    for(const value of ["{",'null','{"day":"2026-09-08","index":999}','{"day":"2026-09-08","index":1.5}','{"day":"2026-09-07","index":1}']){
      const store=storage();store.setItem(poemPreferenceKey,value);expect(createPoemNavigator(360,store,()=>now).current()).toBe(dailyPoemIndex(360,now));
    }
  });
  it("keeps navigation usable when storage is blocked and follows normal daily rotation", () => {
    const store={getItem:()=>{throw Error("blocked");},setItem:()=>{throw Error("blocked");}};
    const nav=createPoemNavigator(360,store,()=>now), initial=nav.current();expect(nav.next()).not.toBe(initial);expect(nav.current()).toBe((initial+1)%360);
    expect(createPoemNavigator(360,undefined,()=>now).current()).toBe(dailyPoemIndex(360,now));
  });
});
