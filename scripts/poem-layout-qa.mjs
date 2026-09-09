// Runs against the real rendered poem, in an isolated QA page/emulator only.
export async function poemLayoutQa(corpus) {
  const original=document.querySelector('.daily-poem');
  if(!original)throw new Error('Poem missing');
  await document.fonts.ready;
  // The daily clock legitimately refreshes the live header every 30 seconds.
  // A same-position clone isolates this layout test from that unrelated update.
  const heading=original.cloneNode(true);heading.removeAttribute('id');
  original.before(heading);const wasHidden=original.hidden;original.hidden=true;
  const dispose=window.HamrahOverview.observePoemLayout(heading);
  const rows=[];
  try {
    for(let index=0;index<corpus.length;index++){
      const lines=corpus[index];
      if(heading.querySelectorAll('.poem-couplet > span').length!==4)throw new Error('Not a complete quatrain');
      [...heading.querySelectorAll('.poem-couplet > span')].forEach((e,i)=>e.textContent=lines[i]);
      // Use the exact production measurement synchronously, then real browser
      // layout. Background-tab RAF throttling must not turn 360 checks into hours.
      window.HamrahOverview.observePoemLayout(heading)();
      if(index%20===0)await new Promise(r=>setTimeout(r,0));
      const elements=[...heading.querySelectorAll('.poem-couplet > span')];
      const measures=elements.map(e=>{const style=getComputedStyle(e);return{text:e.textContent,width:e.clientWidth,scroll:e.scrollWidth,height:e.getBoundingClientRect().height,lineHeight:parseFloat(style.lineHeight),font:parseFloat(style.fontSize),x:e.getBoundingClientRect().x};});
      const hidden=measures.some((e,i)=>e.text!==lines[i]||e.scroll>e.width+1);
      const wrongOrder=measures[0].x<=measures[1].x||measures[2].x<=measures[3].x;
      const min=parseFloat(getComputedStyle(document.documentElement).fontSize)*.875;
      if(hidden||wrongOrder||measures.some(e=>e.font<min-.05)||new Set(measures.map(e=>e.font)).size!==1)throw new Error(`Poem ${index} clipped, RTL wrong or unreadable: ${JSON.stringify(measures)}`);
      rows.push({index,font:measures[0].font,wrapped:measures.some(e=>e.height>e.lineHeight+1),height:heading.getBoundingClientRect().height});
    }
    return{count:rows.length,width:innerWidth,rootFont:parseFloat(getComputedStyle(document.documentElement).fontSize),oneLine:rows.filter(r=>!r.wrapped).length,readableWrap:rows.filter(r=>r.wrapped).length,noMissingWords:true,rows};
  } finally {dispose();heading.remove();original.hidden=wasHidden;}
}
