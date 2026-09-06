import { describe, expect, it } from "vitest";
import { encodeVoiceWav, validateVoiceWav, MAX_VOICE_BYTES } from "./voice-audio";
describe("bounded in-memory voice contract",()=>{
  it("round trips strict mono PCM16 16kHz",()=>expect(validateVoiceWav(encodeVoiceWav(new Float32Array(16000)))).toBe(true));
  it("caps a recording at 60 seconds",()=>expect(encodeVoiceWav(new Float32Array(16000*70))).toHaveLength(MAX_VOICE_BYTES));
  it.each([0,1,12,20,22,24,28,32,34,36,40])("rejects a corrupt header at %s",position=>{const bytes=encodeVoiceWav(new Float32Array(16000));bytes[position]^=255;expect(validateVoiceWav(bytes)).toBe(false);});
  it("rejects invalid, truncated and tiny audio",()=>{expect(validateVoiceWav(new Uint8Array(500))).toBe(false);expect(validateVoiceWav(encodeVoiceWav(new Float32Array(16000)).slice(0,-2))).toBe(false);});
});
