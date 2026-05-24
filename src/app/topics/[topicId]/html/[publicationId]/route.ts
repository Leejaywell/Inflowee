import { notFound } from "next/navigation";

import { assertTopicAccess, requireSessionActor } from "@/lib/auth";
import {
  defaultStore,
  getHtmlPublicationById,
  getTopicById,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type HtmlPublicationRouteProps = {
  params: Promise<{
    topicId: string;
    publicationId: string;
  }>;
};

export async function GET(_request: Request, { params }: HtmlPublicationRouteProps) {
  const { topicId, publicationId } = await params;
  const [actor, topic, publication] = await Promise.all([
    requireSessionActor(),
    getTopicById(defaultStore, topicId),
    getHtmlPublicationById(defaultStore, publicationId),
  ]);

  if (!topic || !publication || publication.topicId !== topicId || !publication.html) {
    notFound();
  }

  try {
    await assertTopicAccess(defaultStore, { actorId: actor.id, topicId });
  } catch {
    notFound();
  }

  return new Response(publication.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
