import { describe,it,expect } from "vitest";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { appearanceBootstrap } from "./appearance";

function boot(saved?:string,native?:string,blocked=false){
  const storage=new Map(saved?[["hamrah-appearance-v1",saved]]:[]);
  const listeners:Record<string,(event:{key:string;newValue:string|null})=>void>={};
  const root={dataset:{} as Record<string,string>,style:{} as Record<string,string>};
  const meta={content:"",removeAttribute:()=>{}};
  const context={localStorage:{getItem:(k:string)=>{if(blocked)throw Error();return storage.get(k);},setItem:(k:string,v:string)=>{if(blocked)throw Error();storage.set(k,v);}},Event:class {},window:{__hamrahNativeTheme:native,dispatchEvent:()=>{},addEventListener:(n:string,f:typeof listeners[string])=>{listeners[n]=f;}},document:{documentElement:root,querySelectorAll:()=>[meta],addEventListener:()=>{}}};
  runInNewContext(appearanceBootstrap,context);
  const api=(context.window as typeof context.window & {HamrahAppearance:{get:()=>string;set:(v:string)=>boolean;acceptNative:(v:string)=>void}}).HamrahAppearance;
  return {api,root,meta,storage,listeners,context};
}
describe("explicit saved appearance",()=>{
  it("defaults light without querying the OS",()=>{const s=boot();expect(s.api.get()).toBe('light');expect(s.root.style.colorScheme).toBe('light');expect(appearanceBootstrap).not.toMatch(/matchMedia|prefers-color-scheme/);});
  it.each(['dark','light'])("persists only explicit %s",theme=>{const s=boot();expect(s.api.set(theme)).toBe(true);expect(boot(s.storage.get('hamrah-appearance-v1')).api.get()).toBe(theme);expect(s.meta.content).toBe(theme==='dark'?'#13151f':'#f7f7ff');});
  it.each(['system','garbage','<script>'])('ignores invalid stored values %s',value=>{expect(boot(value).api.get()).toBe('light');expect(boot().api.set(value)).toBe(false);});
  it('stays usable if storage is denied',()=>{const s=boot(undefined,undefined,true);expect(s.api.set('dark')).toBe(false);expect(s.api.get()).toBe('dark');});
  it('uses one native choice across remote and private origins',()=>{expect(boot('light','dark').api.get()).toBe('dark');const s=boot('dark','light');expect(s.api.get()).toBe('light');s.api.acceptNative('bad');expect(s.api.get()).toBe('light');});
  it('reacts to another browser tab',()=>{const s=boot();s.listeners.storage({key:'hamrah-appearance-v1',newValue:'dark'});expect(s.api.get()).toBe('dark');});
  it('bundles the same bootstrap and never auto-darkens CSS',()=>{
    expect(readFileSync('mobile-shell/appearance.js','utf8')).toBe(appearanceBootstrap);
    for(const file of ['src/app/globals.css','mobile-shell/app.css','mobile-shell/theme.css','mobile-shell/connection-error.html'])expect(readFileSync(file,'utf8')).not.toMatch(/prefers-color-scheme/);
  });
  it('limits the native bridge to main frames and trusted origins',()=>{
    const native=readFileSync('android/app/src/main/java/ir/wealthos/personalagent/AppearanceController.java','utf8');
    expect(native).toContain('!mainFrame || !origins.contains(origin.toString())');
    expect(native).toContain('WebViewFeature.DOCUMENT_START_SCRIPT');
    expect(native).not.toContain('Set.of("*")');
  });
});
