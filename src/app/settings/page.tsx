import { saveWebhookEndpoint } from "@/app/actions";
import {
  defaultStore,
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
  const [settings, recentLogs, params] = await Promise.all([
    Promise.resolve(getWebhookSettings(defaultStore)),
    Promise.resolve(listRecentDeliveryLogs(defaultStore, 12)),
    searchParams,
  ]);
  const error = params?.error;
  const updated = params?.updated;

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <span className="inline-flex rounded-full bg-[#0057ff] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white">
            Delivery settings
          </span>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Configure a single HTTPS webhook for brief delivery.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
              Manual delivery stays explicit in this slice. Configure one
              endpoint, then send individual briefs from the inbox detail view.
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
              defaultValue={settings.endpoint ?? ""}
              placeholder="https://example.com/webhook"
              className="h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-white outline-none transition focus:border-white/30 focus:bg-white/15"
            />
          </label>

          <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-4 text-sm font-medium text-stone-950 transition hover:bg-stone-100">
            Save webhook
          </button>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-300">
            {settings.endpoint
              ? `Current endpoint: ${settings.endpoint}`
              : "No webhook configured yet."}
          </div>
        </form>
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
              : "Update applied."}
        </section>
      )}

      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Recent delivery logs</h2>
            <p className="text-sm leading-6 text-stone-500">
              Latest manual webhook sends across all briefs.
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
    </div>
  );
}
