import {
  recommendSourceBundles,
  type RecommendSourceBundlesOptions,
  understandTopicIntent,
  type SourceBundle,
  type TopicProfile,
} from "@/lib/ai";
import {
  getTopicById,
  listRecommendationBundlesByTopic,
  replaceRecommendationBundles,
  saveTopicProfile,
  type Store,
} from "@/lib/store";

export type RefreshTopicIntelligenceOptions = {
  understandTopicIntentImpl?: (prompt: string) => Promise<TopicProfile>;
  recommendSourceBundlesImpl?: (
    prompt: string,
    options?: RecommendSourceBundlesOptions,
  ) => Promise<SourceBundle[]>;
  saveTopicProfileImpl?: (
    store: Store,
    topicId: string,
    profile: TopicProfile,
  ) => Promise<void>;
  replaceRecommendationBundlesImpl?: (
    store: Store,
    topicId: string,
    bundles: SourceBundle[],
  ) => Promise<void>;
};

export async function refreshTopicIntelligence(
  store: Store,
  topicId: string,
  options: RefreshTopicIntelligenceOptions = {},
) {
  const topic = await getTopicById(store, topicId);

  if (!topic) {
    throw new Error(`Topic ${topicId} not found.`);
  }

  const understand = options.understandTopicIntentImpl ?? understandTopicIntent;
  const recommend = options.recommendSourceBundlesImpl ?? recommendSourceBundles;
  const saveProfile = options.saveTopicProfileImpl ?? saveTopicProfile;
  const replaceBundles =
    options.replaceRecommendationBundlesImpl ?? replaceRecommendationBundles;
  const previousBundles = await listRecommendationBundlesByTopic(store, topicId);

  const profile = await understand(topic.userPrompt);
  const bundles = await recommend(topic.userPrompt, { bypassCache: true });

  try {
    await replaceBundles(store, topicId, bundles);
  } catch (error) {
    await replaceRecommendationBundles(store, topicId, previousBundles);
    throw error;
  }

  try {
    await saveProfile(store, topicId, profile);
  } catch (error) {
    await replaceRecommendationBundles(store, topicId, previousBundles);
    throw error;
  }

  return { profile, bundles };
}
