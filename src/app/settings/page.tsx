import {
  saveBarkEndpoint,
  saveDingTalkEndpoint,
  saveEmailEndpoint,
  saveFeishuEndpoint,
  saveNtfyEndpoint,
  saveSlackEndpoint,
  saveTelegramSourceBot,
  saveTelegramDelivery,
  saveDefaultDeliveryChannelsAction,
  saveDeliveryTemplateAction,
  saveHtmlPushConfigAction,
  testDeliveryChannelAction,
  saveWeComEndpoint,
  saveWebhookEndpoint,
} from "@/app/actions";
import { MetricPill, Notice, PageHeader, Surface } from "@/components/ui-shell";
import { WechatQrBind } from "@/components/wechat-qr-bind";
import { getAiRuntimeStatus } from "@/lib/ai-config";
import { requireSessionActor } from "@/lib/auth";
import { buildDeliveryPayload, listConfiguredDeliveryChannels } from "@/lib/delivery";
import {
  getDefaultHtmlPushModules,
  HTML_PUSH_MODULE_PRESETS,
  HTML_PUSH_MODULES,
  HTML_PUSH_STYLE_PRESETS,
} from "@/lib/html-push-config";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n-server";
import {
  defaultStore,
  getBarkSettings,
  getDeliveryHealthSummary,
  getDeliveryTemplate,
  getDefaultDeliveryChannels,
  getHtmlPushConfig,
  getDingTalkSettings,
  getEmailSettings,
  getSlackSettings,
  getWeComSettings,
  getWechatSettings,
  getWebhookSettings,
  listRecentDeliveryLogs,
  listRecentHtmlPublications,
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
    wechatSettings,
    recentLogs,
    deliveryHealth,
    deliveryChannels,
    defaultDeliveryChannels,
    deliveryTemplate,
    htmlPushConfig,
    recentHtmlPublications,
    params,
  ] = await Promise.all([
    getWebhookSettings(defaultStore),
    getSlackSettings(defaultStore),
    getDingTalkSettings(defaultStore),
    getWeComSettings(defaultStore),
    getBarkSettings(defaultStore),
    getEmailSettings(defaultStore),
    getWechatSettings(defaultStore),
    listRecentDeliveryLogs(defaultStore, 12, { actorId: actor.id }),
    getDeliveryHealthSummary(defaultStore, { actorId: actor.id }),
    listConfiguredDeliveryChannels(defaultStore),
    getDefaultDeliveryChannels(defaultStore),
    getDeliveryTemplate(defaultStore),
    getHtmlPushConfig(defaultStore, actor.id),
    listRecentHtmlPublications(defaultStore, 6, { ownerId: actor.id }),
    searchParams,
  ]);
  const error = params?.error;
  const updated = params?.updated;
  const configuredDeliveryChannels = deliveryChannels.filter(
    (channel) => channel.enabled,
  );
  const recentDeliveryErrors = recentLogs
    .filter((log) => log.status === "error")
    .slice(0, 3);
  const recentHtmlFailures = recentHtmlPublications
    .filter((publication) => publication.status === "failed")
    .slice(0, 3);
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
    <div className="grid gap-5">
      <PageHeader
        eyebrow={t.badge}
        title={t.title}
        metrics={
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricPill value={deliveryHealth.total} label={t.recent} />
            <MetricPill value={deliveryHealth.success} label={t.success} tone="success" />
            <MetricPill
              value={deliveryHealth.error}
              label={t.failed}
              tone={deliveryHealth.error > 0 ? "danger" : "default"}
            />
            <MetricPill value={configuredDeliveryChannels.length} label={t.channels} />
          </div>
        }
      />

      {(error || updated) && (
        <Notice tone={error ? "danger" : "success"}>
          {error
            ? decodeURIComponent(error)
            : updated?.startsWith("test-")
              ? isZh
                ? "测试消息已发送。"
                : "Test message sent."
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
                  : updated === "default-delivery-channels"
                    ? isZh
                      ? "默认投递通道已保存。"
                      : "Default delivery channels saved."
                  : updated === "delivery-template"
                    ? isZh
                      ? "投递模板已保存。"
                      : "Delivery template saved."
                  : updated === "html-push"
                    ? isZh
                      ? "HTML 推送设置已保存。"
                      : "HTML push settings saved."
                  : updated === "wechat"
                    ? isZh
                      ? "微信设置已保存。"
                      : "WeChat settings saved."
                  : t.updateApplied}
        </Notice>
      )}

      {/* ── Delivery channels ─────────────────────────────────────────── */}
      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <div className="mb-6 flex items-center justify-between border-b border-stone-100 pb-5">
          <div>
            <h2 className="text-xl font-semibold">
              {isZh ? "投递通道" : "Delivery channels"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              {isZh
                ? "配置简报投递通道。每个通道独立保存。"
                : "Configure where briefs are delivered. Each channel is saved independently."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {configuredDeliveryChannels.length > 0 ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                {configuredDeliveryChannels.length} {isZh ? "已配置" : "configured"}
              </span>
            ) : (
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500">
                {isZh ? "未配置" : "none configured"}
              </span>
            )}
          </div>
        </div>

        {/* Channel grid — 2 columns */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Slack */}
          <form action={saveSlackEndpoint} className="grid content-start gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-5">
            <div>
              <h3 className="text-base font-semibold">{t.slackTitle}</h3>
              <p className="mt-0.5 text-xs leading-5 text-stone-500">{t.slackDescription}</p>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-stone-600">{t.slackUrl}</span>
              <input
                name="endpoint"
                placeholder="https://hooks.slack.com/services/..."
                className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
              />
            </label>
            <div className="flex items-center gap-3">
              <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-white transition hover:bg-stone-800">
                {t.saveSlack}
              </button>
              <span className="text-xs text-stone-400">
                {slackSettings.endpoint ? (isZh ? "已配置" : "configured") : (isZh ? "未配置" : "not set")}
              </span>
            </div>
          </form>

          {/* Telegram delivery */}
          <form action={saveTelegramDelivery} className="grid content-start gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-5">
            <div>
              <h3 className="text-base font-semibold">{t.telegramDelivery}</h3>
              <p className="mt-0.5 text-xs leading-5 text-stone-500">{t.telegramDeliveryDescription}</p>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-stone-600">{t.botToken}</span>
              <input
                name="botToken"
                placeholder="123456:ABCDEF..."
                className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-stone-600">{t.chatId}</span>
              <input
                name="chatId"
                placeholder="-1001234567890"
                className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
              />
            </label>
            <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-white transition hover:bg-stone-800">
              {t.saveTelegram}
            </button>
          </form>

          {/* Telegram source bot */}
          <form action={saveTelegramSourceBot} className="grid content-start gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-5">
            <div>
              <h3 className="text-base font-semibold">{t.telegramSourceBot}</h3>
              <p className="mt-0.5 text-xs leading-5 text-stone-500">{t.telegramSourceDescription}</p>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-stone-600">{t.botToken}</span>
              <input
                name="botToken"
                placeholder="123456:ABCDEF..."
                className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
              />
            </label>
            <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-white transition hover:bg-stone-800">
              {t.saveTelegramSourceBot}
            </button>
          </form>

          {/* Feishu */}
          <form action={saveFeishuEndpoint} className="grid content-start gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-5">
            <div>
              <h3 className="text-base font-semibold">{t.feishuTitle}</h3>
              <p className="mt-0.5 text-xs leading-5 text-stone-500">{t.feishuDescription}</p>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-stone-600">{t.feishuUrl}</span>
              <input
                name="endpoint"
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
              />
            </label>
            <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-white transition hover:bg-stone-800">
              {t.saveFeishu}
            </button>
          </form>

          {/* ntfy */}
          <form action={saveNtfyEndpoint} className="grid content-start gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-5">
            <div>
              <h3 className="text-base font-semibold">ntfy</h3>
              <p className="mt-0.5 text-xs leading-5 text-stone-500">
                {isZh ? "向 ntfy topic endpoint 发送简报通知。" : "Send brief notifications to an ntfy topic endpoint."}
              </p>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-stone-600">ntfy endpoint</span>
              <input
                name="endpoint"
                placeholder="https://ntfy.sh/inflowee"
                className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
              />
            </label>
            <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-white transition hover:bg-stone-800">
              {isZh ? "保存 ntfy" : "Save ntfy"}
            </button>
          </form>

          {/* Extra channels */}
          {extraDeliveryForms.map((channel) => (
            <form key={channel.key} action={channel.action} className="grid content-start gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-5">
              <div>
                <h3 className="text-base font-semibold">{channel.title}</h3>
                <p className="mt-0.5 text-xs leading-5 text-stone-500">{channel.description}</p>
              </div>
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs font-medium text-stone-600">Endpoint</span>
                <input
                  name="endpoint"
                  placeholder={channel.placeholder}
                  className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
                />
              </label>
              <div className="flex items-center gap-3">
                <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-white transition hover:bg-stone-800">
                  {isZh ? "保存" : "Save"} {channel.title}
                </button>
                <span className="text-xs text-stone-400">
                  {channel.configured
                    ? isZh ? "已配置" : "configured"
                    : isZh ? "未配置" : "not set"}
                </span>
              </div>
            </form>
          ))}

          {/* WeChat ilink — QR bind */}
          <div className="grid content-start gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-5">
            <div>
              <h3 className="text-base font-semibold">{isZh ? "微信（ilink）" : "WeChat (ilink)"}</h3>
              <p className="mt-0.5 text-xs leading-5 text-stone-500">
                {isZh
                  ? "通过 OpenClaw ilink 协议向微信用户发送简报推送。扫码完成绑定。"
                  : "Send briefs via OpenClaw ilink. Scan the QR code to bind."}
              </p>
            </div>
            <WechatQrBind isZh={isZh} isBound={Boolean(wechatSettings.token)} />
          </div>

          {/* Custom Webhook */}
          <form action={saveWebhookEndpoint} className="grid content-start gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-5">
            <div>
              <h3 className="text-base font-semibold">{t.webhookTitle}</h3>
              <p className="mt-0.5 text-xs leading-5 text-stone-500">{t.webhookDescription}</p>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-stone-600">{t.endpointUrl}</span>
              <input
                name="endpoint"
                placeholder="https://example.com/webhook"
                className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
              />
            </label>
            <div className="flex items-center gap-3">
              <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-white transition hover:bg-stone-800">
                {t.saveWebhook}
              </button>
              <span className="text-xs text-stone-400">
                {webhookSettings.endpoint ? (isZh ? "已配置" : "configured") : (isZh ? "未配置" : "not set")}
              </span>
            </div>
          </form>
        </div>
      </section>

      {/* ── Delivery config ────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <h2 className="mb-1 text-base font-semibold">
            {isZh ? "默认投递通道" : "Default delivery channels"}
          </h2>
          <p className="mb-5 text-xs leading-5 text-stone-500">
            {isZh
              ? "话题没有单独选择通道时，使用这里的默认通道。留空则发送到所有已配置通道。"
              : "Topics without their own channel use these defaults. Leave empty to send to all configured channels."}
          </p>
          <form action={saveDefaultDeliveryChannelsAction} className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {deliveryChannels.map((channel) => (
                <label
                  key={channel.type}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                    channel.enabled
                      ? "border-stone-200 bg-stone-50 text-stone-800"
                      : "border-stone-100 bg-stone-50/60 text-stone-400"
                  }`}
                >
                  <span>
                    <span className="block text-xs font-semibold">{channel.name}</span>
                    <span className="text-[10px] text-stone-400">
                      {channel.enabled ? (isZh ? "已配置" : "configured") : (isZh ? "未配置" : "not configured")}
                    </span>
                  </span>
                  <input
                    name="channels"
                    type="checkbox"
                    value={channel.type}
                    defaultChecked={defaultDeliveryChannels.channels.includes(channel.type)}
                    disabled={!channel.enabled}
                    className="size-4"
                  />
                </label>
              ))}
            </div>
            {defaultDeliveryChannels.updatedAt ? (
              <p className="text-xs text-stone-400">
                {isZh ? "更新于" : "Updated"} {new Date(defaultDeliveryChannels.updatedAt).toLocaleString()}
              </p>
            ) : null}
            <button className="h-10 justify-self-start rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800">
              {isZh ? "保存默认通道" : "Save default channels"}
            </button>
          </form>
        </section>

        <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <h2 className="mb-1 text-base font-semibold">
            {isZh ? "投递模板" : "Delivery template"}
          </h2>
          <p className="mb-5 text-xs leading-5 text-stone-500">
            {isZh
              ? "自定义推送正文，可使用 {{title}}、{{summary}}、{{contentType}}。留空则使用默认正文。"
              : "Customize delivery body with {{title}}, {{summary}}, {{contentType}}. Leave empty for default."}
          </p>
          <form action={saveDeliveryTemplateAction} className="grid gap-4">
            <textarea
              name="template"
              defaultValue={deliveryTemplate.template ?? ""}
              rows={6}
              maxLength={2000}
              placeholder={isZh ? "{{title}}\n\n{{summary}}\n\n类型：{{contentType}}" : "{{title}}\n\n{{summary}}\n\nType: {{contentType}}"}
              className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 outline-none transition focus:border-stone-400 focus:bg-white"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button className="h-10 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800">
                {isZh ? "保存模板" : "Save template"}
              </button>
              {deliveryTemplate.updatedAt ? (
                <p className="text-xs text-stone-400">
                  {isZh ? "更新于" : "Updated"} {new Date(deliveryTemplate.updatedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          </form>
        </section>
      </div>

      {/* ── HTML push ─────────────────────────────────────────────────── */}
      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <div className="mb-6 border-b border-stone-100 pb-5">
          <h2 className="text-xl font-semibold">
            {isZh ? "HTML 推送增强" : "HTML push enhancement"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-500">
            {isZh
              ? "推送简报时，可选生成一份精美 HTML 摘要页，并把链接附在消息里。"
              : "Optionally publish a polished HTML summary page for delivered briefs, then append the link to the notification."}
          </p>
        </div>
        <form action={saveHtmlPushConfigAction} className="grid gap-5">
          <input name="entitlementStatus" type="hidden" value="available" />
          <label className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm">
            <span>
              <span className="block font-semibold text-stone-900">
                {isZh ? "启用 HTML 摘要页" : "Enable HTML summary pages"}
              </span>
              <span className="text-xs leading-5 text-stone-500">
                {isZh ? "失败时仍会继续发送原始推送。" : "Delivery continues as plain text if HTML publishing fails."}
              </span>
            </span>
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={htmlPushConfig?.enabled ?? false}
              className="size-4"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">GitHub token</span>
              <input
                name="githubToken"
                type="password"
                placeholder={htmlPushConfig?.githubTokenEncrypted ? (isZh ? "已保存，留空保持不变" : "Saved. Leave blank to keep it.") : "github_pat_..."}
                className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">Repository</span>
              <input
                name="githubRepo"
                defaultValue={htmlPushConfig?.githubRepo ?? ""}
                placeholder="owner/repo"
                className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">Branch</span>
              <input
                name="githubBranch"
                defaultValue={htmlPushConfig?.githubBranch ?? "main"}
                className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">{isZh ? "基础路径" : "Base path"}</span>
              <input
                name="githubBasePath"
                defaultValue={htmlPushConfig?.githubBasePath ?? "inflowee/html"}
                className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              />
            </label>
            <label className="grid gap-2 text-sm md:col-span-2">
              <span className="font-medium text-stone-700">{isZh ? "公开访问基础 URL" : "Public base URL"}</span>
              <input
                name="publicBaseUrl"
                defaultValue={htmlPushConfig?.publicBaseUrl ?? ""}
                placeholder="https://username.github.io/repo"
                className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">{isZh ? "视觉风格" : "Visual style"}</span>
              <select
                name="stylePreset"
                defaultValue={htmlPushConfig?.stylePreset ?? "minimal_news"}
                className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              >
                {HTML_PUSH_STYLE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>{preset.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">{isZh ? "内容预设" : "Content preset"}</span>
              <select
                name="modulePreset"
                defaultValue={htmlPushConfig?.modulePreset ?? "standard_summary"}
                className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              >
                {HTML_PUSH_MODULE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>{preset.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium text-stone-700">
              {isZh ? "HTML 内容模块" : "HTML content modules"}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {HTML_PUSH_MODULES.map((module) => (
                <label key={module} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                  <input
                    name="enabledModules"
                    type="checkbox"
                    value={module}
                    defaultChecked={(htmlPushConfig?.enabledModules ?? getDefaultHtmlPushModules("standard_summary")).includes(module)}
                    className="size-4"
                  />
                  <span>{module.replaceAll("_", " ")}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">
              {isZh ? "自定义生成要求" : "Custom generation instructions"}
            </span>
            <textarea
              name="customPrompt"
              rows={4}
              maxLength={1000}
              defaultValue={htmlPushConfig?.customPrompt ?? ""}
              placeholder={isZh ? "例如：写给非技术读者，强调影响和下一步。" : "Example: write for non-technical readers and emphasize impact."}
              className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          {recentHtmlFailures.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              <div className="mb-2 font-semibold">{isZh ? "最近 HTML 发布失败" : "Recent HTML publish failures"}</div>
              {recentHtmlFailures.map((publication) => (
                <div key={publication.id}>
                  {publication.contentType} {publication.contentId}: {publication.error ?? (isZh ? "未知错误" : "Unknown error")}
                </div>
              ))}
            </div>
          ) : null}

          <button className="h-11 justify-self-start rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800">
            {isZh ? "保存 HTML 推送设置" : "Save HTML push settings"}
          </button>
        </form>
      </section>

      {/* ── System status ──────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{t.aiRuntime}</h2>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                {aiStatus.configured ? t.aiConfigured : t.aiNotConfigured}
              </p>
              <p className="mt-1 text-xs leading-5 text-stone-400">
                {aiStatus.provider} · {aiStatus.model} · {aiStatus.baseUrl}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${aiStatus.configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
              {aiStatus.mode === "live" ? t.aiLive : t.aiFallback}
            </span>
          </div>

          <div className="mt-5 border-t border-stone-100 pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
              {isZh ? "投递健康" : "Delivery health"}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-stone-50 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-stone-400">{t.recent}</div>
                <div className="mt-1 text-xl font-semibold">{deliveryHealth.total}</div>
              </div>
              <div className="rounded-xl bg-emerald-50 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-600">{t.success}</div>
                <div className="mt-1 text-xl font-semibold text-emerald-700">{deliveryHealth.success}</div>
              </div>
              <div className="rounded-xl bg-rose-50 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-rose-600">{t.failed}</div>
                <div className="mt-1 text-xl font-semibold text-rose-700">{deliveryHealth.error}</div>
              </div>
              <div className="rounded-xl bg-stone-100 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{t.channels}</div>
                <div className="mt-1 text-xl font-semibold text-stone-800">{configuredDeliveryChannels.length}</div>
                <div className="mt-0.5 text-[10px] text-stone-500">
                  {configuredDeliveryChannels.length > 0 ? configuredDeliveryChannels.map((c) => c.name).join(" · ") : t.noneConfigured}
                </div>
              </div>
            </div>
            {recentDeliveryErrors.length > 0 ? (
              <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">{isZh ? "最近失败" : "Recent failures"}</div>
                <div className="mt-2 grid gap-1.5">
                  {recentDeliveryErrors.map((log) => (
                    <div key={log.id} className="text-xs leading-5 text-rose-700">
                      <span className="font-semibold">{log.payloadType}</span>: {log.error ?? (isZh ? "未知错误" : "Unknown error")}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <h2 className="mb-1 text-base font-semibold">{t.adaptersTitle}</h2>
          <p className="mb-4 text-xs leading-5 text-stone-500">{t.adaptersDescription}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {deliveryChannels.map((channel) => (
              <article key={channel.type} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-stone-900">{channel.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${channel.enabled ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>
                    {channel.enabled ? "on" : "off"}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-stone-500">
                  {channel.formatGuide.contentTypes.join(", ")} · max {channel.formatGuide.maxPayloadCharacters.toLocaleString()} chars
                </p>
                <form action={testDeliveryChannelAction} className="mt-2">
                  <input type="hidden" name="channel" value={channel.type} />
                  <button
                    type="submit"
                    disabled={!channel.enabled}
                    className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[10px] font-semibold text-stone-800 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isZh ? "测试发送" : "Test send"}
                  </button>
                </form>
              </article>
            ))}
          </div>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-stone-950 p-3 text-xs leading-5 text-stone-200">
            {JSON.stringify(slackPreview, null, 2)}
          </pre>
        </section>
      </div>

      {/* ── Logs ──────────────────────────────────────────────────────── */}
      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <div className="mb-5 flex items-center justify-between border-b border-stone-100 pb-4">
          <div>
            <h2 className="text-xl font-semibold">{t.logsTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">{t.logsDescription}</p>
          </div>
          <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
            {recentLogs.length} {t.entries}
          </span>
        </div>

        {recentLogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
            {t.noDeliveries}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentLogs.map((log) => (
              <article key={log.id} className="rounded-[20px] border border-stone-200 bg-stone-50 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.16em] text-stone-400">
                      {t.brief} {log.briefId}
                    </p>
                    <p className="text-sm text-stone-600">{log.endpoint}</p>
                    <p className="text-xs uppercase tracking-[0.14em] text-stone-400">{log.payloadType}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${log.status === "success" ? "bg-emerald-100 text-emerald-700" : log.status === "error" ? "bg-rose-100 text-rose-700" : "bg-stone-200 text-stone-700"}`}>
                    {log.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-500">
                  <span>{t.started} {new Date(log.startedAt).toLocaleString()}</span>
                  {log.responseStatus ? <span>HTTP {log.responseStatus}</span> : null}
                  {log.error ? <span>{log.error}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
