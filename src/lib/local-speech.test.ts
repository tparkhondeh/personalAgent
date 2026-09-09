import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createLocalSpeech,localSpeechOrigin,normalizeVoiceText} from './local-speech';
type Message={event:string;result?:{text?:string;partial?:string}|boolean};
let signalLevel=0.2, duration=1, load=true, modelError=false;
const models:{terminate:ReturnType<typeof vi.fn>}[]=[];
class Recognizer {
  listeners:Record<string,(m:Message)=>void>={};
  on(event:string,fn:(m:Message)=>void){this.listeners[event]=fn;}
  acceptWaveformFloat(){queueMicrotask(()=>this.listeners.partialresult?.({event:'partialresult',result:{partial:'جلسه'}}));}
  retrieveFinalResult(){queueMicrotask(()=>this.listeners.result?.({event:'result',result:{text:'فردا ساعت پنج عصر جلسه با تیم فروش'}}));}
  remove(){}
}
class Model {
  KaldiRecognizer=Recognizer;terminate=vi.fn();
  constructor(){models.push(this);}
  on(event:string,fn:(m:Message)=>void){if(event==='load'&&load)queueMicrotask(()=>fn({event:'load',result:!modelError}));}
}
beforeEach(()=>{
  signalLevel=0.2;duration=1;load=true;modelError=false;models.length=0;
  vi.stubGlobal('window',{location:{origin:'https://app.example'},Vosk:{Model}});
  vi.stubGlobal('AudioContext',class{async decodeAudioData(){return{duration};}async close(){}});
  vi.stubGlobal('OfflineAudioContext',class{destination={};createBufferSource(){return{buffer:null,connect(){},start(){}};}async startRendering(){return{getChannelData:()=>new Float32Array(16000).fill(signalLevel)};}});
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('device-only Persian transcription control (engine mocked; actual decoding tested separately)',()=>{
  it('normalizes Persian letters without inventing a title',()=>expect(normalizeVoiceText('  علي  شركت  ۳۶۰  ')).toBe('علی شرکت ۳۶۰'));
  it('keeps the APK asset origin private and the web same-origin',()=>{expect(localSpeechOrigin()).toBe('https://app.example');vi.stubGlobal('window',{Capacitor:{isNativePlatform:()=>true}});expect(localSpeechOrigin()).toBe('https://localhost');});
  it('reuses model weights but creates a fresh recognizer for each clip, then expires',async()=>{
    vi.useFakeTimers();const speech=createLocalSpeech();
    expect(await speech.transcribe(new Blob(['first']),()=>{})).toBe('فردا ساعت پنج عصر جلسه با تیم فروش');
    expect(await speech.transcribe(new Blob(['second']),()=>{})).toBe('فردا ساعت پنج عصر جلسه با تیم فروش');
    expect(models).toHaveLength(1);expect(models[0].terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(45001);expect(models[0].terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  });
  it('cancellation releases a warm model immediately',async()=>{const speech=createLocalSpeech();await speech.transcribe(new Blob(['test']),()=>{});speech.cancel();expect(models[0].terminate).toHaveBeenCalled();});
  it('works without recent AbortSignal helpers on older Android WebViews',async()=>{
    vi.stubGlobal('AbortSignal',{});
    const speech=createLocalSpeech();expect(await speech.transcribe(new Blob(['test']),()=>{})).toContain('جلسه با تیم فروش');speech.cancel();
  });
  it('times out and terminates without leaving a pending timer',async()=>{
    vi.useFakeTimers();load=false;const speech=createLocalSpeech();
    const result=speech.transcribe(new Blob(['test']),()=>{});
    const check=expect(result).rejects.toThrow('بیش از حد طول کشید');
    await vi.advanceTimersByTimeAsync(180001);await check;
    expect(models[0].terminate).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects silence before loading an engine',async()=>{signalLevel=0;await expect(createLocalSpeech().transcribe(new Blob(['test']),()=>{})).rejects.toThrow('گفتار واضحی');expect(models).toHaveLength(0);});
  it('rejects empty audio',async()=>{await expect(createLocalSpeech().transcribe(new Blob([]),()=>{})).rejects.toThrow();expect(models).toHaveLength(0);});
  it('bounds recording duration',async()=>{duration=62;await expect(createLocalSpeech().transcribe(new Blob(['test']),()=>{})).rejects.toThrow();expect(models).toHaveLength(0);});
  it('turns model failure into a safe Persian retry message',async()=>{modelError=true;await expect(createLocalSpeech().transcribe(new Blob(['test']),()=>{})).rejects.toThrow('دوباره تلاش کن');expect(models[0].terminate).toHaveBeenCalled();});
  it('cancels during model loading and ignores later completion',async()=>{load=false;const speech=createLocalSpeech();const result=speech.transcribe(new Blob(['test']),()=>{});const check=expect(result).rejects.toThrow('لغو شد');await vi.waitFor(()=>expect(models).toHaveLength(1));speech.cancel();await check;expect(models[0].terminate).toHaveBeenCalled();});
  it('does not permit duplicate concurrent transcription',async()=>{load=false;const speech=createLocalSpeech(),first=speech.transcribe(new Blob(['test']),()=>{});const check=expect(first).rejects.toThrow();await expect(speech.transcribe(new Blob(['test']),()=>{})).rejects.toThrow('صدای قبلی');speech.cancel();await check;});
  it('keeps audio off the network and uses shared code in the APK',()=>{
    const source=readFileSync('src/lib/local-speech.ts','utf8');expect(/fetch\(|localStorage|sessionStorage|api\.openai|SpeechRecognition/.test(source)).toBe(false);
    const web=readFileSync('src/components/agent-assistant.tsx','utf8');expect(web.includes('void sendMessage(text);')).toBe(true);expect(web.includes('confirmed:true')).toBe(true);
    expect(web.includes('key={owner}')).toBe(true);expect(web.includes('disabled={pending||voiceBusy}')).toBe(true);
    const mobile=readFileSync('mobile-shell/app.js','utf8');expect(mobile.includes('input.value=text;saveInput();replyToMessage();')).toBe(true);expect(mobile.includes('window.HamrahCapture.createLocalSpeech()')).toBe(true);
    const prepare=readFileSync('scripts/prepare-local-speech.mjs','utf8');expect(prepare.includes('this.worker.terminate()')).toBe(true);expect(prepare.includes('Speech model digest mismatch')).toBe(true);
  });
});
