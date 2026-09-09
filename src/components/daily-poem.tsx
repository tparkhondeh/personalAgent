"use client";
import {useEffect,useRef} from 'react';
import {observePoemLayout} from '@/lib/poem-layout';
export function DailyPoem({lines}:{lines:readonly string[]}) {
  const ref=useRef<HTMLHeadingElement>(null);
  useEffect(()=>ref.current?observePoemLayout(ref.current):undefined,[]);
  return <h1 ref={ref} className="daily-poem" aria-label={`شعر روز مولانا: ${lines.join('، ')}`}>
    {[0,2].map(i=><span key={i} className="poem-couplet"><span>{lines[i]}</span><span>{lines[i+1]}</span></span>)}
  </h1>;
}
