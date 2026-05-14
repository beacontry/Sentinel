"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Square, Sparkles, Trash2 } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AiChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  "What's the current market sentiment?",
  "Summarize recent signals on my watchlist",
  "Which sectors are showing relative strength?",
  "Analyze the risk/reward on NVDA",
  "What macro events should I watch this week?",
  "Explain the RSI divergence setup",
];

export function AiChat({ isOpen, onClose }: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content.trim(),
          sessionId: sessionId ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!sessionId && data.sessionId) {
        setSessionId(data.sessionId);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Something went wrong. ${(err as Error).message}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingContent("");
  };

  const clearChat = () => {
    setMessages([]);
    setStreamingContent("");
    setSessionId(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 z-40 bg-bg-primary backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
        onClick={onClose}
        aria-label="Close AI chat"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 flex w-full flex-col border-l border-border bg-bg-secondary shadow-2xl sm:w-[420px] animate-slide-in-right">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Beacontry AI
              </h2>
              <p className="text-[10px] text-text-muted">
                Trading research assistant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-secondary"
                title="Clear chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="space-y-5 pt-8">
              <div className="text-center space-y-2">
                <Sparkles className="mx-auto h-8 w-8 text-accent/40" />
                <p className="text-sm font-medium text-text-secondary">
                  AI-powered trading research
                </p>
                <p className="text-xs text-text-muted">
                  Ask about markets, signals, sectors, or strategy
                </p>
              </div>
              <div className="space-y-2 pt-2">
                <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Suggested
                </p>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-left text-xs text-text-secondary transition-all hover:border-border hover:bg-bg-surface"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-accent/15 text-text-primary border border-accent/20"
                    : "bg-bg-surface text-text-primary border border-border"
                }`}
              >
                <MessageContent content={msg.content} />
              </div>
            </div>
          ))}

          {isStreaming && streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl border border-border bg-bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-text-primary">
                <MessageContent content={streamingContent} />
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent/60" />
              </div>
            </div>
          )}

          {isStreaming && !streamingContent && (
            <div className="flex justify-start">
              <div className="rounded-xl border border-border bg-bg-surface px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <div className="flex gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                  Thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about markets, signals, strategy..."
              rows={1}
              className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-xl border border-border bg-bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent/50 focus:outline-none"
              style={{ fieldSizing: "content" } as React.CSSProperties}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button
                onClick={handleStop}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bearish/15 text-bearish transition-colors hover:bg-bearish/25"
                title="Stop generating"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-30"
                title="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[10px] text-text-muted">
            AI may produce inaccurate analysis. Always verify before trading.
          </p>
        </div>
      </div>
    </>
  );
}

function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-1.5 whitespace-pre-wrap break-words">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <p
              key={i}
              className="mt-2 text-xs font-semibold uppercase tracking-wider text-accent first:mt-0"
            >
              {line.replace(/^##\s*/, "")}
            </p>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <p key={i} className="mt-1.5 font-semibold text-text-primary first:mt-0">
              {line.replace(/^###\s*/, "")}
            </p>
          );
        }
        if (/^[-*]\s/.test(line)) {
          return (
            <p
              key={i}
              className="relative pl-3 before:absolute before:left-0 before:top-[9px] before:h-1 before:w-1 before:rounded-full before:bg-accent/60 before:content-['']"
            >
              {renderInline(line.replace(/^[-*]\s/, ""))}
            </p>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          return (
            <p key={i} className="pl-3">
              {renderInline(line)}
            </p>
          );
        }
        if (!line.trim()) {
          return <div key={i} className="h-1" />;
        }
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const matches = [
      boldMatch ? { type: "bold" as const, index: boldMatch.index!, match: boldMatch } : null,
      codeMatch ? { type: "code" as const, index: codeMatch.index!, match: codeMatch } : null,
    ]
      .filter(Boolean)
      .sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    if (first.index > 0) {
      parts.push(remaining.slice(0, first.index));
    }

    if (first.type === "bold") {
      parts.push(
        <strong key={key++} className="font-semibold text-text-primary">
          {first.match[1]}
        </strong>
      );
    } else {
      parts.push(
        <code
          key={key++}
          className="rounded bg-bg-primary px-1 py-0.5 font-mono text-xs text-accent"
        >
          {first.match[1]}
        </code>
      );
    }
    remaining = remaining.slice(first.index + first.match[0].length);
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}
