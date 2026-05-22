import {
  recommendSourceBundles,
  type RecommendSourceBundlesOptions,
  understandTaskIntent,
  type SourceBundle,
  type TaskProfile,
} from "@/lib/ai";
import {
  getTaskById,
  listRecommendationBundlesByTask,
  replaceRecommendationBundles,
  saveTaskProfile,
  type Store,
} from "@/lib/store";

export type RefreshTaskIntelligenceOptions = {
  understandTaskIntentImpl?: (prompt: string) => Promise<TaskProfile>;
  recommendSourceBundlesImpl?: (
    prompt: string,
    options?: RecommendSourceBundlesOptions,
  ) => Promise<SourceBundle[]>;
  saveTaskProfileImpl?: (
    store: Store,
    taskId: string,
    profile: TaskProfile,
  ) => Promise<void>;
  replaceRecommendationBundlesImpl?: (
    store: Store,
    taskId: string,
    bundles: SourceBundle[],
  ) => Promise<void>;
};

export async function refreshTaskIntelligence(
  store: Store,
  taskId: string,
  options: RefreshTaskIntelligenceOptions = {},
) {
  const task = await getTaskById(store, taskId);

  if (!task) {
    throw new Error(`Task ${taskId} not found.`);
  }

  const understand = options.understandTaskIntentImpl ?? understandTaskIntent;
  const recommend = options.recommendSourceBundlesImpl ?? recommendSourceBundles;
  const saveProfile = options.saveTaskProfileImpl ?? saveTaskProfile;
  const replaceBundles =
    options.replaceRecommendationBundlesImpl ?? replaceRecommendationBundles;
  const previousBundles = await listRecommendationBundlesByTask(store, taskId);

  const profile = await understand(task.userPrompt);
  const bundles = await recommend(task.userPrompt, { bypassCache: true });

  try {
    await replaceBundles(store, taskId, bundles);
  } catch (error) {
    await replaceRecommendationBundles(store, taskId, previousBundles);
    throw error;
  }

  try {
    await saveProfile(store, taskId, profile);
  } catch (error) {
    await replaceRecommendationBundles(store, taskId, previousBundles);
    throw error;
  }

  return { profile, bundles };
}
