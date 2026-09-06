import { readAlertPolicy } from "@/lib/alert-policy";
import { buildReminderSchedule } from "@/lib/reminder-offsets";
import { dateParts, planPersian, plannedReminderTimes } from "@/lib/agent-planner";

export function storedReminderSchedule(reference:Date, policyText:string|null|undefined, defaults:number[], override?:number){
  const policy=readAlertPolicy(policyText);
  if(!policy)return buildReminderSchedule(reference,override===undefined?defaults:[override]).map(r=>({scheduledFor:r.scheduledFor,channel:"PUSH",status:"PENDING"}));
  const plan=planPersian("یادآوری",{timezone:policy.timezone}).plan!;
  Object.assign(plan,dateParts(reference,policy.timezone),{reminderOffsets:override===undefined?policy.reminderOffsets:[override],quietStart:"00:00",quietEnd:"00:00"});
  const channels=policy.channels.filter(c=>c!=="NATIVE"||!policy.channels.includes("ALARM"));
  return plannedReminderTimes(plan).flatMap(r=>channels.map(channel=>({scheduledFor:new Date(r.scheduledFor),channel,status:channel==="ALARM"||channel==="NATIVE"?"DEVICE_PENDING":"PENDING"})));
}
