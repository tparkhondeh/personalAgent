import { readAlertPolicy } from "@/lib/alert-policy";
import { buildReminderSchedule } from "@/lib/reminder-offsets";
import { dateParts, planPersian, plannedReminderTimes } from "@/lib/agent-planner";

// A manual offset is not consent to an agent escalation/channel policy.
export function manualReminderPolicy(minutes: number, existing?: string | null) {
  const policy = readAlertPolicy(existing);
  return JSON.stringify(policy ? { ...policy, reminderOffsets: [minutes] } : { kind: "MANUAL_REMINDERS", reminderOffsets: [minutes] });
}

function manualOffsets(value: string | null | undefined): number[] | null {
  try {
    const policy = JSON.parse(value ?? "null");
    const offsets: unknown = policy?.reminderOffsets;
    if (policy?.kind === "MANUAL_REMINDERS" && Array.isArray(offsets) && offsets.length === 1 && Number.isInteger(offsets[0]) && offsets[0] >= 0 && offsets[0] <= 10080) return offsets;
  } catch { /* Malformed or legacy policies retain the existing default fallback. */ }
  return null;
}

export function storedReminderSchedule(reference:Date, policyText:string|null|undefined, defaults:number[], override?:number){
  const policy=readAlertPolicy(policyText);
  if(!policy)return buildReminderSchedule(reference,override===undefined?(manualOffsets(policyText)??defaults):[override]).map(r=>({scheduledFor:r.scheduledFor,channel:"PUSH",status:"PENDING"}));
  const plan=planPersian("یادآوری",{timezone:policy.timezone}).plan!;
  Object.assign(plan,dateParts(reference,policy.timezone),{reminderOffsets:override===undefined?policy.reminderOffsets:[override],quietStart:"00:00",quietEnd:"00:00"});
  const channels=policy.channels.filter(c=>c!=="NATIVE"||!policy.channels.includes("ALARM"));
  return plannedReminderTimes(plan).flatMap(r=>channels.map(channel=>({scheduledFor:new Date(r.scheduledFor),channel,status:channel==="ALARM"||channel==="NATIVE"?"DEVICE_PENDING":"PENDING"})));
}
