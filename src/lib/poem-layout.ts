// Shared measured layout. Never alter text or defeat the user's text-size setting.
export function poemGeometry(width: number, measured: number[], rootSize = 16) {
  const right=Math.max(measured[0]||0,measured[2]||0,1);
  const left=Math.max(measured[1]||0,measured[3]||0,1);
  const gap=width<=480?8:Math.max(8,Math.min(24,width*.035));
  const available=Math.max(1,width-gap);
  const fraction=Math.max(.35,Math.min(.65,right/(right+left)));
  const fit=Math.min(available*fraction/right,available*(1-fraction)/left);
  // Poetry is secondary text: 13–18px at the normal root size. Scale this
  // readable floor with user text zoom; never shrink individual hemistichs.
  const minimum=rootSize*.8125, maximum=rootSize*1.125;
  const fontSize=Math.max(minimum,Math.min(maximum,rootSize*fit));
  return {fontSize,gap,fraction,wrap:rootSize*fit<minimum};
}

export function observePoemLayout(poem: HTMLElement) {
  let disposed=false,frame=0;
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  const fit=()=>{
    if(disposed||!context||!poem.classList.contains('daily-poem'))return;
    const lines=[...poem.querySelectorAll<HTMLElement>('.poem-couplet > span')];
    const style=getComputedStyle(poem),root=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;
    const width=poem.clientWidth-parseFloat(style.paddingLeft||'0')-parseFloat(style.paddingRight||'0');if(lines.length!==4||width<=0)return;
    context.font=`${style.fontWeight} ${root}px ${style.fontFamily}`;
    const measured=lines.map(line=>context.measureText(line.textContent||'').width+2);
    const geometry=poemGeometry(width,measured,root);
    poem.style.setProperty('--poem-size',`${geometry.fontSize/root}rem`);
    poem.style.setProperty('--poem-gap',`${geometry.gap}px`);
    poem.style.setProperty('--poem-columns',`minmax(0,${geometry.fraction}fr) minmax(0,${1-geometry.fraction}fr)`);
    poem.dataset.wrap=String(geometry.wrap);
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(fit);};
  const resize=new ResizeObserver(schedule);resize.observe(poem);resize.observe(document.documentElement);
  const text=new MutationObserver(schedule);text.observe(poem,{childList:true,subtree:true,characterData:true});
  document.fonts?.ready.then(schedule);document.fonts?.addEventListener('loadingdone',schedule);
  window.addEventListener('resize',schedule);fit();
  return()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();text.disconnect();document.fonts?.removeEventListener('loadingdone',schedule);window.removeEventListener('resize',schedule);};
}
