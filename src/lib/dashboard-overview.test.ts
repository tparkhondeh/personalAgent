import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createPoemNavigator, dailyPoemIndex, poemPreferenceKey, selectDashboardScope, selectDashboardItems, summarizeDashboardItems, type OverviewItem } from "./dashboard-overview";

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
  it("shows only today's active items and keeps completed counts without duplicate meetings", () => {
    const scope = selectDashboardScope([...fixtures, fixtures[0]],"today","all",now);
    expect(selectDashboardItems(scope,"tasks")).toHaveLength(2);
    expect(summarizeDashboardItems(scope).map(g=>[g.total,g.done])).toEqual([[2,1],[1,0],[0,1],[1,0]]);
  });
  it("keeps undated and other-day tasks in Tasks, and matches the active filter", () => {
    expect(selectDashboardItems(fixtures,"tasks")).toHaveLength(5);
    expect(summarizeDashboardItems(selectDashboardScope(fixtures,"today","work",now)).map(g=>[g.total,g.done])).toEqual([[0,1],[0,0],[0,1],[0,0]]);
    expect(selectDashboardItems(fixtures,"tasks","meeting")).toEqual([fixtures[2]]);
  });
  it("updates after create/edit/complete/delete without mutating stored records", () => {
    const original=structuredClone(fixtures);
    const created=[...fixtures,{id:"new",category:"company",deadline:now.toISOString()}];
    expect(summarizeDashboardItems(selectDashboardScope(created,"today","all",now))[2].total).toBe(1);
    const edited=created.map(t=>t.id==="new"?{...t,category:"personal",done:true}:t);
    expect(summarizeDashboardItems(selectDashboardScope(edited,"today","all",now))[1]).toMatchObject({total:1,done:1});
    expect(selectDashboardItems(edited.filter(t=>t.id!=="new"),"today","all",now)).toHaveLength(2);
    expect(fixtures).toEqual(original);
  });
  it("uses the same executable implementation in bundled Android", () => {
    const context={window:{}};runInNewContext(readFileSync("mobile-shell/content.js","utf8"),context);
    const api=(context.window as {HamrahOverview:{selectDashboardScope:typeof selectDashboardScope;selectDashboardItems:typeof selectDashboardItems;summarizeDashboardItems:typeof summarizeDashboardItems;dailyPoemIndex:typeof dailyPoemIndex}}).HamrahOverview;
    for(const view of ["today","tasks"])for(const filter of ["all","personal","work","company","meeting"]){
      expect(api.selectDashboardItems(fixtures,view,filter,now)).toEqual(selectDashboardItems(fixtures,view,filter,now));
      expect(api.summarizeDashboardItems(api.selectDashboardScope(fixtures,view,filter,now))).toEqual(summarizeDashboardItems(selectDashboardScope(fixtures,view,filter,now)));
    }
    expect(api.dailyPoemIndex(360,now)).toBe(dailyPoemIndex(360,now));
  });
  it("does not resurrect completed records on reload or mix them into calendar/category lists", () => {
    const completed = fixtures.map(item => ({...item, done: true}));
    const reloaded = JSON.parse(JSON.stringify(completed));
    for(const view of ["today","tasks","calendar"]) for(const filter of ["all","personal","work","meeting"]) {
      expect(selectDashboardItems(reloaded,view,filter,now)).toEqual([]);
    }
    expect(summarizeDashboardItems(reloaded).map(g=>[g.total,g.done])).toEqual([[0,6],[0,4],[0,1],[0,1]]);
    expect(reloaded).toEqual(completed);
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
