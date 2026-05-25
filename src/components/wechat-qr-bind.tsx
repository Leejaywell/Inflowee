"use client";

import { useEffect, useRef, useState } from "react";
import { startWechatQrLoginAction, pollWechatQrStatusAction } from "@/app/actions";

type Phase = "idle" | "loading" | "qr" | "scaned" | "success" | "expired" | "error";

export function WechatQrBind({ isZh, isBound }: { isZh: boolean; isBound: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [qrcodeImgUrl, setQrcodeImgUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function startBind() {
    setPhase("loading");
    setErrorMsg(null);

    const result = await startWechatQrLoginAction();
    if (!result.ok || !result.sessionKey || !result.qrcodeImgUrl) {
      setPhase("error");
      setErrorMsg(result.error ?? null);
      return;
    }

    setQrcodeImgUrl(result.qrcodeImgUrl);
    setPhase("qr");

    const sessionKey = result.sessionKey;
    pollRef.current = setInterval(async () => {
      const poll = await pollWechatQrStatusAction(sessionKey);
      if (poll.status === "scaned") {
        setPhase("scaned");
      } else if (poll.status === "confirmed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase("success");
        setTimeout(() => window.location.reload(), 1500);
      } else if (poll.status === "expired") {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase("expired");
      } else if (poll.status === "error") {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase("error");
        setErrorMsg(poll.error ?? null);
      }
    }, 2000);
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase("idle");
    setQrcodeImgUrl(null);
    setErrorMsg(null);
  }

  const isActive = phase === "qr" || phase === "scaned";

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            isBound || phase === "success"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-stone-100 text-stone-500"
          }`}
        >
          {isBound || phase === "success"
            ? isZh ? "已绑定" : "bound"
            : isZh ? "未绑定" : "not bound"}
        </span>

        {!isActive && phase !== "loading" && phase !== "success" && (
          <button
            type="button"
            onClick={startBind}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-white transition hover:bg-stone-800"
          >
            {isBound ? (isZh ? "重新绑定" : "Re-bind") : (isZh ? "扫码绑定" : "Bind with QR")}
          </button>
        )}
      </div>

      {phase === "loading" && (
        <p className="py-4 text-center text-xs text-stone-400">
          {isZh ? "正在生成二维码…" : "Generating QR code…"}
        </p>
      )}

      {isActive && qrcodeImgUrl && (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrcodeImgUrl}
            alt="WeChat QR"
            width={192}
            height={192}
            className="size-48 rounded-xl"
          />
          <p className="text-center text-xs text-stone-500">
            {phase === "scaned"
              ? isZh ? "已扫码，请在微信中确认…" : "Scanned — confirm in WeChat…"
              : isZh ? "请用微信扫描二维码" : "Scan with WeChat"}
          </p>
          <button type="button" onClick={reset} className="text-[10px] text-stone-400 underline">
            {isZh ? "取消" : "Cancel"}
          </button>
        </div>
      )}

      {phase === "success" && (
        <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
          {isZh ? "微信绑定成功！" : "WeChat bound successfully!"}
        </div>
      )}

      {phase === "expired" && (
        <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          {isZh ? "二维码已过期，请重新生成。" : "QR code expired. Please try again."}
        </div>
      )}

      {phase === "error" && (
        <div className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
          {errorMsg ?? (isZh ? "绑定失败，请重试。" : "Binding failed. Please try again.")}
        </div>
      )}
    </div>
  );
}
