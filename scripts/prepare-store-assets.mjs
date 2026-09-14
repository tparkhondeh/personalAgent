// Draft artwork only. Reuses the established vector identity; never signs/publishes.
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { tiaIconSvg } from "./tia-logo.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
export async function prepareStoreAssets(parent = path.join(project, "artifacts", "store-drafts")) {
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "tia-"));
  const icon = Buffer.from(tiaIconSvg());
  await sharp(icon).resize(512, 512).flatten({background:"#f7f7ff"}).png().toFile(path.join(directory,"icon-512.png"));
  const feature = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><linearGradient id="bg"><stop stop-color="#f7f7ff"/><stop offset="1" stop-color="#e3f5ef"/></linearGradient></defs><rect width="1024" height="500" fill="url(#bg)"/><text x="225" y="303" font-family="Arial,sans-serif" font-size="160" font-weight="600" fill="#344767">tia</text></svg>`);
  const mark=await sharp(icon).resize(300,300).png().toBuffer();
  await sharp(feature).composite([{input:mark,left:565,top:100}]).flatten({background:"#f7f7ff"}).png().toFile(path.join(directory,"feature-1024x500.png"));
  const files=[];
  for(const name of ["icon-512.png","feature-1024x500.png"]){
    const bytes=await readFile(path.join(directory,name)); const info=await sharp(bytes).metadata();
    files.push({name,width:info.width,height:info.height,sha256:createHash("sha256").update(bytes).digest("hex")});
  }
  // Optional, visibly reviewed screenshots of the exact preview APK, not the final binary.
  for(const mode of ["local-fallback","dark-local"]){
    const source=path.join(project,"artifacts/completed-items/release-evidence",`api-36-android-36-stable-${mode}.png`);
    try {
      const bytes=await readFile(source); const name=`preview40-${mode}.png`;
      await copyFile(source,path.join(directory,name));
      files.push({name,sourceApk:"34180286b90008498c839f3ec3b4fd72749c750a",sha256:createHash("sha256").update(bytes).digest("hex"),finalStoreScreenshot:false});
    } catch(error){ if(error.code!=="ENOENT")throw error; }
  }
  const report={directory,draft:true,approvedForSubmission:false,files};
  await writeFile(path.join(directory,"manifest.json"),JSON.stringify(report,null,2),{flag:"wx"});
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(JSON.stringify(await prepareStoreAssets()));
