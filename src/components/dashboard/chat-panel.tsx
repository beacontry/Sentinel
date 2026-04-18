"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Send, Plus, MessageSquare, Bot, User, Loader2 } from "lucide-react";
import type { ChatMessageData, ChatSession } from "@/types";

interface ChatPanelProps {
  fullPage?: boolean;
}

export function ChatPanel({ fullPage = false }: ChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions on mount
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

  // Load messages when session changes
  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`);
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function startNewSession() {
    setActiveSessionId(null);
    setMessages([]);
    inputRef.current?.focus();
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setInput("");

    // Optimistic user message
    const tempMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sessionId: activeSessionId ?? undefined,
        }),
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

      // Set session ID if new
      if (!activeSessionId && data.sessionId) {
        setActiveSessionId(data.sessionId);
        // Add to sessions list
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

      // Add assistant response
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.response,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch {
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
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const containerHeight = fullPage ? "h-[calc(100vh-8rem)]" : "h-[500px]";

  return (
    <div className={`flex gap-4 ${containerHeight}`}>
      {/* Session sidebar */}
      {fullPage && (
        <div className="w-64 shrink-0 hidden lg:flex flex-col rounded-xl border border-border bg-bg-surface">
          <div className="p-3 border-b border-border">
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={startNewSession}
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingSessions ? (
              <div className="flex justify-center py-4">
                <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">
                No conversations yet
              </p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => setActiveSessionId(s.sessionId)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                    min-h-[44px] flex items-start gap-2
                    ${activeSessionId === s.sessionId
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
                    }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="line-clamp-2 leading-snug">
                    {s.firstMessage || "New conversation"}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Chat area */}
      <Card className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-12 h-12 text-text-muted mb-4" />
              <h3 className="font-display text-lg font-semibold mb-2">
                AI Market Chat
              </h3>
              <p className="text-sm text-text-secondary max-w-sm">
                Ask questions about the market, your signals, sector performance,
                or anything else. I have access to your market data and news.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-md">
                {[
                  "Why did the market go up today?",
                  "Which sectors are performing best?",
                  "Summarize recent signals",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                      inputRef.current?.focus();
                    }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border
                      text-text-secondary hover:text-accent hover:border-accent/30
                      transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-accent" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed
                    ${msg.role === "user"
                      ? "bg-accent text-white"
                      : "bg-bg-elevated text-text-primary"
                    }`}
                >
                  <div className="whitespace-pre-line">{msg.content}</div>
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-bg-elevated flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-text-secondary" />
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-accent" />
              </div>
              <div className="bg-bg-elevated rounded-xl px-4 py-3">
                <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the market..."
              rows={1}
              className="flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2.5
                text-sm text-text-primary placeholder:text-text-muted
                resize-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                min-h-[44px] max-h-32"
            />
            <Button
              variant="primary"
              size="md"
              onClick={handleSend}
              disabled={!input.trim() || sending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
