import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { getClaudeClient } from "@/lib/claude";
import { gatherChatContext } from "@/lib/market-context";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { chatMessageSchema } from "@/lib/validators";
import { CLAUDE_CONFIG } from "@/lib/config";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("chat");

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const claude = getClaudeClient();
  if (!claude.isConfigured) {
    return NextResponse.json({
      configured: false,
      error: "ANTHROPIC_API_KEY not configured",
    }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { message, sessionId: providedSessionId } = parsed.data;
  const sessionId = providedSessionId ?? crypto.randomUUID();

  try {
    // Save user message
    await db.insert(chatMessages).values({
      userId: auth.userId,
      sessionId,
      role: "user",
      content: message,
    });

    // Fetch chat history for this session
    const history = await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.userId, auth.userId),
          eq(chatMessages.sessionId, sessionId)
        )
      )
      .orderBy(chatMessages.createdAt)
      .limit(CLAUDE_CONFIG.chatHistoryLimit);

    // Gather chat context (passes user question for symbol-aware context)
    const context = await gatherChatContext(message);

    // Generate response
    const result = await claude.chatCompletion(
      history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      context
    );

    // Save assistant response
    await db.insert(chatMessages).values({
      userId: auth.userId,
      sessionId,
      role: "assistant",
      content: result.response,
      contextData: context,
      tokensUsed: result.tokensUsed,
    });

    return NextResponse.json({
      sessionId,
      response: result.response,
      tokensUsed: result.tokensUsed,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message2 = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message2 }, "Chat error");
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  try {
    if (sessionId) {
      // Fetch messages for a specific session
      const messages = await db
        .select({
          id: chatMessages.id,
          role: chatMessages.role,
          content: chatMessages.content,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.userId, session.userId),
            eq(chatMessages.sessionId, sessionId)
          )
        )
        .orderBy(chatMessages.createdAt);

      return NextResponse.json({
        sessionId,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // List all sessions for the user
    const allMessages = await db
      .select({
        sessionId: chatMessages.sessionId,
        role: chatMessages.role,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.userId, session.userId))
      .orderBy(chatMessages.createdAt);

    // Group by session
    const sessionMap = new Map<string, { firstMessage: string; lastMessageAt: string; count: number }>();
    for (const msg of allMessages) {
      const existing = sessionMap.get(msg.sessionId);
      if (!existing) {
        sessionMap.set(msg.sessionId, {
          firstMessage: msg.role === "user" ? msg.content.slice(0, 100) : "",
          lastMessageAt: msg.createdAt.toISOString(),
          count: 1,
        });
      } else {
        existing.lastMessageAt = msg.createdAt.toISOString();
        existing.count++;
        if (!existing.firstMessage && msg.role === "user") {
          existing.firstMessage = msg.content.slice(0, 100);
        }
      }
    }

    const sessions = [...sessionMap.entries()]
      .map(([id, data]) => ({
        sessionId: id,
        firstMessage: data.firstMessage,
        lastMessageAt: data.lastMessageAt,
        messageCount: data.count,
      }))
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return NextResponse.json({ sessions }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Chat GET error");
    return NextResponse.json(
      { error: "Failed to load chat" },
      { status: 500 }
    );
  }
}
