"use client";

import { useState, useSyncExternalStore } from "react";

declare global {
  interface Window {
    HamrahAppearance?: { get: () => "light" | "dark"; set: (value: "light" | "dark") => boolean };
  }
}
const subscribe=(update:()=>void)=>{window.addEventListener("hamrah-appearance",update);return()=>window.removeEventListener("hamrah-appearance",update);};
const snapshot=()=>window.HamrahAppearance?.get()??"light";

export function AppearanceSetting(){
  const theme=useSyncExternalStore(subscribe,snapshot,()=>"light");
  const [error,setError]=useState("");
  return <section className="appearance-setting" aria-label="ظاهر برنامه"><strong>ظاهر</strong><div role="group" aria-label="انتخاب ظاهر">{([['light','روشن'],['dark','تیره']] as const).map(([value,label])=><button key={value} type="button" data-appearance={value} aria-pressed={theme===value} onClick={()=>setError(window.HamrahAppearance?.set(value)?"":"انتخاب فعلی اعمال شد؛ ذخیره روی این دستگاه ممکن نیست.")}>{label}</button>)}</div>{error&&<p role="status">{error}</p>}</section>;
}
