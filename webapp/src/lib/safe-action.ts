import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";

export const actionClient = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({ actionName: z.string().min(1) });
  },
  handleServerError(error) {
    console.error("Server action failed", error);
    return "The action could not be completed.";
  },
});
