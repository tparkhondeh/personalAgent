// Shared, parser-blocking bootstrap: no system-theme lookup and no network call.
// Only a validated enum is stored; tasks/authentication never use this key.
export const appearanceBootstrap = String.raw`(()=>{
  const key='hamrah-appearance-v1';
  const valid=value=>value==='light'||value==='dark';
  let current='light';
  try{const saved=localStorage.getItem(key);if(valid(saved))current=saved;}catch{}
  if(valid(window.__hamrahNativeTheme))current=window.__hamrahNativeTheme;
  const apply=value=>{
    current=value;document.documentElement.dataset.theme=value;
    document.documentElement.style.colorScheme=value;
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>{meta.removeAttribute('media');meta.content=value==='dark'?'#13151f':'#f7f7ff';});
    window.dispatchEvent(new Event('hamrah-appearance'));
  };
  window.HamrahAppearance={get:()=>current,set:value=>{
    if(!valid(value))return false;
   let saved=true;
   try{localStorage.setItem(key,value);}catch{saved=false;}
   if(window.HamrahAppearanceNative)window.__hamrahNativeTheme=value;
    apply(value);
    try{window.HamrahAppearanceNative?.postMessage(value);}catch{}
   return saved;
  },acceptNative:value=>{if(valid(value)){window.__hamrahNativeTheme=value;apply(value);}}};
  apply(current);
  window.addEventListener('storage',event=>{if(event.key===key&&!window.HamrahAppearanceNative)apply(valid(event.newValue)?event.newValue:'light');});
  document.addEventListener('DOMContentLoaded',()=>apply(current),{once:true});
})();`;
