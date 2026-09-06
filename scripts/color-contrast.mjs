// Opaque computed RGB values only: unsupported/transparent input must fail QA.
export function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const match = color.match(/^rgba?\(([^)]+)\)$/);
    const values = match?.[1].split(',').map(Number);
    if (!values || ![3,4].includes(values.length) || values.some(n=>!Number.isFinite(n)) || (values.length===4 && values[3]!==1)) throw Error('Opaque RGB required for contrast QA');
    const rgb=values.slice(0,3).map(n=>{if(n<0||n>255)throw Error('Invalid RGB');const v=n/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  };
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
