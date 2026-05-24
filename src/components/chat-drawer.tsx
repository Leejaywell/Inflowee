"use client";

import { useState } from "react";
import { ChatConsole, type ChatConsoleLabels } from "./chat-console";
import { ChatMessageRecord } from "@/lib/store";

type ChatDrawerProps = {
  briefId: string;
  briefTitle: string;
  initialMessages: ChatMessageRecord[];
  labels?: Partial<ChatConsoleLabels>;
  triggerLabel?: string;
  drawerLabel?: string;
  title?: string;
  subtitle?: string;
};

export function ChatDrawer({
  briefId,
  briefTitle,
  initialMessages,
  labels,
  triggerLabel = "Discuss with AI",
  drawerLabel = "CONTEXTUAL BRIEFS CHAT",
  title = "Grounded Conversation",
  subtitle = "Ask questions grounded strictly in this brief's cited papers/articles.",
}: ChatDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Inline trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#0057ff] px-5 text-sm font-semibold text-white shadow-lg shadow-[#0057ff]/15 transition hover:bg-[#0049d6] active:scale-95"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-4 h-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        {triggerLabel}
      </button>

      {/* Slide-out Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-stone-900/30 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer body */}
          <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col animate-slide-in">
            {/* Header / Dismiss Bar */}
            <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/50 px-5 py-4">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-[#0057ff] uppercase tracking-wider block">
                  {drawerLabel}
                </span>
                <h3 className="font-semibold text-stone-950 text-sm truncate mt-0.5" title={briefTitle}>
                  {briefTitle}
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center border border-stone-200 bg-white hover:bg-stone-50 text-stone-500 hover:text-stone-700 transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Inner Console */}
            <div className="flex-1 p-4">
              <ChatConsole
                scopeType="brief"
                scopeId={briefId}
                initialMessages={initialMessages}
                title={title}
                subtitle={subtitle}
                labels={labels}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
