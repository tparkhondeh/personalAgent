import { z } from "zod";

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "عنوان کار الزامی است").max(180),
  description: z.string().trim().max(3000).optional(),
  category: z.enum(["PERSONAL", "WORK"]).default("PERSONAL"),
  priority: z.enum(["URGENT", "IMPORTANT", "NORMAL"]).default("NORMAL"),
  startAt: z.iso.datetime().optional(),
  dueAt: z.iso.datetime().optional(),
  estimatedMinutes: z.number().int().min(5).max(1440).optional(),
  recurrenceRule: z.string().max(500).optional(),
  reminderMinutes: z.number().int().min(0).max(10080).default(15),
});

export const taskUpdateSchema = taskInputSchema.partial().extend({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
});

export const meetingInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(3000).optional(),
  agenda: z.string().trim().max(5000).optional(),
  attendees: z.array(z.string().trim().max(200)).max(100).default([]),
  location: z.string().trim().max(500).optional(),
  meetingUrl: z.url().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string().max(100).default("Asia/Tehran"),
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), { message: "زمان پایان باید بعد از شروع باشد", path: ["endsAt"] });
