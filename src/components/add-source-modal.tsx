"use client";

import { useRef } from "react";
import { AddSourceForm } from "@/components/add-source-form";
import type { DiscoveryCategory } from "@/lib/discovery-catalog";

type AddSourceModalProps = {
  categoryOptions: DiscoveryCategory[];
  isZh: boolean;
  labels: {
    addSource: string;
    addSourceDescription: string;
    sourceType: string;
    sourceTitle: string;
    feedUrl: string;
    telegramHelp: string;
    saveSource: string;
  };
};

export function AddSourceModal({ categoryOptions, isZh, labels }: AddSourceModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[20px] border border-stone-900/10 bg-white px-4 text-sm font-semibold text-stone-900 shadow-[0_8px_24px_rgba(33,24,9,0.06)] transition hover:bg-stone-50"
      >
        <span className="text-base leading-none">+</span>
        <span>{isZh ? "添加自定义来源" : "Add custom source"}</span>
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-stone-900/10 p-0 shadow-[0_32px_80px_rgba(33,24,9,0.18)] backdrop:bg-stone-950/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
              {isZh ? "自定义来源" : "Custom source"}
            </span>
            <button
              onClick={() => dialogRef.current?.close()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <AddSourceForm categoryOptions={categoryOptions} isZh={isZh} labels={labels} />
        </div>
      </dialog>
    </>
  );
}
