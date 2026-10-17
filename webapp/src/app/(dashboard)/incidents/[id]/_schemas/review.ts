import { z } from "zod";

export const reviewIncidentSchema = z
  .object({
    incidentId: z.uuid(),
    expectedStatus: z.enum([
      "pending_review",
      "confirmed",
      "dismissed",
      "needs_investigation",
    ]),
    decision: z.enum(["confirmed", "dismissed", "needs_investigation"]),
    notes: z.string().trim().max(2000),
  })
  .superRefine((value, context) => {
    if (value.expectedStatus !== "pending_review" && !value.notes) {
      context.addIssue({
        code: "custom",
        path: ["notes"],
        message: "A reason is required to change an existing decision.",
      });
    }
    if (value.expectedStatus === value.decision) {
      context.addIssue({
        code: "custom",
        path: ["decision"],
        message: "Choose a different review decision.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    notes: value.notes || null,
  }));
