"use client";
import { cancelApprovedDeviceReminders } from "./approved-device-reminders";
import { cancelNativeEscalationAlarms, isNativeAndroid } from "./native-escalations";

// Receipts arrive in the already-successful mutation response, not another fetch.
export async function cancelDeviceRemindersFromResponse(body: unknown) {
  if (!isNativeAndroid()) return;
  const meta = body && typeof body === "object" && "meta" in body ? body.meta : null;
  if (!meta || typeof meta !== "object" || !("cancelledDeviceReminderIds" in meta) || !("cancelledEscalationAttemptIds" in meta)) throw new Error("Missing device cancellation receipt");
  const reminders = meta.cancelledDeviceReminderIds, escalations = meta.cancelledEscalationAttemptIds;
  const valid = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.every(id => typeof id === "string" && id.length > 0);
  if (!valid(reminders) || !valid(escalations)) throw new Error("Invalid device cancellation receipt");
  const results = await Promise.allSettled([cancelApprovedDeviceReminders(reminders), cancelNativeEscalationAlarms(escalations)]);
  if (results.some(result => result.status === "rejected")) throw new Error("Device cancellation needs retry");
}
