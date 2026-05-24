import {
  saveBarkEndpoint,
  saveDingTalkEndpoint,
  saveEmailEndpoint,
  saveFeishuEndpoint,
  saveNtfyEndpoint,
  saveSlackEndpoint,
  saveTelegramSourceBot,
  saveTelegramDelivery,
  saveWeComEndpoint,
  saveWebhookEndpoint,
} from "@/app/actions";
import { getAiRuntimeStatus } from "@/lib/ai-config";
import { requireSessionActor } from "@/lib/auth";
import { buildDeliveryPayload, listConfiguredDeliveryChannels } from "@/lib/delivery";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n-server";
import {
  defaultStore,
  getBarkSettings,
  getDeliveryHealthSummary,
  getDingTalkSettings,
  getEmailSettings,
  getSlackSettings,
  getWeComSettings,
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
  const [actor, locale] = await Promise.all([
    requireSessionActor(),
    getRequestLocale(),
  ]);
  const t = getDictionary(locale).settings;
  const isZh = locale === "zh";
  const aiStatus = getAiRuntimeStatus();
  const [
    webhookSettings,
    slackSettings,
    dingTalkSettings,
    weComSettings,
    barkSettings,
    emailSettings,
    recentLogs,
    deliveryHealth,
    deliveryChannels,
    params,
  ] = await Promise.all([
    getWebhookSettings(defaultStore),
    getSlackSettings(defaultStore),
    getDingTalkSettings(defaultStore),
    getWeComSettings(defaultStore),
    getBarkSettings(defaultStore),
    getEmailSettings(defaultStore),
    listRecentDeliveryLogs(defaultStore, 12, { actorId: actor.id }),
    getDeliveryHealthSummary(defaultStore, { actorId: actor.id }),
    listConfiguredDeliveryChannels(defaultStore),
    searchParams,
  ]);
  const error = params?.error;
  const updated = params?.updated;
  const extraDeliveryForms = [
    {
      key: "dingtalk",
      title: "DingTalk",
      description: isZh
        ? "通过钉钉自定义机器人 Webhook 投递简报。"
        : "Send briefs to a DingTalk custom robot webhook.",
      placeholder: "https://oapi.dingtalk.com/robot/send?access_token=...",
      configured: Boolean(dingTalkSettings.endpoint),
      action: saveDingTalkEndpoint,
    },
    {
      key: "wecom",
      title: "WeCom",
      description: isZh
        ? "通过企业微信群机器人 Webhook 投递简报。"
        : "Send briefs to an enterprise WeChat group robot webhook.",
      placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...",
      configured: Boolean(weComSettings.endpoint),
      action: saveWeComEndpoint,
    },
    {
      key: "bark",
      title: "Bark",
      description: isZh
        ? "通过 Bark endpoint 发送 iOS 推送。"
        : "Send iOS push notifications through a Bark endpoint.",
      placeholder: "https://api.day.app/your-key",
      configured: Boolean(barkSettings.endpoint),
      action: saveBarkEndpoint,
    },
    {
      key: "email",
      title: "Email SMTP",
      description: isZh
        ? "通过 smtp:// 或 smtps:// 配置直接发送邮件。"
        : "Send email through a configured smtp:// or smtps:// endpoint.",
      placeholder: "smtps://user:pass@smtp.example.com:465?from=me@example.com&to=you@example.com",
      configured: Boolean(emailSettings.endpoint),
      action: saveEmailEndpoint,
    },
  ];
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
            {t.badge}
          </span>
          <p className="text-sm text-stone-500">
            {t.owner} {actor.email}
          </p>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{t.title}</h1>
            <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
              {t.description}
            </p>
          </div>
        </div>

        <form
          action={saveWebhookEndpoint}
          className="grid gap-4 rounded-[24px] bg-stone-950 p-6 text-stone-50"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t.webhookTitle}</h2>
            <p className="text-sm leading-6 text-stone-300">
              {t.webhookDescription}
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-200">{t.endpointUrl}</span>
            <input
              name="endpoint"
              placeholder="https://example.com/webhook"
              className="h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-white outline-none transition focus:border-white/30 focus:bg-white/15"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-4 text-sm font-medium text-stone-950 transition hover:bg-stone-100">
            {t.saveWebhook}
          </button>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-300">
            {webhookSettings.endpoint
              ? `${t.currentEndpoint} ${isZh ? "已配置" : "configured"}`
              : t.noWebhook}
          </div>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          action={saveSlackEndpoint}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t.slackTitle}</h2>
            <p className="text-sm leading-6 text-stone-500">
              {t.slackDescription}
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.slackUrl}</span>
            <input
              name="endpoint"
              placeholder="https://hooks.slack.com/services/..."
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
            {t.saveSlack}
          </button>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            {slackSettings.endpoint
              ? `${t.currentSlack} ${isZh ? "已配置" : "configured"}`
              : t.noSlack}
          </div>
        </form>

        <form
          action={saveTelegramDelivery}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t.telegramDelivery}</h2>
            <p className="text-sm leading-6 text-stone-500">
              {t.telegramDeliveryDescription}
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.botToken}</span>
            <input
              name="botToken"
              placeholder="123456:ABCDEF..."
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.chatId}</span>
            <input
              name="chatId"
              placeholder="-1001234567890"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
            {t.saveTelegram}
          </button>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          action={saveTelegramSourceBot}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t.telegramSourceBot}</h2>
            <p className="text-sm leading-6 text-stone-500">
              {t.telegramSourceDescription}
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.botToken}</span>
            <input
              name="botToken"
              placeholder="123456:ABCDEF..."
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
            {t.saveTelegramSourceBot}
          </button>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          action={saveFeishuEndpoint}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t.feishuTitle}</h2>
            <p className="text-sm leading-6 text-stone-500">
              {t.feishuDescription}
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.feishuUrl}</span>
            <input
              name="endpoint"
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
            {t.saveFeishu}
          </button>
        </form>

        <form
          action={saveNtfyEndpoint}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">ntfy</h2>
            <p className="text-sm leading-6 text-stone-500">
              {isZh
                ? "向 ntfy topic endpoint 发送简报通知。"
                : "Send brief notifications to an ntfy topic endpoint."}
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">ntfy endpoint</span>
            <input
              name="endpoint"
              placeholder="https://ntfy.sh/inflowee"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
            {isZh ? "保存 ntfy" : "Save ntfy"}
          </button>
        </form>

        {extraDeliveryForms.map((channel) => (
          <form
            key={channel.key}
            action={channel.action}
            className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{channel.title}</h2>
              <p className="text-sm leading-6 text-stone-500">
                {channel.description}
              </p>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">Endpoint</span>
              <input
                name="endpoint"
                placeholder={channel.placeholder}
                className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              />
            </label>

            <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
              {isZh ? "保存" : "Save"} {channel.title}
            </button>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              {channel.configured
                ? isZh
                  ? "已配置，凭据已隐藏。"
                  : "Configured. Credentials are hidden."
                : isZh
                  ? "未配置。"
                  : "Not configured."}
            </div>
          </form>
        ))}

        <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <h2 className="text-xl font-semibold">{t.deliveryHealth}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-stone-400">{t.recent}</div>
              <div className="mt-2 text-2xl font-semibold">{deliveryHealth.total}</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-emerald-600">{t.success}</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-700">{deliveryHealth.success}</div>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-rose-600">{t.failed}</div>
              <div className="mt-2 text-2xl font-semibold text-rose-700">{deliveryHealth.error}</div>
            </div>
            <div className="rounded-2xl bg-stone-100 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{t.channels}</div>
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
                {(deliveryHealth.webhookConfigured ||
                  deliveryHealth.slackConfigured ||
                  deliveryHealth.telegramConfigured ||
                  deliveryHealth.feishuConfigured) &&
                deliveryHealth.ntfyConfigured
                  ? " + "
                  : null}
                {deliveryHealth.ntfyConfigured ? "ntfy" : null}
                {!deliveryHealth.webhookConfigured &&
                !deliveryHealth.slackConfigured &&
                !deliveryHealth.telegramConfigured &&
                !deliveryHealth.feishuConfigured &&
                !deliveryHealth.ntfyConfigured
                  ? t.noneConfigured
                  : null}
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{t.aiRuntime}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              {aiStatus.configured ? t.aiConfigured : t.aiNotConfigured}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              aiStatus.configured
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {aiStatus.mode === "live" ? t.aiLive : t.aiFallback}
          </span>
        </div>
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
              ? t.webhookSaved
              : updated === "slack"
                ? t.slackSaved
                : updated === "telegram"
                  ? t.telegramSaved
                  : updated === "telegram-source-bot"
                    ? t.telegramSourceSaved
                  : updated === "feishu"
                    ? t.feishuSaved
                  : updated === "ntfy"
                    ? isZh
                      ? "ntfy 设置已保存。"
                      : "ntfy settings saved."
                  : updated === "dingtalk"
                    ? isZh
                      ? "钉钉设置已保存。"
                      : "DingTalk settings saved."
                  : updated === "wecom"
                    ? isZh
                      ? "企业微信设置已保存。"
                      : "WeCom settings saved."
                  : updated === "bark"
                    ? isZh
                      ? "Bark 设置已保存。"
                      : "Bark settings saved."
                  : updated === "email"
                    ? isZh
                      ? "邮件设置已保存。"
                      : "Email settings saved."
                : t.updateApplied}
        </section>
      )}

      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{t.logsTitle}</h2>
            <p className="text-sm leading-6 text-stone-500">
              {t.logsDescription}
            </p>
          </div>
          <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
            {recentLogs.length} {t.entries}
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {recentLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
              {t.noDeliveries}
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
                      {t.brief} {log.briefId}
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
                  <span>{t.started} {new Date(log.startedAt).toLocaleString()}</span>
                  {log.responseStatus ? <span>HTTP {log.responseStatus}</span> : null}
                  {log.error ? <span>{log.error}</span> : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <h2 className="text-xl font-semibold">{t.adaptersTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          {t.adaptersDescription}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {deliveryChannels.map((channel) => (
            <article
              key={channel.type}
              className="rounded-2xl border border-stone-200 bg-stone-50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-stone-900">
                  {channel.name}
                </h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                    channel.enabled
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {channel.enabled ? "enabled" : "off"}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                {channel.formatGuide.contentTypes.join(", ")} · max{" "}
                {channel.formatGuide.maxPayloadCharacters.toLocaleString()} chars
              </p>
            </article>
          ))}
        </div>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-stone-950 p-4 text-xs leading-6 text-stone-200">
          {JSON.stringify(slackPreview, null, 2)}
        </pre>
      </section>
    </div>
  );
}
