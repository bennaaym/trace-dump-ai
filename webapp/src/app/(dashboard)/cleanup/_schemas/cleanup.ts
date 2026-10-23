import { z } from "zod";

export const cleanupMutationSchema = z
  .object({
    caseId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    action: z.enum([
      "assign_cleanup",
      "add_note",
      "mark_cleaned",
      "reopen",
      "resolve",
      "manual_recheck",
      "acknowledge_notification",
    ]),
    notificationId: z.uuid().optional(),
    teamId: z.uuid().optional(),
    slaHours: z.union([z.literal(24), z.literal(48), z.literal(72)]).optional(),
    instructions: z.string().trim().max(4000).optional(),
    notes: z.string().trim().max(4000).optional(),
    resolutionOutcome: z
      .enum(["cleanup_completed", "site_already_cleared"])
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "assign_cleanup") {
      if (!value.teamId) {
        context.addIssue({
          code: "custom",
          path: ["teamId"],
          message: "Choose a cleanup team.",
        });
      }
      if (!value.slaHours) {
        context.addIssue({
          code: "custom",
          path: ["slaHours"],
          message: "Choose a resolution time.",
        });
      }
    }
    if (
      ["add_note", "reopen", "resolve"].includes(value.action) &&
      !value.notes
    ) {
      context.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Notes are required for this action.",
      });
    }
    if (value.action === "resolve" && !value.resolutionOutcome) {
      context.addIssue({
        code: "custom",
        path: ["resolutionOutcome"],
        message: "Choose a resolution outcome.",
      });
    }
    if (value.action === "acknowledge_notification" && !value.notificationId) {
      context.addIssue({
        code: "custom",
        path: ["notificationId"],
        message: "Choose a notification to acknowledge.",
      });
    }
  });
