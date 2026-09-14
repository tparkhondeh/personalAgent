import { expect,it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareStoreAssets } from "./prepare-store-assets.mjs";
it("prepares draft assets without claiming screenshots or signing are release-ready",async()=>{
  const result=await prepareStoreAssets(await mkdtemp(path.join(tmpdir(),"tia-store-art-test-")));
  expect(result.approvedForSubmission).toBe(false);
  expect(result.files[0]).toMatchObject({width:512,height:512});
  expect(result.files[1]).toMatchObject({width:1024,height:500});
  expect(result.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256))).toBe(true);
  expect(result.files.filter(f=>f.sourceApk).every(f=>f.finalStoreScreenshot===false)).toBe(true);
},20000);
