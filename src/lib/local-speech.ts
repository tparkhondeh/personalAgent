// One in-device recognizer for web and Android. No POST, credentials or audio storage.
type SpeechMessage={event:string;result?:{text?:string;partial?:string}|boolean};
type SpeechRecognizer={on:(event:string,listener:(message:SpeechMessage)=>void)=>void;acceptWaveformFloat:(samples:Float32Array,rate:number)=>void;retrieveFinalResult:()=>void;remove:()=>void};
type SpeechModel={on:(event:string,listener:(message:SpeechMessage)=>void)=>void;KaldiRecognizer:new(rate:number)=>SpeechRecognizer;terminate:()=>void};
type SpeechLibrary={Model:new(url:string,level:number)=>SpeechModel};
const checkAbort=(signal:AbortSignal)=>{if(signal.aborted)throw new Error('cancelled');};
export function localSpeechOrigin() {
  const native=(window as Window & {Capacitor?:{isNativePlatform?:()=>boolean}}).Capacitor?.isNativePlatform?.();
  return native?'https://localhost':window.location.origin;
}
export function normalizeVoiceText(text:string) {
  return text.replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/\s+/g,' ').trim().slice(0,2000);
}
async function loadSpeechLibrary(signal:AbortSignal):Promise<SpeechLibrary> {
  const scope=window as Window & {Vosk?:SpeechLibrary};
  if(scope.Vosk)return scope.Vosk;
  checkAbort(signal);
  await new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src=`${localSpeechOrigin()}/speech/vosk-0.0.8.js`;
    const cleanup=()=>{script.onload=null;script.onerror=null;signal.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();script.remove();reject(new Error('cancelled'));};
    script.onload=()=>{cleanup();resolve();};script.onerror=()=>{cleanup();script.remove();reject(new Error('engine'));};
    signal.addEventListener('abort',abort,{once:true});document.head.append(script);
  });
  checkAbort(signal);if(!scope.Vosk)throw new Error('engine');return scope.Vosk;
}
export function createLocalSpeech() {
  let active:AbortController|null=null;
  let cachedModel:SpeechModel|undefined;
  let idleTimer:ReturnType<typeof setTimeout>|undefined;
  const releaseModel=()=>{clearTimeout(idleTimer);cachedModel?.terminate();cachedModel=undefined;};
  const cancel=()=>{active?.abort();active=null;releaseModel();};
  return {
    cancel,
    async transcribe(clip:Blob,progress:(message:string)=>void):Promise<string> {
      if(active)throw new Error('در حال پردازش صدای قبلی است.');
      clearTimeout(idleTimer);
      const controller=new AbortController();active=controller;
      // Android OS version does not guarantee a recent WebView. Avoid newer
      // AbortSignal.any/timeout/throwIfAborted helpers; cancellation is baseline.
      const signal=controller.signal;let timedOut=false;
      const deadline=setTimeout(()=>{timedOut=true;controller.abort();},180000);
      let model:SpeechModel|undefined,recognizer:SpeechRecognizer|undefined,succeeded=false;
      const terminate=()=>{model?.terminate();};
      signal.addEventListener('abort',terminate,{once:true});
      try {
        if(!clip.size||clip.size>4*1024*1024)throw new Error('audio');
        const context=new AudioContext();let decoded:AudioBuffer;
        try{decoded=await context.decodeAudioData(await clip.arrayBuffer());}finally{await context.close();}
        checkAbort(signal);
        if(decoded.duration<0.1||decoded.duration>61)throw new Error('duration');
        const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
        const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
        const samples=(await offline.startRendering()).getChannelData(0);
        let energy=0;for(const value of samples)energy+=value*value;
        if(Math.sqrt(energy/samples.length)<0.001)throw new Error('silence');
        progress('در حال آماده‌سازی تشخیص فارسی روی دستگاه…');
        const library=await loadSpeechLibrary(signal);checkAbort(signal);
        const warm=Boolean(cachedModel);
        model=cachedModel??new library.Model(`${localSpeechOrigin()}/speech/fa-0.42.model`,-2);
        const wait=<T,>(listen:(resolve:(value:T)=>void,reject:()=>void)=>void)=>new Promise<T>((resolve,reject)=>{
          const abort=()=>reject(new Error('cancelled'));
          signal.addEventListener('abort',abort,{once:true});
          const done=(value:T)=>{signal.removeEventListener('abort',abort);resolve(value);};
          const fail=()=>{signal.removeEventListener('abort',abort);reject(new Error('recognition'));};
          listen(done,fail);if(signal.aborted)abort();
        });
        if(!warm)await wait<void>((done,fail)=>{model!.on('load',m=>m.result===true?done():fail());model!.on('error',fail);});
        checkAbort(signal);progress('در حال تبدیل صدا؛ چیزی هنوز ثبت نشده است…');
        recognizer=new model.KaldiRecognizer(16000);
        const parts:string[]=[];
        let receive:((m:SpeechMessage)=>void)|undefined,failed:(()=>void)|undefined;
        recognizer.on('result',m=>receive?.(m));recognizer.on('partialresult',m=>receive?.(m));recognizer.on('error',()=>failed?.());
        for(let start=0;start<samples.length;start+=16000){
          checkAbort(signal);
          await wait<void>((done,fail)=>{failed=fail;receive=m=>{if(m.event==='result'&&typeof m.result==='object'&&m.result.text)parts.push(m.result.text);done();};recognizer!.acceptWaveformFloat(samples.slice(start,start+16000),16000);});
        }
        await wait<void>((done,fail)=>{failed=fail;receive=m=>{if(typeof m.result==='object'&&m.result.text)parts.push(m.result.text);done();};recognizer!.retrieveFinalResult();});
        checkAbort(signal);
        const text=normalizeVoiceText(parts.join(' '));if(!text)throw new Error('silence');succeeded=true;return text;
      } catch(error) {
        if(timedOut)throw new Error('تبدیل صدا بیش از حد طول کشید؛ کوتاه‌تر ضبط کن یا متن را بنویس.');
        if(controller.signal.aborted)throw new Error('ضبط و تبدیل لغو شد؛ چیزی ثبت نشده است.');
        if(error instanceof Error&&error.message==='silence')throw new Error('گفتار واضحی تشخیص داده نشد؛ نزدیک‌تر و شمرده‌تر صحبت کن.');
        throw new Error('تبدیل روی دستگاه کامل نشد؛ دوباره تلاش کن یا متن را بنویس. در وب، بار اول اینترنت برای دریافت مدل لازم است.');
      } finally {
        clearTimeout(deadline);signal.removeEventListener('abort',terminate);recognizer?.remove();
        // Retain weights, never the recognizer/audio. Cancel/error/exit terminates
        // immediately; idle expiry bounds RAM use on small Android devices.
        if(succeeded&&!signal.aborted&&active===controller){cachedModel=model;idleTimer=setTimeout(releaseModel,45000);}
        else {model?.terminate();if(cachedModel===model)cachedModel=undefined;}
        if(active===controller)active=null;
      }
    },
  };
}
