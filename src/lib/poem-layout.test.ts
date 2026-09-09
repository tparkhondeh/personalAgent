import {describe,it,expect} from 'vitest';
import {poemGeometry} from './poem-layout';
describe('readable two-column poem geometry',()=>{
  it('uses the largest line per column and one shared font size',()=>{const g=poemGeometry(420,[190,140,180,160]);expect(g.fontSize).toBeGreaterThanOrEqual(14);expect(g.fontSize).toBeLessThanOrEqual(18);expect(g.fraction).toBeGreaterThan(.5);expect(g.wrap).toBe(false);});
  it('preserves readable text and natural wrapping on narrow screens',()=>{const g=poemGeometry(240,[250,260,150,190]);expect(g.fontSize).toBe(14);expect(g.wrap).toBe(true);});
  it('respects enlarged text instead of scaling it back down',()=>{expect(poemGeometry(320,[380,320,300,400],32).fontSize).toBe(28);});
  it('does not allow an extreme column to hide the other',()=>{expect(poemGeometry(500,[400,20,380,25]).fraction).toBe(.65);});
});
