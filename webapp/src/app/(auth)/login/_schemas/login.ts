import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(1024, "Password is too long."),
});
