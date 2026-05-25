"use client";

import { useRef, useState } from "react";

export const AVATAR_OPTIONS = [
  { id: "🎯", bg: "bg-blue-100", color: "text-blue-700" },
  { id: "🔭", bg: "bg-violet-100", color: "text-violet-700" },
  { id: "⚡", bg: "bg-amber-100", color: "text-amber-700" },
  { id: "🌿", bg: "bg-emerald-100", color: "text-emerald-700" },
  { id: "🧭", bg: "bg-rose-100", color: "text-rose-700" },
  { id: "📡", bg: "bg-cyan-100", color: "text-cyan-700" },
  { id: "📚", bg: "bg-orange-100", color: "text-orange-700" },
  { id: "🔥", bg: "bg-red-100", color: "text-red-700" },
] as const;

type Props = {
  isZh: boolean;
  nickname: string | null;
  avatar: string | null;
  userEmail: string | null;
  signOutAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  saveUserProfileAction?: ((formData: FormData) => void | Promise<void>) | undefined;
};

function AvatarCircle({
  avatar,
  size = "md",
}: {
  avatar: string | null;
  size?: "sm" | "md";
}) {
  const opt = AVATAR_OPTIONS.find((o) => o.id === avatar) ?? AVATAR_OPTIONS[0];
  const sizeClass = size === "sm" ? "h-7 w-7 text-sm" : "h-9 w-9 text-base";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${opt.bg} ${opt.color} ${sizeClass} select-none`}
    >
      {opt.id}
    </span>
  );
}

export function UserProfileButton({
  isZh,
  nickname,
  avatar,
  userEmail,
  signOutAction,
  saveUserProfileAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedAvatar, setSelectedAvatar] = useState(avatar ?? AVATAR_OPTIONS[0].id);

  const hasProfile = Boolean(nickname);

  function openSetup() {
    setOpen(false);
    dialogRef.current?.showModal();
  }

  if (!userEmail) return null;

  return (
    <>
      {/* Avatar + nickname button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--app-surface-alt)]"
        >
          <AvatarCircle avatar={avatar} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--app-ink)]">
              {nickname ?? (isZh ? "设置昵称" : "Set nickname")}
            </span>
            <span className="block truncate text-[10px] leading-4 text-[var(--app-muted)]">
              {userEmail}
            </span>
          </span>
          <span className="shrink-0 text-[10px] text-[var(--app-muted)]">
            {open ? "▲" : "▼"}
          </span>
        </button>

        {open && (
          <div className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-surface)] shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
            <button
              type="button"
              onClick={openSetup}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm text-[var(--app-ink)] transition hover:bg-[var(--app-surface-alt)]"
            >
              <span>✏️</span>
              <span>{isZh ? "编辑个人资料" : "Edit profile"}</span>
            </button>
            {signOutAction && (
              <form action={signOutAction} className="border-t border-[color:var(--app-border)]">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm text-rose-600 transition hover:bg-rose-50"
                >
                  <span>→</span>
                  <span>{isZh ? "退出登录" : "Sign out"}</span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Profile setup dialog */}
      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-[24px] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop:bg-black/40"
        onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current?.close(); }}
      >
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isZh ? "个人资料" : "Your profile"}</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <form
            action={saveUserProfileAction}
            onSubmit={() => dialogRef.current?.close()}
          >
            {/* Avatar picker */}
            <div className="mb-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                {isZh ? "选择头像" : "Choose avatar"}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {AVATAR_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedAvatar(opt.id)}
                    className={`flex h-14 items-center justify-center rounded-2xl text-2xl transition ${
                      selectedAvatar === opt.id
                        ? `${opt.bg} ring-2 ring-offset-1 ring-stone-900`
                        : "bg-stone-100 hover:bg-stone-200"
                    }`}
                  >
                    {opt.id}
                  </button>
                ))}
              </div>
              <input type="hidden" name="avatar" value={selectedAvatar} />
            </div>

            {/* Nickname */}
            <div className="mb-5">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {isZh ? "昵称" : "Nickname"}
                </span>
                <input
                  name="nickname"
                  defaultValue={nickname ?? ""}
                  placeholder={isZh ? "最多 20 个字符" : "Up to 20 characters"}
                  maxLength={20}
                  required
                  className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </label>
            </div>

            <button
              type="submit"
              className="h-11 w-full rounded-xl bg-stone-950 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              {isZh ? "保存" : "Save"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
