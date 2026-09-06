// Shared calendar arithmetic; stored dates remain Gregorian ISO, never browser-local dates.
const persianCalendar = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });
export const persianMonths = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
export const inputDigits = (s:string) => s.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
export const faDigits = (s:string|number) => String(s).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
export function persianParts(iso:string) {
  const date=new Date(`${iso}T12:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)return null;
  const p=persianCalendar.formatToParts(date),get=(key:string)=>Number(p.find(x=>x.type===key)?.value);
  return {year:get("year"),month:get("month"),day:get("day")};
}
export function jalaliToIso(year:number,month:number,day:number) {
  if(![year,month,day].every(Number.isInteger)||year<1300||year>1500||month<1||month>12||day<1||day>31)return "";
  const start=Date.UTC(year+621,2,18);
  for(let i=0;i<370;i++){const iso=new Date(start+i*86400000).toISOString().slice(0,10),p=persianParts(iso)!;if(p.year===year&&p.month===month&&p.day===day)return iso;}
  return "";
}
export function dateInputValue(iso:string) {
  if(iso.startsWith("invalid:"))return iso.slice(8);
  const p=persianParts(iso);return p?`${p.year}/${String(p.month).padStart(2,"0")}/${String(p.day).padStart(2,"0")}`:"";
}
export function parsePersianInput(value:string) {
  const text=inputDigits(value.trim());if(!text)return "";
  const match=text.match(/^(1[345]\d{2})[/-](\d{1,2})[/-](\d{1,2})$/);
  return (match&&jalaliToIso(Number(match[1]),Number(match[2]),Number(match[3])))||`invalid:${text}`;
}
export const validTime24 = (s:string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(inputDigits(s));
export function persianMonthGrid(year:number,month:number) {
  const first=jalaliToIso(year,month,1);if(!first)return {offset:0,days:[] as {iso:string;day:number}[]};
  const start=Date.parse(`${first}T12:00:00Z`),days=[];
  for(let day=1;day<=31;day++){const iso=new Date(start+(day-1)*86400000).toISOString().slice(0,10);if(persianParts(iso)?.month!==month)break;days.push({iso,day});}
  return {offset:(new Date(start).getUTCDay()+1)%7,days};
}
