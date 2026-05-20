"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSpaceRecord, createTaskRecord, defaultStore } from "@/lib/store";
import { createSpaceSchema, createTaskSchema } from "@/lib/validation";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export async function createSpace(formData: FormData) {
  const parsed = createSpaceSchema.safeParse({
    name: getString(formData, "name"),
    description: getString(formData, "description"),
  });

  if (!parsed.success) {
    redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid space input.")}`);
  }

  createSpaceRecord(defaultStore, parsed.data);

  revalidatePath("/");
  redirect("/?created=space");
}

export async function createTask(formData: FormData) {
  const parsed = createTaskSchema.safeParse({
    spaceId: getString(formData, "spaceId"),
    title: getString(formData, "title"),
    taskType: getString(formData, "taskType"),
    userPrompt: getString(formData, "userPrompt"),
  });

  if (!parsed.success) {
    redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid task input.")}`);
  }

  createTaskRecord(defaultStore, parsed.data);

  revalidatePath("/");
  redirect("/?created=task");
}
