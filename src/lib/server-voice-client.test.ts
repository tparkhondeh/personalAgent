import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeOnTia } from "./server-voice-client";
import { validateVoiceWav } from "./voice-audio";
const state={duration:1};
beforeEach(()=>{
  state.duration=1;
  vi.stubGlobal("AudioContext",class{async decodeAudioData(){return{duration:state.duration};}async close(){}});
  vi.stubGlobal("OfflineAudioContext",class{createBufferSource(){return{connect(){},start(){}};}async startRendering(){return{getChannelData:()=>Float32Array.from({length:16000},(_,i)=>Math.sin(i/5)*.2)};}});
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("opt-in own-server voice client",()=>{
  it("sends valid bounded WAV only to the authenticated same-origin route",async()=>{const fetcher=vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({data:{text:"جلسه با تیم فروش"}}));expect(await transcribeOnTia(new Blob(['synthetic']),new AbortController().signal,()=>{})).toBe("جلسه با تیم فروش");expect(fetcher.mock.calls[0][0]).toBe("/api/agent/local-transcribe");const options=fetcher.mock.calls[0][1]!;expect(options.credentials).toBe("same-origin");expect(options.headers).toMatchObject({'x-audio-consent':'tia-server'});expect(validateVoiceWav(options.body as Uint8Array)).toBe(true);});
  it("does not upload cancelled, overlong or empty clips",async()=>{const fetcher=vi.spyOn(globalThis,"fetch");const controller=new AbortController();controller.abort();await expect(transcribeOnTia(new Blob(['x']),controller.signal,()=>{})).rejects.toThrow();state.duration=65;await expect(transcribeOnTia(new Blob(['x']),new AbortController().signal,()=>{})).rejects.toThrow('یک دقیقه');await expect(transcribeOnTia(new Blob([]),new AbortController().signal,()=>{})).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();});
  it("does not substitute an external provider after failure",async()=>{const fetcher=vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({error:"سرور در دسترس نیست"},{status:503}));await expect(transcribeOnTia(new Blob(['x']),new AbortController().signal,()=>{})).rejects.toThrow('سرور');expect(fetcher).toHaveBeenCalledOnce();});
});
