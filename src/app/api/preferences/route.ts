import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { userPreferenceInputSchema } from "@/lib/validation";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { normalizeReminderOffsets, parseStoredReminderOffsets, serializeReminderOffsets } from "@/lib/reminder-offsets";

function serializePreference(preference: { timezone: string; locale: string; workdayStartsAt: string; workdayEndsAt: string; workingDays: string; defaultReminderMins: number; defaultReminderOffsets: string; quietHoursStartsAt: string; quietHoursEndsAt: string; planningProfile: string | null; urgentEscalationEnabled: boolean; urgentRepeatMinutes: number; urgentMaxRepeats: number; androidAlarmEnabled: boolean; highPriorityEnabled: boolean; smsEscalationEnabled: boolean; callEscalationEnabled: boolean; emergencyContactName: string | null; emergencyPhone: string | null }) {
  return { ...preference, workingDays: preference.workingDays.split(",").filter(Boolean), defaultReminderOffsets: parseStoredReminderOffsets(preference.defaultReminderOffsets, preference.defaultReminderMins), planningProfile: preference.planningProfile || "BALANCED" };
}

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id } });
  return Response.json({ data: preference ? serializePreference(preference) : null });
}

export async function PUT(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = userPreferenceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("تنظیمات واردشده معتبر نیست", 422, parsed.error.flatten());
  const { workingDays, defaultReminderOffsets, defaultReminderMins, ...values } = parsed.data;
  const reminderOffsets = normalizeReminderOffsets(defaultReminderOffsets, defaultReminderMins);
  const legacyReminderMinutes = Math.min(...reminderOffsets);
  const preference = await db.$transaction(async (tx) => {
    const saved = await tx.userPreference.upsert({
      where: { userId: session.user.id },
      update: { ...values, workingDays: workingDays.join(","), defaultReminderMins: legacyReminderMinutes, defaultReminderOffsets: serializeReminderOffsets(reminderOffsets) },
      create: { ...values, workingDays: workingDays.join(","), defaultReminderMins: legacyReminderMinutes, defaultReminderOffsets: serializeReminderOffsets(reminderOffsets), userId: session.user.id },
    });
    await tx.escalationAttempt.updateMany({ where: { userId: session.user.id, status: { in: ["PENDING", "PROCESSING", "READY_FOR_DEVICE", "SCHEDULED"] } }, data: { status: "CANCELLED" } });
    const { emergencyPhone, ...auditSafeInput } = parsed.data;
    await tx.auditLog.create({ data: { userId: session.user.id, action: "PREFERENCES_UPDATED", entityType: "UserPreference", entityId: saved.id, input: JSON.stringify({ ...auditSafeInput, emergencyPhone: emergencyPhone ? "[REDACTED]" : null }) } });
    return saved;
  });
  return Response.json({ data: serializePreference(preference) });
}
