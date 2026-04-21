import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limiter";
import { CLAUDE_CONFIG } from "@/lib/config";
import { getFilingContent } from "@/lib/sec-filings";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("filings-chat");

const chatBodySchema = z.object({
  symbol: z.string().min(1).max(10),
  question: z.string().min(1).max(1000),
  filingUrl: z.string().url().optional(),
});

const FILING_CHAT_SYSTEM = `You are an SEC filing analyst assistant. You help investors understand SEC filings in plain English.

When answering questions about filings:
- Be specific and cite relevant sections when possible
- Explain financial jargon in simple terms
- Highlight key risks, financial metrics, and material events
- If the filing content is limited or unavailable, say so and provide general guidance
- Keep answers focused and under 400 words
- Do not provide investment advice or recommendations`;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 req/min per user
  const { allowed } = rateLimit(`filing-chat:${session.userId}`, 10, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = chatBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { symbol, question, filingUrl } = parsed.data;

  if (!CLAUDE_CONFIG.apiKey) {
    return NextResponse.json(
      { error: "AI features require a Groq API key to be configured." },
      { status: 503 }
    );
  }

  // Fetch filing content if URL provided
  let filingContext = "";
  if (filingUrl) {
    filingContext = await getFilingContent(filingUrl);
  }

  const userContent = [
    `Symbol: ${symbol.toUpperCase()}`,
    filingContext ? `\n[Filing Content]\n${filingContext}\n[End Filing Content]` : "",
    `\nQuestion: ${question}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CLAUDE_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: CLAUDE_CONFIG.model,
        messages: [
          { role: "system", content: FILING_CHAT_SYSTEM },
          { role: "user", content: userContent },
        ],
        max_tokens: CLAUDE_CONFIG.chatMaxTokens,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`Groq API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const tokensUsed = data.usage?.total_tokens ?? 0;

    return NextResponse.json(
      { answer: text, tokensUsed },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Filing chat error");
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
