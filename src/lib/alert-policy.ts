import { z } from "zod";
const schema=z.object({timezone:z.string().default("Asia/Tehran"),quietStart:z.string(),quietEnd:z.string(),repeatCount:z.number().int().min(1).max(6),repeatMinutes:z.number().int().min(10).max(1440),escalation:z.boolean(),channels:z.array(z.enum(["IN_APP","PUSH","NATIVE","ALARM"])),reminderOffsets:z.array(z.number().min(0).max(10080))});
export function readAlertPolicy(value:string|null|undefined){try{return value?schema.parse(JSON.parse(value)):null;}catch{return null;}}
