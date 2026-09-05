export type EscalationLevel = "IN_APP_PUSH" | "ANDROID_ALARM" | "HIGH_PRIORITY" | "SMS_MOCK" | "CALL" | "CALL_MOCK";

export type EscalationPolicy = {
  urgentEscalationEnabled: boolean;
  urgentRepeatMinutes: number;
  urgentMaxRepeats: number;
  androidAlarmEnabled: boolean;
  highPriorityEnabled: boolean;
  smsEscalationEnabled: boolean;
  callEscalationEnabled: boolean;
};

export type EscalationPlanEntry = {
  level: EscalationLevel;
  attemptNumber: number;
  scheduledFor: Date;
  provider: "WEB" | "ANDROID" | "MOCK" | "EXTERNAL";
};

export const defaultEscalationPolicy: EscalationPolicy = {
  urgentEscalationEnabled: true,
  urgentRepeatMinutes: 15,
  urgentMaxRepeats: 3,
  androidAlarmEnabled: true,
  highPriorityEnabled: true,
  smsEscalationEnabled: false,
  callEscalationEnabled: false,
};

export function buildEscalationPlan(anchor: Date, policy: EscalationPolicy): EscalationPlanEntry[] {
  if (!policy.urgentEscalationEnabled) return [];
  const repeatMinutes = Math.max(10, Math.min(policy.urgentRepeatMinutes, 1440));
  const repeatCount = Math.max(1, Math.min(policy.urgentMaxRepeats, 6));
  const after = (step: number) => new Date(anchor.getTime() + step * repeatMinutes * 60_000);
  const plan: EscalationPlanEntry[] = [{ level: "IN_APP_PUSH", attemptNumber: 1, scheduledFor: anchor, provider: "WEB" }];

  if (policy.androidAlarmEnabled) {
    for (let attempt = 1; attempt <= repeatCount; attempt++) {
      plan.push({ level: "ANDROID_ALARM", attemptNumber: attempt, scheduledFor: after(attempt), provider: "ANDROID" });
    }
  }

  let nextStep = repeatCount + 1;
  if (policy.highPriorityEnabled) {
    plan.push({ level: "HIGH_PRIORITY", attemptNumber: 1, scheduledFor: after(nextStep), provider: "WEB" });
    nextStep++;
  }
  if (policy.smsEscalationEnabled) {
    plan.push({ level: "SMS_MOCK", attemptNumber: 1, scheduledFor: after(nextStep), provider: "MOCK" });
    nextStep++;
  }
  if (policy.callEscalationEnabled) {
    plan.push({ level: "CALL", attemptNumber: 1, scheduledFor: after(nextStep), provider: "EXTERNAL" });
  }
  return plan;
}

export function escalationIdempotencyKey(userId: string, taskId: string, taskVersion: Date, entry: Pick<EscalationPlanEntry, "level" | "attemptNumber">) {
  return `${userId}:${taskId}:${taskVersion.toISOString()}:${entry.level}:${entry.attemptNumber}`;
}

export function nativeNotificationId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0) || 1;
}

export function isUrgentOverdueTask(task: { priority: string; status: string; dueAt: Date | string | null }, now = new Date()) {
  return task.priority === "URGENT" && (task.status === "TODO" || task.status === "IN_PROGRESS") && Boolean(task.dueAt) && new Date(task.dueAt!).getTime() <= now.getTime();
}
