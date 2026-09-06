"use client";
import { useState } from "react";
import { dateInputValue, faDigits, inputDigits, parsePersianInput, persianMonthGrid, persianMonths, persianParts, validTime24 } from "@/lib/persian-inputs";

type FieldProps={value?:string;defaultValue?:string;onChange?:(value:string)=>void;name?:string;required?:boolean;label?:string};
export function PersianDateField({value,defaultValue="",onChange,name,required,label="تاریخ شمسی"}:FieldProps){
  const [local,setLocal]=useState(defaultValue),current=value??local;
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tehran"}).format(new Date());
  const initial=persianParts(current)||persianParts(today)!;
  const [month,setMonth]=useState({year:initial.year,month:initial.month});
  const grid=persianMonthGrid(month.year,month.month);
  function change(next:string){setLocal(next);onChange?.(next);}
  function move(delta:number){const index=month.year*12+month.month-1+delta;setMonth({year:Math.floor(index/12),month:index%12+1});}
  return <span className="date-time-control"><input type="hidden" name={name} value={current}/><input aria-label={label} dir="ltr" inputMode="numeric" placeholder="۱۴۰۵/۰۶/۱۵" required={required} pattern="[۰-۹0-9]{4}/[۰-۹0-9]{2}/[۰-۹0-9]{2}" value={faDigits(dateInputValue(current))} onChange={e=>change(parsePersianInput(e.target.value))} aria-invalid={current.startsWith("invalid:")}/>
    <details className="date-picker"><summary onClick={()=>{const p=persianParts(current);if(p)setMonth({year:p.year,month:p.month});}}>انتخاب از تقویم</summary><span className="calendar-picker"><span className="picker-header"><button type="button" disabled={month.year===1300&&month.month===1} onClick={()=>move(-1)}>ماه قبل</button><strong>{persianMonths[month.month-1]} {faDigits(month.year)}</strong><button type="button" disabled={month.year===1500&&month.month===12} onClick={()=>move(1)}>ماه بعد</button></span><span className="picker-days">{["ش","ی","د","س","چ","پ","ج"].map((d,i)=><small key={i}>{d}</small>)}{Array.from({length:grid.offset},(_,i)=><span key={`blank${i}`}/>)}{grid.days.map(d=><button type="button" aria-label={`${faDigits(d.day)} ${persianMonths[month.month-1]} ${faDigits(month.year)}`} aria-pressed={current===d.iso} key={d.iso} onClick={e=>{change(d.iso);e.currentTarget.closest("details")?.removeAttribute("open");}}>{faDigits(d.day)}</button>)}</span></span></details>{current.startsWith("invalid:")&&<small className="field-error">تاریخ شمسی معتبر وارد کن.</small>}</span>;
}
export function Time24Field({value,defaultValue="",onChange,name,required,label="ساعت ۲۴ساعته"}:FieldProps){
  const [local,setLocal]=useState(defaultValue),current=value??local;
  function change(next:string){setLocal(next);onChange?.(next);}
  const [h,m]=current.split(":");
  return <span className="date-time-control"><input type="hidden" name={name} value={current}/><input type="text" aria-label={label} dir="ltr" inputMode="numeric" placeholder="۰۰:۰۰" required={required} maxLength={5} pattern="([۰0۱1][۰-۹0-9]|[۲2][۰0۱1۲2۳3]):[۰-۵0-5][۰-۹0-9]" value={faDigits(current)} onChange={e=>change(inputDigits(e.target.value))} aria-invalid={Boolean(current&&!validTime24(current))}/><details className="time-picker"><summary>انتخاب ساعت</summary><span className="clock-picker" dir="ltr"><select aria-label={`${label} — ساعت`} value={/^\d{2}$/.test(h)?h:""} onChange={e=>change(`${e.target.value}:${m||"00"}`)}><option value="">ساعت</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,"0")).map(v=><option value={v} key={v}>{faDigits(v)}</option>)}</select><span>:</span><select aria-label={`${label} — دقیقه`} value={/^\d{2}$/.test(m)?m:""} onChange={e=>change(`${h||"00"}:${e.target.value}`)}><option value="">دقیقه</option>{Array.from({length:60},(_,i)=>String(i).padStart(2,"0")).map(v=><option value={v} key={v}>{faDigits(v)}</option>)}</select></span></details>{current&&!validTime24(current)&&<small className="field-error">ساعت را از ۰۰:۰۰ تا ۲۳:۵۹ وارد کن.</small>}</span>;
}
