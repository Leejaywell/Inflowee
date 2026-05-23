import {
  saveFeishuEndpoint,
  saveSlackEndpoint,
  saveTelegramSourceBot,
  saveTelegramDelivery,
  saveWebhookEndpoint,
} from "@/app/actions";
import { requireOperatorSessionActor } from "@/lib/auth";
import { buildDeliveryPayload } from "@/lib/delivery";
import {
  defaultStore,
  getDeliveryHealthSummary,
  getFeishuSettings,
  getSlackSettings,
  getTelegramSourceSettings,
  getTelegramSettings,
  getWebhookSettings,
  listRecentDeliveryLogs,
} from "@/lib/store";

type SettingsPageProps = {
  searchParams?: Promise<{
    error?: string;
    updated?: string;
  }>;
};

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
  const actor = await requireOperatorSessionActor();
  const [webhookSettings, slackSettings, telegramSettings, telegramSourceSettings, feishuSettings, recentLogs, deliveryHealth, params] = await Promise.all([
    getWebhookSettings(defaultStore),
    getSlackSettings(defaultStore),
    getTelegramSettings(defaultStore),
    getTelegramSourceSettings(defaultStore),
    getFeishuSettings(defaultStore),
    listRecentDeliveryLogs(defaultStore, 12, { actorId: actor.id }),
    getDeliveryHealthSummary(defaultStore, { actorId: actor.id }),
    searchParams,
  ]);
  const error = params?.error;
  const updated = params?.updated;
  const slackPreview = await buildDeliveryPayload({
    channel: "slack",
    brief: {
      id: "preview-brief",
      title: "OpenAI ships a notable update",
      summary: "The API changelog added a production-facing update.",
    },
  });

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <span className="inline-flex rounded-full bg-[#0057ff] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white">
            Delivery settings
          </span>
          <p className="text-sm text-stone-500">
            Current session owner: {actor.email}
          </p>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Configure delivery channels for brief routing.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
              Automatic background delivery and manual resend both use the same
              channel pipeline.
            </p>
          </div>
        </div>

        <form
          action={saveWebhookEndpoint}
          className="grid gap-4 rounded-[24px] bg-stone-950 p-6 text-stone-50"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Webhook endpoint</h2>
            <p className="text-sm leading-6 text-stone-300">
              Only `https://` endpoints are accepted.
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-200">Endpoint URL</span>
            <input
              name="endpoint"
              defaultValue={webhookSettings.endpoint ?? ""}
              placeholder="https://example.com/webhook"
              className="h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-white outline-none transition focus:border-white/30 focus:bg-white/15"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-4 text-sm font-medium text-stone-950 transition hover:bg-stone-100">
            Save webhook
          </button>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-300">
            {webhookSettings.endpoint
              ? `Current endpoint: ${webhookSettings.endpoint}`
              : "No webhook configured yet."}
          </div>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          action={saveSlackEndpoint}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Slack webhook</h2>
            <p className="text-sm leading-6 text-stone-500">
              Use a Slack incoming webhook to receive the same brief stream in a channel.
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">Slack webhook URL</span>
            <input
              name="endpoint"
              defaultValue={slackSettings.endpoint ?? ""}
              placeholder="https://hooks.slack.com/services/..."
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
            Save Slack webhook
          </button>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            {slackSettings.endpoint
              ? `Current Slack webhook: ${slackSettings.endpoint}`
              : "No Slack webhook configured yet."}
          </div>
        </form>

        <form
          action={saveTelegramDelivery}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Telegram delivery</h2>
            <p className="text-sm leading-6 text-stone-500">
              Use a Telegram bot token and chat ID to send short brief summaries.
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">Bot token</span>
            <input
              name="botToken"
              defaultValue={telegramSettings.botToken ?? ""}
              placeholder="123456:ABCDEF..."
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">Chat ID</span>
            <input
              name="chatId"
              defaultValue={telegramSettings.chatId ?? ""}
              placeholder="-1001234567890"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
            Save Telegram delivery
          </button>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          action={saveTelegramSourceBot}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Telegram source bot</h2>
            <p className="text-sm leading-6 text-stone-500">
              Use a separate bot token for Telegram source ingestion. The bot
              must already be a member of the target public group or channel,
              and new messages must arrive after it is added.
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">Bot token</span>
            <input
              name="botToken"
              defaultValue={telegramSourceSettings.botToken ?? ""}
              placeholder="123456:ABCDEF..."
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
            Save Telegram source bot
          </button>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          action={saveFeishuEndpoint}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Feishu webhook</h2>
            <p className="text-sm leading-6 text-stone-500">
              Use a Feishu or Lark custom bot webhook to mirror the brief stream.
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">Feishu webhook URL</span>
            <input
              name="endpoint"
              defaultValue={feishuSettings.endpoint ?? ""}
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
            Save Feishu webhook
          </button>
        </form>

        <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <h2 className="text-xl font-semibold">Delivery health</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-stone-400">Recent</div>
              <div className="mt-2 text-2xl font-semibold">{deliveryHealth.total}</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-emerald-600">Success</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-700">{deliveryHealth.success}</div>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-rose-600">Failed</div>
              <div className="mt-2 text-2xl font-semibold text-rose-700">{deliveryHealth.error}</div>
            </div>
            <div className="rounded-2xl bg-stone-100 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-stone-500">Channels</div>
              <div className="mt-2 text-sm text-stone-700">
                {deliveryHealth.webhookConfigured ? "Webhook" : null}
                {deliveryHealth.webhookConfigured && deliveryHealth.slackConfigured ? " + " : null}
                {deliveryHealth.slackConfigured ? "Slack" : null}
                {(deliveryHealth.webhookConfigured || deliveryHealth.slackConfigured) &&
                deliveryHealth.telegramConfigured
                  ? " + "
                  : null}
                {deliveryHealth.telegramConfigured ? "Telegram" : null}
                {(deliveryHealth.webhookConfigured ||
                  deliveryHealth.slackConfigured ||
                  deliveryHealth.telegramConfigured) &&
                deliveryHealth.feishuConfigured
                  ? " + "
                  : null}
                {deliveryHealth.feishuConfigured ? "Feishu" : null}
                {!deliveryHealth.webhookConfigured &&
                !deliveryHealth.slackConfigured &&
                !deliveryHealth.telegramConfigured &&
                !deliveryHealth.feishuConfigured
                  ? "None configured"
                  : null}
              </div>
            </div>
          </div>
        </section>
      </section>

      {(error || updated) && (
        <section
          className={`rounded-2xl border px-5 py-4 text-sm ${
            error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error
            ? decodeURIComponent(error)
            : updated === "webhook"
              ? "Webhook settings saved."
              : updated === "slack"
                ? "Slack settings saved."
                : updated === "telegram"
                  ? "Telegram settings saved."
                  : updated === "telegram-source-bot"
                    ? "Telegram source bot saved."
                  : updated === "feishu"
                    ? "Feishu settings saved."
                : "Update applied."}
        </section>
      )}

      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Recent delivery logs</h2>
            <p className="text-sm leading-6 text-stone-500">
              Latest delivery attempts across all briefs and channels.
            </p>
          </div>
          <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
            {recentLogs.length} entries
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {recentLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
              No deliveries yet. Send a brief from the inbox detail page.
            </div>
          ) : (
            recentLogs.map((log) => (
              <article
                key={log.id}
                className="rounded-[20px] border border-stone-200 bg-stone-50 px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.16em] text-stone-400">
                      Brief {log.briefId}
                    </p>
                    <p className="text-sm text-stone-600">{log.endpoint}</p>
                    <p className="text-xs uppercase tracking-[0.14em] text-stone-400">
                      {log.payloadType}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      log.status === "success"
                        ? "bg-emerald-100 text-emerald-700"
                        : log.status === "error"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-stone-200 text-stone-700"
                    }`}
                  >
                    {log.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-500">
                  <span>Started {new Date(log.startedAt).toLocaleString()}</span>
                  {log.responseStatus ? <span>HTTP {log.responseStatus}</span> : null}
                  {log.error ? <span>{log.error}</span> : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <h2 className="text-xl font-semibold">Channel adapters</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Slack now uses the same delivery pipeline as webhook sends. This preview
          shows the payload shape sent to the Slack incoming webhook.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-stone-950 p-4 text-xs leading-6 text-stone-200">
          {JSON.stringify(slackPreview, null, 2)}
        </pre>
      </section>
    </div>
  );
}
