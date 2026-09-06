import { describe, expect, it } from "vitest";
import { dateInputValue, jalaliToIso, parsePersianInput, persianMonthGrid, validTime24 } from "./persian-inputs";
describe("shared Jalali and 24-hour controls",()=>{
  it.each([["۱۴۰۵/۰۶/۱۶","2026-09-07"],["1405/06/16","2026-09-07"],["١٤٠٥/٠٦/١٦","2026-09-07"],["1399/12/30","2021-03-20"],["1400/01/01","2021-03-21"],["1403/12/30","2025-03-20"],["1404/01/01","2025-03-21"]])("converts %s losslessly",(input,iso)=>{expect(parsePersianInput(input)).toBe(iso);expect(parsePersianInput(dateInputValue(iso))).toBe(iso);});
  it.each(["1400/12/30","1404/12/30","1405/07/31","1405/13/01","2026/09/07"])("rejects invalid Persian date %s",value=>expect(parsePersianInput(value)).toMatch(/^invalid:/));
  it("supports month boundaries and leap Esfand",()=>{expect(persianMonthGrid(1403,12).days).toHaveLength(30);expect(persianMonthGrid(1404,12).days).toHaveLength(29);expect(persianMonthGrid(1405,6).days).toHaveLength(31);expect(jalaliToIso(1405,7,1)).toBe("2026-09-23");});
  it.each(["00:00","23:59","۰۵:۰۹","١٧:٣٠"])("accepts 24-hour %s",v=>expect(validTime24(v)).toBe(true));
  it.each(["24:00","5:00","17:60","05:00 PM","-1:00"])("rejects %s",v=>expect(validTime24(v)).toBe(false));
});
