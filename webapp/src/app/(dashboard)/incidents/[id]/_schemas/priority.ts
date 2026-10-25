import { z } from "zod";
export const prioritySchema = z.object({
  incidentId: z.uuid(),
  level: z.enum(["high", "medium", "low"]).nullable(),
  reason: z.string().trim().min(1).max(1000),
  expectedId: z.uuid().nullable(),
});
