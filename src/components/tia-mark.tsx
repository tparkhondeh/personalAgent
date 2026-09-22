import { useId } from "react";
import brand from "@/data/tia-brand.json";
export function TiaMark() {
  const gradient=useId();
  return <svg className="tia-mark" width="44" height="44" viewBox="0 0 512 512" aria-hidden="true">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><stop stopColor={brand.background[0]}/><stop offset="1" stopColor={brand.background[1]}/></linearGradient></defs>
    <rect width="512" height="512" rx="120" fill={`url(#${gradient})`}/>
    {brand.paths.map(path => <path key={path.d} d={path.d} fill="none" stroke={brand.ink[0]} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round"/>)}
    <circle cx={brand.dot.x} cy={brand.dot.y} r={brand.dot.radius} fill={brand.ink[0]}/>
  </svg>;
}
