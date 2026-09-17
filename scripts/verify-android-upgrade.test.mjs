import { describe,expect,it } from "vitest";
import {compareApkUpgrade,parseApkIdentity} from "./verify-android-upgrade.mjs";
const cert="a".repeat(64),sha="b".repeat(64);
function identity(version=40,packageId="ir.example.tia",signature=cert){return parseApkIdentity(`package: name='${packageId}' versionCode='${version}' versionName='1.0.${version}'`,`Signer #1 certificate SHA-256 digest: ${signature}`,sha);}
describe("read-only Android upgrade gate",()=>{
  it("permits only same package/signature with a newer version, not a data-safety claim",()=>{
    expect(compareApkUpgrade(identity(),identity(41))).toMatchObject({compatibleIdentity:true,blockers:[],dataPreservationTested:false});
  });
  it("rejects a renamed per-run package even with the same certificate",()=>{
    expect(compareApkUpgrade(identity(),identity(41,"ir.example.tia41")).blockers).toEqual(["package-id-differs"]);
  });
  it("rejects another signer even when version/name match",()=>{
    expect(compareApkUpgrade(identity(),identity(41,"ir.example.tia","c".repeat(64))).blockers).toEqual(["signing-certificate-differs"]);
  });
  it.each([39,40])("rejects downgrade or same version %s",version=>{
    expect(compareApkUpgrade(identity(),identity(version)).blockers).toEqual(["version-code-not-newer"]);
  });
  it.each(["","Signer #1 certificate SHA-256 digest: invalid","Signer #1 certificate SHA-1 digest: "+cert])("refuses missing/invalid SHA256 signer metadata",value=>{
    expect(()=>parseApkIdentity("package: name='ir.example.tia' versionCode='41' versionName='x'",value,sha)).toThrow();
  });
  it("compares the entire signer set, not just the first signer",()=>{
    const candidate=identity(41); candidate.certificates.push("c".repeat(64));
    expect(compareApkUpgrade(identity(),candidate).compatibleIdentity).toBe(false);
  });
});
