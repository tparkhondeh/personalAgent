// Canonical vector mark. All web, PWA and Android icon sizes derive from this.
export function tiaIconSvg({ transparent=false, round=false }={}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="tia">
  <defs><linearGradient id="tia" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b6c1ef"/><stop offset="1" stop-color="#a3d6c8"/></linearGradient></defs>
  ${transparent?'':round?'<circle cx="256" cy="256" r="256" fill="#f7f7ff"/>':'<rect width="512" height="512" rx="144" fill="#f7f7ff"/>'}
  <rect x="88" y="88" width="336" height="336" rx="112" fill="url(#tia)"/>
  <path d="M236 165v126c0 39 24 62 61 53M182 224h118" fill="none" stroke="#344767" stroke-width="32" stroke-linecap="round"/>
  <circle cx="330" cy="165" r="17" fill="#344767"/>
  </svg>`;
}
