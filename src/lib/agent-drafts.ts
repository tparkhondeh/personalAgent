import "server-only";
import { db } from "@/lib/db";
import { normalizePlanForReview, inspectPlan, planInstant, planOccurrences, plannedReminderTimes, type Plan, type PlanningItem } from "@/lib/agent-planner";
import { planSchema } from "@/lib/agent-plan-schema";

export class DraftError extends Error { constructor(message: string, public status = 409) { super(message); } }
export function previewPlan(plan: Plan, items: PlanningItem[], now = new Date()) {
  const inspection = inspectPlan(plan, now, items);
  const active = plan.operation === "CREATE" || plan.operation === "UPDATE";
  const channels=plan.channels.filter(c=>c!=="NATIVE" || !plan.channels.includes("ALARM"));
  const schedule = active ? plannedReminderTimes(plan,now).flatMap(entry=>channels.map(channel=>({...entry,channel}))) : [];
  if (active && plan.escalation && plan.priority !== "URGENT") inspection.questions.push("برای تشدید هشدار، اولویت را فوری انتخاب کن.");
  if (active && plan.entity === "MEETING" && plan.escalation) inspection.questions.push("تشدید هشدار فعلاً فقط برای کار فوری است؛ آن را برای جلسه خاموش کن.");
  if(plan.recurrence!=="NONE" && plan.occurrenceCount)inspection.warnings.push(`${plan.occurrenceCount} نوبت جدا ساخته می‌شود؛ ویرایش یا تکمیل هر نوبت فقط همان نوبت را تغییر می‌دهد.`);
  if(plan.channels.includes("NATIVE")&&plan.channels.includes("ALARM"))inspection.warnings.push("Alarm شامل اعلان گوشی است؛ برای هر زمان فقط یک هشدار گوشی ساخته می‌شود.");
  return { ...inspection, schedule, occurrences: planOccurrences(plan), policy: { timezone: plan.timezone, quietStart: plan.quietStart, quietEnd: plan.quietEnd, repeatCount: plan.repeatCount, repeatMinutes: plan.repeatMinutes, escalation: plan.escalation, channels: plan.channels, reminderOffsets: plan.reminderOffsets }, checkedAt: now.toISOString() };
}

export async function ownedPlanningItems(userId: string): Promise<PlanningItem[]> {
  const [tasks, meetings] = await Promise.all([
    db.task.findMany({ where: { userId, status: { in: ["TODO", "IN_PROGRESS"] } }, take: 100, orderBy: { updatedAt: "desc" } }),
    db.meeting.findMany({ where: { userId, status: "SCHEDULED" }, take: 100, orderBy: { updatedAt: "desc" } }),
  ]);
  return [...tasks.map(t => ({ ...t, updatedAt: t.updatedAt.toISOString(), entity: "TASK" as const })), ...meetings.map(m => ({ ...m, updatedAt: m.updatedAt.toISOString(), entity: "MEETING" as const }))];
}

export async function saveDraft(userId: string, conversationId: string, plan: Plan, previous?: { id: string; revision: number }, extraQuestions: string[] = []) {
  planSchema.parse(plan);
  const items = await ownedPlanningItems(userId);
  if (plan.targetId) {
    const target = items.find(i => i.id === plan.targetId && i.entity === plan.entity);
    if (!target) throw new DraftError("مورد انتخاب‌شده پیدا نشد.", 404);
    // Never accept a client/model-supplied concurrency precondition.
    plan.targetUpdatedAt = target.updatedAt ?? null;
  }
  normalizePlanForReview(plan, items);
  const preview = previewPlan(plan, items);
  preview.questions = [...new Set([...preview.questions, ...extraQuestions])];
  return db.$transaction(async tx => {
    const data = { payload: JSON.stringify(plan), preview: JSON.stringify(preview), expiresAt: new Date(Date.now() + 30 * 60_000) };
    if (previous) {
      const changed = await tx.agentDraft.updateMany({ where: { id: previous.id, userId, conversationId, revision: previous.revision, status: "PENDING", expiresAt: { gt: new Date() } }, data: { ...data, revision: { increment: 1 } } });
      if (!changed.count) throw new DraftError("این پیشنهاد تغییر کرده یا منقضی شده؛ دوباره بررسی کن.");
      return { id: previous.id, revision: previous.revision + 1, plan, preview };
    }
    // Any newly presented draft supersedes older pending proposals in this conversation.
    await tx.agentDraft.updateMany({ where: { userId, conversationId, status: "PENDING" }, data: { status: "SUPERSEDED" } });
    const draft = await tx.agentDraft.create({ data: { ...data, userId, conversationId } });
    return { id: draft.id, revision: draft.revision, plan, preview };
  });
}

