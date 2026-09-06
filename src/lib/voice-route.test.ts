import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({session:true,enabled:true,reserved:true}));
vi.mock("@/lib/api",()=>({requireApiSession:async()=>state.session?{user:{id:"synthetic-user"}}:null,jsonError:(error:string,status:number)=>Response.json({error},{status})}));
vi.mock("@/lib/ai-budget",()=>({aiReadiness:()=>({enabled:state.enabled,voiceModel:"synthetic-model"}),reserveAiRequest:async()=>state.reserved}));
vi.mock("@/lib/rate-limit",()=>({guardUserRateLimit:()=>null}));
import { POST } from "@/app/api/agent/transcribe/route";
import { encodeVoiceWav } from "./voice-audio";
function request(options:RequestInit={}){return new Request("http://localhost:3001/api/agent/transcribe",{method:"POST",headers:{origin:"http://localhost:3001","content-type":"audio/wav","x-audio-consent":"openai"},body:new Blob([encodeVoiceWav(Float32Array.from({length:16000},(_,i)=>Math.sin(i/5)*.2)) as BlobPart]),...options});}
beforeEach(()=>{state.session=true;state.enabled=true;state.reserved=true;vi.restoreAllMocks();});
describe("voice server contract, synthetic provider only",()=>{
  it("returns editable text without executing any planning operation",async()=>{const upstream=vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({text:"فردا ساعت پنج عصر جلسه دارم"}));const response=await POST(request());expect(response.status).toBe(200);expect((await response.json()).data.text).toContain("جلسه");expect(upstream).toHaveBeenCalledOnce();expect(upstream.mock.calls[0][0]).toBe("https://api.openai.com/v1/audio/transcriptions");});
  it("rejects another origin before sending audio",async()=>{const upstream=vi.spyOn(globalThis,"fetch");expect((await POST(request({headers:{origin:"https://wrong.example.invalid"}}))).status).toBe(403);expect(upstream).not.toHaveBeenCalled();});
  it("requires login",async()=>{state.session=false;expect((await POST(request())).status).toBe(401);});
  it("requires explicit audio consent",async()=>expect((await POST(request({headers:{origin:"http://localhost:3001","content-type":"audio/wav"}}))).status).toBe(422));
  it("does not upload when external activation is missing",async()=>{state.enabled=false;const upstream=vi.spyOn(globalThis,"fetch");expect((await POST(request())).status).toBe(503);expect(upstream).not.toHaveBeenCalled();});
  it("enforces the persistent daily reservation",async()=>{state.reserved=false;const upstream=vi.spyOn(globalThis,"fetch");expect((await POST(request())).status).toBe(429);expect(upstream).not.toHaveBeenCalled();});
  it("rejects a misleading or invalid audio file",async()=>expect((await POST(request({body:"not audio"}))).status).toBe(422));
  it("handles silence and provider failure without exposing provider details",async()=>{vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(Response.json({text:" "})).mockResolvedValueOnce(Response.json({error:{message:"private-provider-detail"}},{status:500}));expect((await POST(request())).status).toBe(422);const response=await POST(request());expect(response.status).toBe(502);expect(await response.text()).not.toContain("private-provider-detail");});
  it("handles disconnects",async()=>{vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("internal private detail"));const response=await POST(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("internal private detail");});
});
