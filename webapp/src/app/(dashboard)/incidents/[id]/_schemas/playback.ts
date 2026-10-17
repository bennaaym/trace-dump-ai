import { z } from "zod";

export const preparePlaybackSchema = z.object({
  incidentId: z.uuid(),
});
