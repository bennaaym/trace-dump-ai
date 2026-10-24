import { z } from "zod";

export const simulationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("stop"), runId: z.uuid() }),
  z.object({
    action: z.literal("switch_scene"),
    caseId: z.uuid(),
    sceneSourceId: z.uuid(),
  }),
  z.object({ action: z.literal("run_scene_check"), caseId: z.uuid() }),
]);
