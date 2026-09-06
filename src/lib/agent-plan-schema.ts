import { z } from "zod";
export const planSchema = z.object({
  operation: z.enum(["CREATE", "UPDATE", "COMPLETE", "DELETE"]), entity: z.enum(["TASK", "MEETING"]),
  targetId: z.string().max(150).nullable(), targetUpdatedAt: z.iso.datetime().nullable(),
  title: z.string().trim().max(180), category: z.enum(["PERSONAL", "WORK"]), priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]),
  date: z.string().max(10), time: z.string().max(5), timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }),
  durationMinutes: z.number().int().min(5).max(1440).nullable(), recurrence: z.enum(["NONE", "DAILY", "WEEKLY"]),
  occurrenceCount: z.number().int().min(2).max(12).nullable().default(null),
  reminderOffsets: z.array(z.number().int().min(0).max(10080)).max(8).refine(v => new Set(v).size === v.length),
  channels: z.array(z.enum(["IN_APP", "PUSH", "NATIVE", "ALARM"])).max(4).refine(v => new Set(v).size === v.length),
  repeatCount: z.number().int().min(1).max(6), repeatMinutes: z.number().int().min(10).max(1440),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  escalation: z.boolean(), defaults: z.array(z.string().max(200)).max(10),
}).strict();
