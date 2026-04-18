import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limiter";
import { CLAUDE_CONFIG } from "@/lib/config";
import { getFilingContent } from "@/lib/sec-filings";

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
      { error: "AI features require an Anthropic API key to be configured." },
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
    const client = new Anthropic({ apiKey: CLAUDE_CONFIG.apiKey });

    const response = await client.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: CLAUDE_CONFIG.chatMaxTokens,
      system: FILING_CHAT_SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return NextResponse.json(
      {
        answer: text,
        tokensUsed: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Filing chat error:", message);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
