import { z } from "zod";

export const reviewIncidentSchema = z.object({
  incidentId: z.uuid(),
  decision: z.enum(["confirmed", "dismissed", "needs_investigation"]),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => value || null),
});
