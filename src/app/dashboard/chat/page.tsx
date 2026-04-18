"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Plus,
  MessageSquare,
  Sparkles,
  User,
  Square,
  Trash2,
} from "lucide-react";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import type { ChatMessageData, ChatSession } from "@/types";

const SUGGESTED_PROMPTS = [
  "What's the current market sentiment across major indices?",
  "Summarize the strongest signals in my watchlist",
  "Which sectors are rotating into leadership this week?",
  "Analyze the technical setup on NVDA — support, resistance, and momentum",
  "What macro events could impact markets this week?",
  "Compare the risk/reward profile of my current positions",
];

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch("/api/chat");
        if (!res.ok) return;
        const data = await res.json();
        setSessions(data.sessions ?? []);
      } catch {
        // Non-critical
      } finally {
        setLoadingSessions(false);
      }
    }
    loadSessions();
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(
        `/api/chat?sessionId=${encodeURIComponent(sessionId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    }
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  function startNewSession() {
    setActiveSessionId(null);
    setMessages([]);
    setStreamingContent("");
    inputRef.current?.focus();
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setInput("");
    setStreamingContent("");

    const tempMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sessionId: activeSessionId ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: err.error ?? "Something went wrong. Please try again.",
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }

      const data = await res.json();

      if (!activeSessionId && data.sessionId) {
        setActiveSessionId(data.sessionId);
        setSessions((prev) => [
          {
            sessionId: data.sessionId,
            firstMessage: trimmed.slice(0, 100),
            lastMessageAt: new Date().toISOString(),
            messageCount: 2,
          },
          ...prev,
        ]);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.response,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Failed to connect. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setSending(false);
    setStreamingContent("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function deleteSession(sessionId: string) {
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }
    await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="px-4 pt-4 lg:px-6 lg:pt-6">
        <SubNav tabs={SUB_NAV.chat} />
      </div>
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
      {/* Session sidebar */}
      <div className="hidden w-72 shrink-0 flex-col border-r border-border bg-bg-secondary lg:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
            </div>
            <span className="text-sm font-semibold">Research</span>
          </div>
          <Button variant="ghost" size="sm" onClick={startNewSession}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loadingSessions ? (
            <div className="flex justify-center py-8">
              <div className="h-4 w-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-text-muted">
              No conversations yet
            </p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.sessionId}
                className={`group flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  activeSessionId === s.sessionId
                    ? "bg-accent/10 text-accent"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                <button
                  onClick={() => setActiveSessionId(s.sessionId)}
                  className="flex min-h-[36px] flex-1 items-start gap-2 text-left"
                >
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-2 leading-snug text-[13px]">
                    {s.firstMessage || "New conversation"}
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.sessionId);
                  }}
                  className="mt-0.5 shrink-0 rounded p-1 text-text-muted opacity-0 transition-all hover:bg-bearish/10 hover:text-bearish group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile session bar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 lg:hidden">
          <Button variant="ghost" size="sm" onClick={startNewSession}>
            <Plus className="h-4 w-4" />
            New
          </Button>
          {activeSessionId && (
            <Badge variant="accent" className="truncate max-w-[200px]">
              {sessions.find((s) => s.sessionId === activeSessionId)?.firstMessage?.slice(0, 40) || "Chat"}
            </Badge>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !sending ? (
            <div className="flex h-full flex-col items-center justify-center px-4 py-12">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-elevated">
                <Sparkles className="h-7 w-7 text-accent/50" />
              </div>
              <h2 className="mb-2 text-xl font-semibold tracking-tight">
                AI Research Terminal
              </h2>
              <p className="mb-8 max-w-md text-center text-sm text-text-secondary">
                Ask about markets, signals, sector performance, macro events, or
                anything else. I have access to your watchlist, signals, and
                market data.
              </p>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                    className="rounded-xl border border-border/50 bg-bg-surface/50 px-4 py-3 text-left text-[13px] text-text-secondary transition-all hover:border-border hover:bg-bg-surface hover:text-text-primary"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 p-4 lg:p-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                >
                  {msg.role === "assistant" && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                      <Sparkles className="h-4 w-4 text-accent" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-accent/15 text-text-primary border border-accent/20"
                        : "bg-bg-surface text-text-primary border border-border/50"
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.content}</div>
                  </div>
                  {msg.role === "user" && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-elevated">
                      <User className="h-4 w-4 text-text-secondary" />
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex gap-3">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                    <Sparkles className="h-4 w-4 text-accent" />
                  </div>
                  <div className="rounded-xl border border-border/50 bg-bg-surface px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      Thinking...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-bg-secondary/50 p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about markets, signals, strategy..."
              rows={1}
              className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl border border-border bg-bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent/50 focus:outline-none"
              style={{ fieldSizing: "content" } as React.CSSProperties}
              disabled={sending}
            />
            {sending ? (
              <button
                onClick={handleStop}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bearish/15 text-bearish transition-colors hover:bg-bearish/25"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!input.trim()}
                className="h-11 w-11 rounded-xl p-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-text-muted">
            AI may produce inaccurate analysis. Always verify before trading.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
