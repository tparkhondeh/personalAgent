// Runs in an isolated emulator. Input is an attributed public fixture, not a
// phone microphone or the user's voice. Uses real AudioContext/MediaRecorder/ASR.
export async function persianSpeechFixtureQa(base64, waitUntil) {
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const before=localStorage.getItem('hamrah-local-v2');
  const audio=new Blob([Uint8Array.from(atob(base64),x=>x.charCodeAt(0))],{type:'audio/wav'});
  const speech=window.HamrahCapture.createLocalSpeech();
  const result=await speech.transcribe(audio,()=>{});
  assert(result==='خوش آمدید','Real Persian audio was not decoded: '+result);
  assert(localStorage.getItem('hamrah-local-v2')===before,'Recognition unexpectedly created records');
  const context=new AudioContext();
  const decoded=await context.decodeAudioData(await audio.arrayBuffer());
  const destination=context.createMediaStreamDestination();
  const source=context.createBufferSource();source.buffer=decoded;source.connect(destination);
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  try {
    navigator.mediaDevices.getUserMedia=async()=>destination.stream;
    document.querySelector('[data-panel="assistant"]').click();
    document.querySelector('#voice-start').click();
    await waitUntil(()=>!document.querySelector('#voice-stop').hidden,'Fixture recording did not start');
    source.start();await new Promise(r=>setTimeout(r,decoded.duration*1000+400));
    document.querySelector('#voice-stop').click();
    await waitUntil(()=>document.querySelector('#voice-status').textContent.includes('متن قابل‌ویرایش'),'Stop recording did not automatically produce text',{attempts:900,delayMs:100});
    assert(localStorage.getItem('hamrah-local-v2')===before,'Voice created a task without confirmation');
    assert(document.querySelector('#assistant-result').textContent.includes('خوش'),'Voice text was not delivered to the assistant');
    document.querySelector('#local-plan-cancel')?.click();
    document.querySelector('#voice-cancel').click();
    document.querySelector('[data-panel="today"]').click();
    return{actualPersianText:result,syntheticMicrophone:true,realRecorderToAssistant:true,noEffectsBeforeConfirmation:true,audioSentExternally:false};
  } finally {
    navigator.mediaDevices.getUserMedia=original;
    destination.stream.getTracks().forEach(track=>track.stop());await context.close();speech.cancel();
  }
}
