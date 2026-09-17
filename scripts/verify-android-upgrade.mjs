// Read-only identity gate. Passing this gate is NOT proof of device-data migration.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function parseApkIdentity(badging, certificate, sha256) {
  const info=badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m);
  const certs=[...certificate.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})$/gmi)].map(x=>x[1].toLowerCase()).sort();
  if(!info||!certs.length||!Number.isSafeInteger(Number(info[2]))||!/^[a-f0-9]{64}$/.test(sha256)) throw Error("Invalid verified APK metadata");
  return {packageId:info[1],versionCode:Number(info[2]),versionName:info[3],certificates:certs,sha256};
}
export function compareApkUpgrade(baseline,candidate) {
  const blockers=[];
  if(baseline.packageId!==candidate.packageId)blockers.push("package-id-differs");
  if(JSON.stringify(baseline.certificates)!==JSON.stringify(candidate.certificates))blockers.push("signing-certificate-differs");
  if(candidate.versionCode<=baseline.versionCode)blockers.push("version-code-not-newer");
  return {compatibleIdentity:blockers.length===0,blockers,baseline,candidate,dataPreservationTested:false};
}
export async function inspectApk(file,{sdkRoot,javaHome,buildTools="35.0.0"}) {
  if(!sdkRoot||!javaHome||!/^[\d.]+$/.test(buildTools))throw Error("Explicit installed SDK and Java paths required");
  const apk=await realpath(file),base=path.join(sdkRoot,"build-tools",buildTools),exe=process.platform==="win32"?".exe":"";
  const run=(command,args)=>execFileSync(command,args,{encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","pipe"],timeout:60000,maxBuffer:1024*1024});
  // apksigner must exit successfully; a printed fingerprint without signature verification is insufficient.
  const certificate=run(path.join(javaHome,"bin","java"+exe),["-jar",path.join(base,"lib","apksigner.jar"),"verify","--print-certs",apk]);
  const badging=run(path.join(base,"aapt"+exe),["dump","badging",apk]);
  const sha=createHash("sha256").update(await readFile(apk)).digest("hex");
  return parseApkIdentity(badging,certificate,sha);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [from,to]=process.argv.slice(2),options={sdkRoot:process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME,javaHome:process.env.JAVA_HOME};
    const result=compareApkUpgrade(await inspectApk(from,options),await inspectApk(to,options));
    console.log(JSON.stringify(result,null,2)); if(!result.compatibleIdentity)process.exitCode=2;
  }catch{console.error("APK identity verification failed; no install, uninstall or signing performed.");process.exitCode=1;}
}
