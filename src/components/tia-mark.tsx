import { useId } from "react";
export function TiaMark() {
  const gradient=useId();
  return <svg className="tia-mark" width="44" height="44" viewBox="0 0 512 512" aria-hidden="true">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b6c1ef"/><stop offset="1" stopColor="#a3d6c8"/></linearGradient></defs>
    <rect width="512" height="512" rx="144" fill="#f7f7ff"/>
    <rect x="88" y="88" width="336" height="336" rx="112" fill={`url(#${gradient})`}/>
    <path d="M236 165v126c0 39 24 62 61 53M182 224h118" fill="none" stroke="#344767" strokeWidth="32" strokeLinecap="round"/>
    <circle cx="330" cy="165" r="17" fill="#344767"/>
  </svg>;
}