export async function executeDraft(userId: string, id: string, revision: number) {
  return db.$transaction(async tx => {
    const draft = await tx.agentDraft.findFirst({ where: { id, userId } });
    if (!draft || draft.revision !== revision) throw new DraftError("نسخه پیشنهاد تغییر کرده است؛ دوباره تأیید کن.");
    if (draft.status === "EXECUTED" && draft.result) return JSON.parse(draft.result);
    if (draft.status !== "PENDING" || draft.expiresAt.getTime() <= Date.now()) throw new DraftError("پیشنهاد لغو یا منقضی شده است.");
    const plan = planSchema.parse(JSON.parse(draft.payload));
    const preview = JSON.parse(draft.preview) as ReturnType<typeof previewPlan>;
    if (preview.questions.length) throw new DraftError("ابتدا موارد نامشخص را تکمیل و پیش‌نمایش تازه را تأیید کن.", 422);
    const fresh = inspectPlan(plan);
    if (fresh.questions.length) throw new DraftError(fresh.questions[0], 422);
    if (preview.schedule.some(s => Date.parse(s.scheduledFor) <= Date.now())) throw new DraftError("زمان یکی از هشدارها گذشته؛ پیش‌نمایش تازه لازم است.");
    const claimed = await tx.agentDraft.updateMany({ where: { id, userId, revision, status: "PENDING" }, data: { status: "EXECUTING" } });
    if (!claimed.count) throw new DraftError("این پیشنهاد در حال اجراست؛ نتیجه را دوباره دریافت کن.");
    const instant = planInstant(plan.date, plan.time, plan.timezone);
    const isTask = plan.entity === "TASK";
    let entityId = plan.targetId;
    const entityIds: string[] = [];
    const policy = JSON.stringify(preview.policy);
    if (plan.operation === "CREATE") {
      if (isTask) {
        entityId = (await tx.task.create({ data: { userId, title: plan.title, category: plan.category, priority: plan.priority, dueAt: instant, alertPolicy: policy } })).id;
      } else {
        if (!instant || !plan.durationMinutes) throw new DraftError("زمان جلسه کامل نیست", 422);
        const meeting = await tx.meeting.create({ data: { userId, title: plan.title, startsAt: instant, endsAt: new Date(instant.getTime() + plan.durationMinutes * 60000), timezone: plan.timezone, alertPolicy: policy } });
        entityId = meeting.id;
        await tx.calendarEvent.create({ data: { title: meeting.title, startsAt: meeting.startsAt, endsAt: meeting.endsAt, meetingId: meeting.id } });
      }
      entityIds.push(entityId!);
      for(const occurrence of planOccurrences(plan).slice(1)){
        if(!occurrence.instant)throw new DraftError("زمان تکرار معتبر نیست",422);
        const at=new Date(occurrence.instant);
        if(isTask)entityIds.push((await tx.task.create({data:{userId,title:plan.title,category:plan.category,priority:plan.priority,dueAt:at,alertPolicy:policy}})).id);
        else {
          const meeting=await tx.meeting.create({data:{userId,title:plan.title,startsAt:at,endsAt:new Date(at.getTime()+plan.durationMinutes!*60000),timezone:plan.timezone,alertPolicy:policy}});
          entityIds.push(meeting.id);await tx.calendarEvent.create({data:{title:meeting.title,startsAt:meeting.startsAt,endsAt:meeting.endsAt,meetingId:meeting.id}});
        }
      }
    } else {
      if (!entityId || !plan.targetUpdatedAt) throw new DraftError("ابتدا مورد موردنظر را انتخاب کن.", 422);
      const current = isTask ? await tx.task.findFirst({ where: { id: entityId, userId } }) : await tx.meeting.findFirst({ where: { id: entityId, userId } });
      if (!current || current.updatedAt.toISOString() !== plan.targetUpdatedAt) throw new DraftError("این مورد از زمان پیشنهاد تغییر کرده؛ دوباره بررسی کن.");
      await tx.reminder.updateMany({ where: { userId, ...(isTask ? { taskId: entityId } : { meetingId: entityId }), status: { in: ["PENDING", "DEVICE_PENDING", "PROCESSING"] } }, data: { status: "CANCELLED" } });
      if (isTask) {
        await tx.escalationAttempt.updateMany({ where: { userId, taskId: entityId, status: { in: ["PENDING", "PROCESSING", "READY_FOR_DEVICE", "SCHEDULED"] } }, data: { status: "CANCELLED" } });
        await tx.task.update({ where: { id: entityId }, data: plan.operation === "UPDATE" ? { title: plan.title, category: plan.category, priority: plan.priority, dueAt: instant, alertPolicy: policy } : { status: plan.operation === "COMPLETE" ? "DONE" : "CANCELLED", completedAt: plan.operation === "COMPLETE" ? new Date() : null } });
      } else {
        if (plan.operation === "UPDATE") {
          if (!instant || !plan.durationMinutes) throw new DraftError("زمان جلسه کامل نیست", 422);
          const endsAt = new Date(instant.getTime() + plan.durationMinutes * 60000);
          await tx.meeting.update({ where: { id: entityId }, data: { title: plan.title, startsAt: instant, endsAt, timezone: plan.timezone, alertPolicy: policy } });
          await tx.calendarEvent.updateMany({ where: { meetingId: entityId }, data: { title: plan.title, startsAt: instant, endsAt } });
        } else {
          await tx.meeting.update({ where: { id: entityId }, data: { status: plan.operation === "COMPLETE" ? "DONE" : "CANCELLED" } });
          await tx.calendarEvent.updateMany({ where: { meetingId: entityId }, data: { source: "ARCHIVED" } });
        }
      }
    }
    if(!entityIds.length)entityIds.push(entityId!);
    const schedule = preview.schedule.filter((s, index, all) => all.findIndex(x => x.occurrence===s.occurrence && x.channel === s.channel && x.scheduledFor === s.scheduledFor) === index);
    if (schedule.length) await tx.reminder.createMany({ data: schedule.map(s => ({ userId, ...(isTask ? { taskId: entityIds[s.occurrence] } : { meetingId: entityIds[s.occurrence] }), scheduledFor: new Date(s.scheduledFor), channel: s.channel, status: ["ALARM", "NATIVE"].includes(s.channel) ? "DEVICE_PENDING" : "PENDING", idempotencyKey: `draft:${id}:${revision}:${s.occurrence}:${s.channel}:${s.scheduledFor}` })) });
    const message = plan.operation === "CREATE" ? `${entityIds.length} مورد تأییدشده ثبت شد.` : plan.operation === "UPDATE" ? "تغییرات تأییدشده ذخیره شد؛ هشدارهای قبلی سرور لغو شدند." : plan.operation === "COMPLETE" ? "مورد تکمیل شد؛ هشدارهای آینده سرور لغو شدند." : "مورد بایگانی شد؛ هشدارهای آینده سرور لغو شدند.";
    const result = { entityId, entityIds, entity: plan.entity, operation: plan.operation, registered: true, remindersScheduled: schedule.filter(s => ["IN_APP", "PUSH"].includes(s.channel)).length, devicePending: schedule.filter(s => ["ALARM", "NATIVE"].includes(s.channel)).length, message: message + (plan.operation!=="CREATE"?" لغو هشدارهای قبلی گوشی پس از همگام‌سازی اپ انجام می‌شود.":""), push: plan.channels.includes("PUSH") ? "به اشتراک و اجازه اعلان دستگاه نیاز دارد؛ تحویل هنوز تأیید نشده است." : "درخواست نشده", calls: "غیرفعال", sms: "غیرفعال" };
    await tx.auditLog.create({ data: { userId, action: `AGENT_${plan.operation}`, entityType: plan.entity, entityId, source: "CONFIRMED_AGENT", result: JSON.stringify({ draftId: id, revision, reminders: schedule.length }) } });
    await tx.agentDraft.update({ where: { id }, data: { status: "EXECUTED", result: JSON.stringify(result) } });
    return result;
  });
}
