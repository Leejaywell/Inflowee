import { z } from "zod";

export const createSpaceSchema = z.object({
  name: z.string().trim().min(2, "Space name must be at least 2 characters."),
  description: z
    .string()
    .trim()
    .max(240, "Description must be 240 characters or fewer.")
    .optional()
    .transform((value) => value || undefined),
});

export const createTaskSchema = z.object({
  spaceId: z.string().trim().min(1, "Select a space."),
  title: z.string().trim().min(2, "Task title must be at least 2 characters."),
  taskType: z.enum(["TOPIC", "QUESTION"]),
  userPrompt: z
    .string()
    .trim()
    .min(8, "Prompt must be at least 8 characters.")
    .max(600, "Prompt must be 600 characters or fewer."),
});
