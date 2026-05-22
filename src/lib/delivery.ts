import { renderBriefHtmlDigest } from "@/lib/brief-render";
import {
  createDeliveryLog,
  finishDeliveryLog,
  getBriefById,
  getWebhookSettings,
  listItemsByBriefId,
  type Store,
} from "@/lib/store";

export type DeliveryPayload = {
  briefId: string;
  format: "html";
  title: string;
  html: string;
};

type FetchLike = typeof fetch;

export type DeliveryAttemptResult =
  | {
      status: "success";
      responseStatus: number;
    }
  | {
      status: "error";
      error: string;
    };

export async function deliverBriefDigest(input: {
  endpoint: string;
  payload: DeliveryPayload;
  fetchImpl?: FetchLike;
}): Promise<number> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(input.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input.payload),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const message = responseText
      ? `Webhook delivery failed with status ${response.status}: ${responseText}`
      : `Webhook delivery failed with status ${response.status}`;

    throw new Error(message);
  }

  return response.status;
}

export async function deliverBriefWithRetry(input: {
  endpoint: string;
  payload: DeliveryPayload;
  fetchImpl?: FetchLike;
  maxAttempts?: number;
}): Promise<DeliveryAttemptResult> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 1);
  let lastError = "Unknown delivery failure.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const responseStatus = await deliverBriefDigest(input);

      return {
        status: "success",
        responseStatus,
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Unknown delivery failure.";
    }
  }

  return {
    status: "error",
    error: lastError,
  };
}

export async function deliverStoredBrief(
  store: Store,
  briefId: string,
  options?: {
    fetchImpl?: FetchLike;
    maxAttempts?: number;
  },
) {
  const brief = await getBriefById(store, briefId);

  if (!brief) {
    throw new Error("Brief not found.");
  }

  const settings = await getWebhookSettings(store);

  if (!settings.endpoint) {
    throw new Error("Configure a webhook endpoint first.");
  }

  const linkedItems = await listItemsByBriefId(store, briefId);
  const html = renderBriefHtmlDigest({ brief, linkedItems });
  const logId = await createDeliveryLog(store, {
    briefId,
    endpoint: settings.endpoint,
    payloadType: "html",
  });

  const result = await deliverBriefWithRetry({
    endpoint: settings.endpoint,
    payload: {
      briefId,
      format: "html",
      title: brief.title,
      html,
    },
    fetchImpl: options?.fetchImpl,
    maxAttempts: options?.maxAttempts,
  });

  if (result.status === "success") {
    await finishDeliveryLog(store, {
      logId,
      status: "success",
      responseStatus: result.responseStatus,
    });

    return {
      logId,
      ...result,
    };
  }

  await finishDeliveryLog(store, {
    logId,
    status: "error",
    error: result.error,
  });

  return {
    logId,
    ...result,
  };
}
