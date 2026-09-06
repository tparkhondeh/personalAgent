export const MAX_VOICE_BYTES = 1_920_044;
export function voiceHasSignal(bytes:Uint8Array){
  if(!validateVoiceWav(bytes))return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let peak=0,energy=0;
  for(let offset=44;offset<bytes.length;offset+=2){const value=view.getInt16(offset,true);peak=Math.max(peak,Math.abs(value));energy+=value*value;}
  return peak>=128 && Math.sqrt(energy/((bytes.length-44)/2))>=20;
}
export function validateVoiceWav(bytes: Uint8Array) {
  if (bytes.length < 3244 || bytes.length > MAX_VOICE_BYTES) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number, value: string) => [...value].every((c, i) => bytes[at + i] === c.charCodeAt(0));
  return tag(0, "RIFF") && tag(8, "WAVE") && tag(12, "fmt ") && tag(36, "data") &&
    view.getUint32(4, true) === bytes.length - 8 && view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1 && view.getUint32(24, true) === 16000 &&
    view.getUint32(28, true) === 32000 && view.getUint16(32, true) === 2 && view.getUint16(34, true) === 16 &&
    view.getUint32(40, true) === bytes.length - 44 && (bytes.length - 44) % 2 === 0;
}
export function encodeVoiceWav(samples: Float32Array) {
  const length = Math.min(samples.length, 60 * 16000), buffer = new ArrayBuffer(44 + length * 2), view = new DataView(buffer);
  const tag = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  tag(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); tag(8,"WAVE"); tag(12,"fmt "); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,16000,true); view.setUint32(28,32000,true); view.setUint16(32,2,true); view.setUint16(34,16,true); tag(36,"data"); view.setUint32(40,length*2,true);
  for(let i=0;i<length;i++) view.setInt16(44+i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);
  return new Uint8Array(buffer);
}
