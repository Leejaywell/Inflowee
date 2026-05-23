type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

type TelegramMessage = {
  text?: string;
  caption?: string;
  date?: number;
  chat?: {
    id?: number;
    title?: string;
    username?: string;
  };
  sender_chat?: {
    id?: number;
    title?: string;
    username?: string;
  };
};

type TelegramGetUpdatesResponse = {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
};

export type TelegramBotFeedItem = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: string | null;
};

export async function fetchTelegramBotFeed(input: {
  botToken: string;
  sourceUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<TelegramBotFeedItem[]> {
  const chatSlug = getTelegramSlug(input.sourceUrl);

  if (!chatSlug) {
    throw new Error("Telegram bot sources require a public t.me slug.");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = new URL(`https://api.telegram.org/bot${input.botToken}/getUpdates`);
  endpoint.searchParams.set("limit", "50");
  endpoint.searchParams.set("allowed_updates", JSON.stringify(["message", "channel_post"]));

  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText
        ? `Telegram bot request failed with status ${response.status}: ${errorText}`
        : `Telegram bot request failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as TelegramGetUpdatesResponse;

  if (!payload.ok) {
    throw new Error(payload.description || "Telegram bot returned an unknown error.");
  }

  const items = (payload.result ?? [])
    .map((update) => update.channel_post ?? update.message)
    .filter((message): message is TelegramMessage => Boolean(message))
    .filter((message) => {
      const username =
        message.chat?.username?.toLowerCase() ??
        message.sender_chat?.username?.toLowerCase();

      return username === chatSlug.toLowerCase();
    })
    .map((message) => mapTelegramMessage(message, chatSlug));

  if (items.length === 0) {
    throw new Error(
      "No Telegram bot updates matched this public chat. Add the bot to the group or channel and make sure new messages have arrived.",
    );
  }

  return items.slice(0, 20);
}

function mapTelegramMessage(
  message: TelegramMessage,
  chatSlug: string,
): TelegramBotFeedItem {
  const text = normalizeText(message.text ?? message.caption ?? "");
  const title = text ? truncate(text, 90) : message.chat?.title || "Telegram update";
  const summary = text ? truncate(text, 320) : null;
  const timestamp = message.date ? new Date(message.date * 1000).toISOString() : null;
  const chatPath = `/s/${chatSlug}`;
  const canonicalUrl = new URL(chatPath, "https://t.me").toString();

  return {
    title,
    canonicalUrl,
    summary,
    publishedAt: timestamp,
  };
}

function getTelegramSlug(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    return parsed.pathname
      .split("/")
      .filter(Boolean)
      .filter((segment) => segment !== "s")[0] ?? null;
  } catch {
    return null;
  }
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}
