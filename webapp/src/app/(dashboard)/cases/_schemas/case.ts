import { z } from "zod";

const caseStatus = z.enum(["open", "assigned", "in_progress", "resolved"]);

export const assignCaseSchema = z.object({
  caseId: z.uuid(),
  expectedStatus: caseStatus,
  ownerId: z.uuid(),
  nextAction: z.enum([
    "cleanup",
    "further_investigation",
    "enforcement_referral",
  ]),
});

export const advanceCaseSchema = z
  .object({
    caseId: z.uuid(),
    expectedStatus: caseStatus,
    toStatus: z.enum(["in_progress", "resolved"]),
    notes: z.string().trim().max(2000),
  })
  .superRefine((value, context) => {
    if (value.toStatus === "resolved" && !value.notes) {
      context.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Resolution notes are required.",
      });
    }
  })
  .transform((value) => ({ ...value, notes: value.notes || null }));
