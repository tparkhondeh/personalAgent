import { expect, it } from "vitest";
import { readinessSummary } from "./check-store-readiness.mjs";
const fixture = state => ({ publicReleaseApproved: false, gates: [{id:"evidence",targets:["personal","public","play","bazaar"],state,evidence:"reviewed test"}] });
it.each(["unknown","pending","blocked"])("never treats %s evidence as ready", state => {
  expect(Object.values(readinessSummary(fixture(state))).every(result => !result.ready)).toBe(true);
});
it("requires explicit approval beyond verification for publication", () => {
  const result = readinessSummary(fixture("verified"));
  expect(result.personal.ready).toBe(true);
  expect(result.play.ready).toBe(false);
  expect(readinessSummary({...fixture("verified"),publicReleaseApproved:true}).play.ready).toBe(true);
});
it("rejects absent, malformed and duplicate evidence", () => {
  expect(()=>readinessSummary({gates:[]})).toThrow();
  const record=fixture("verified");record.gates.push(record.gates[0]);
  expect(()=>readinessSummary(record)).toThrow();
  expect(()=>readinessSummary(fixture("success"))).toThrow();
});
