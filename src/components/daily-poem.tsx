"use client";
import {useEffect,useRef} from 'react';
import {observePoemLayout} from '@/lib/poem-layout';
export function DailyPoem({lines,personal=false}:{lines:readonly string[];personal?:boolean}) {
  const ref=useRef<HTMLHeadingElement>(null);
  useEffect(()=>ref.current?observePoemLayout(ref.current):undefined,[]);
  return <h1 ref={ref} className="daily-poem" aria-label={`${personal?'شعر خودم':'شعر روز مولانا'}: ${lines.join('، ')}`}>
    {[0,2].map(i=><span key={i} className="poem-couplet"><span>{lines[i]}</span><span>{lines[i+1]}</span></span>)}
  </h1>;
}
