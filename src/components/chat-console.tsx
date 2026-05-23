"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { submitChatMessage, clearChatThread } from "@/app/actions-chat";
import { ChatMessageRecord } from "@/lib/store";

type ChatConsoleProps = {
  scopeType: "global" | "space" | "task" | "brief";
  scopeId: string;
  initialMessages: ChatMessageRecord[];
  title?: string;
  subtitle?: string;
};

export function ChatConsole({
  scopeType,
  scopeId,
  initialMessages,
  title = "AI Contextual Assistant",
  subtitle = "Grounded on active spaces, tasks, and briefs.",
}: ChatConsoleProps) {
  const [messages, setMessages] = useState<ChatMessageRecord[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync with server messages updates during rendering, avoiding useEffect warning
  const [prevInitialMessages, setPrevInitialMessages] = useState<ChatMessageRecord[]>(initialMessages);
  if (initialMessages !== prevInitialMessages) {
    setPrevInitialMessages(initialMessages);
    setMessages(initialMessages);
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    // Optimistic user message insertion
    const tempUserMsg: ChatMessageRecord = {
      id: Math.random().toString(),
      threadId: "temp",
      role: "user",
      content: userMessage,
      citations: null,
      provenance: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);

    startTransition(async () => {
      try {
        await submitChatMessage(scopeType, scopeId, userMessage);
      } catch (err) {
        console.error("Failed to send chat message:", err);
      } finally {
        setIsLoading(false);
      }
    });
  };

  const handleClear = () => {
    if (confirm("Are you sure you want to clear chat history for this console?")) {
      startTransition(async () => {
        try {
          await clearChatThread(scopeType, scopeId);
          setMessages([]);
        } catch (err) {
          console.error("Failed to clear chat thread:", err);
        }
      });
    }
  };

  return (
    <div className="flex h-[550px] flex-col rounded-[24px] border border-stone-900/10 bg-white shadow-[0_16px_50px_rgba(33,24,9,0.06)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/50 px-5 py-4">
        <div>
          <h3 className="font-semibold text-stone-950 text-base">{title}</h3>
          <p className="text-xs text-stone-500 mt-0.5">
            {subtitle} Empty task scopes can fall back to sibling space context,
            then to bounded live fetch.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            title="Clear Chat History"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-stone-50/30">
        {messages.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="h-10 w-10 rounded-full bg-[#0057ff]/10 flex items-center justify-center text-[#0057ff]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-stone-800">
                Start a grounded conversation
              </p>
              <p className="text-xs text-stone-500 max-w-xs mt-1 leading-normal">
                Ask questions about latest topics, updates, and materials in this scope.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? "bg-stone-950 text-stone-50 rounded-br-sm shadow-sm"
                        : "bg-white border border-stone-200/80 text-stone-850 rounded-bl-sm shadow-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>

                    {!isUser &&
                      (message.provenance ||
                        (message.citations && message.citations.length > 0)) && (
                        <div className="mt-3 border-t border-stone-100 pt-2 text-xs">
                          {message.provenance && (
                            <span className="mb-2 inline-flex rounded-full bg-stone-100 px-2 py-0.5 font-semibold text-stone-500">
                              {message.provenance === "mixed"
                                ? "Live context"
                                : "Stored context"}
                            </span>
                          )}
                          {message.citations && message.citations.length > 0 && (
                            <ul className="space-y-1">
                              {message.citations.map((cite, idx) => (
                                <li key={idx} className="truncate">
                                  <a
                                    href={cite}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#0057ff] hover:underline"
                                  >
                                    {cite}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-[20px] rounded-bl-sm bg-white border border-stone-200/80 px-4 py-3 shadow-sm text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-stone-400 font-medium">
                      AI is synthesizing grounding context
                    </span>
                    <div className="flex space-x-1">
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:0.2s]" />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSend}
        className="border-t border-stone-100 bg-stone-50/50 p-4 flex gap-2"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isLoading}
          placeholder="Ask a clarifying or follow-up question..."
          className="flex-1 h-11 bg-white border border-stone-200 rounded-xl px-4 text-sm outline-none placeholder-stone-400 focus:border-stone-400 transition"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          className={`h-11 px-4 rounded-xl flex items-center justify-center text-sm font-semibold transition ${
            inputValue.trim() && !isLoading
              ? "bg-[#0057ff] text-white hover:bg-[#0049d6]"
              : "bg-stone-200 text-stone-400 cursor-not-allowed"
          }`}
        >
          Send
        </button>
      </form>
    </div>
  );
}
