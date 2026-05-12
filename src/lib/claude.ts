import { CLAUDE_CONFIG } from "./config";
import { getLlmApiKey } from "./system-config";
import type { MarketContext, ChatContext } from "@/types";

interface DigestResult {
  summary: string;
  tokensUsed: number;
}

interface ChatResult {
  response: string;
  tokensUsed: number;
}

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const DIGEST_SYSTEM_PROMPT = `You are a concise financial market analyst writing a daily market recap for retail traders.

Your job is to synthesize the provided market data -- news headlines, sector performance, top movers, and recent technical signals -- into a clear, plain-English market narrative.

Structure your recap in 3-5 short paragraphs:
1. **Market overview**: What happened today? Did markets go up or down? By how much?
2. **Key drivers**: What news or events drove the moves? Cite specific headlines.
3. **Sector breakdown**: Which sectors outperformed or underperformed?
4. **Notable signals**: Highlight any strong technical signals from the data.
5. **Outlook** (optional): Brief forward-looking context if the data supports it.

Rules:
- Write in present/past tense, not future
- Use specific numbers (percentages, prices) from the data
- Keep each paragraph to 2-3 sentences
- No disclaimers or "not financial advice" -- the user knows
- If data is sparse, say so briefly and work with what you have`;

const CHAT_SYSTEM_PROMPT = `You are an AI market analyst assistant integrated into Sentinel, a trading intelligence platform.

You answer questions about the stock market using the provided context data (news, signals, sector performance, market digests). When answering:

- Cite specific data points from the context (prices, percentages, signal types)
- If the context doesn't contain enough info to answer, say so honestly
- Keep answers focused and under 300 words unless the question requires more detail
- Use plain English, not jargon
- Reference specific symbols, sectors, and news headlines when relevant
- You can discuss technical analysis concepts but ground them in the provided data`;

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function groqChat(messages: GroqMessage[], maxTokens: number): Promise<GroqResponse> {
  const apiKey = await getLlmApiKey();
  if (!apiKey) {
    throw new Error("LLM not configured — set GROQ_API_KEY in admin → System Config");
  }
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CLAUDE_CONFIG.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  return res.json();
}

class LLMClient {
  private lastDigestAt: number = 0;

  async isConfigured(): Promise<boolean> {
    return !!(await getLlmApiKey());
  }

  canGenerateDigest(): boolean {
    return Date.now() - this.lastDigestAt >= CLAUDE_CONFIG.digestRateLimitMs;
  }

  async generateMarketDigest(context: MarketContext, bypassRateLimit = false): Promise<DigestResult> {
    if (!bypassRateLimit && !this.canGenerateDigest()) {
      throw new Error("Rate limited: digest can only be generated once per hour");
    }

    const userPrompt = this.buildDigestPrompt(context);

    const response = await groqChat([
      { role: "system", content: DIGEST_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ], CLAUDE_CONFIG.digestMaxTokens);

    this.lastDigestAt = Date.now();

    const text = response.choices[0]?.message?.content ?? "";

    return {
      summary: text,
      tokensUsed: response.usage?.total_tokens ?? 0,
    };
  }

  async chatCompletion(history: ChatHistoryMessage[], context: ChatContext): Promise<ChatResult> {
    const contextBlock = this.buildChatContext(context);

    const messages: GroqMessage[] = [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      { role: "user", content: `[Market Context]\n${contextBlock}\n\n[End Context]` },
      { role: "assistant", content: "I've reviewed the current market context. What would you like to know?" },
      ...history.slice(-(CLAUDE_CONFIG.chatHistoryLimit)),
    ];

    const response = await groqChat(messages, CLAUDE_CONFIG.chatMaxTokens);

    const text = response.choices[0]?.message?.content ?? "";

    return {
      response: text,
      tokensUsed: response.usage?.total_tokens ?? 0,
    };
  }

  private buildDigestPrompt(ctx: MarketContext): string {
    const parts: string[] = [`Date: ${ctx.date}`];

    if (ctx.news.length > 0) {
      parts.push("\n## Market News");
      for (const a of ctx.news.slice(0, 15)) {
        parts.push(`- [${a.source}] ${a.headline}: ${a.summary.slice(0, 200)}`);
      }
    }

    if (ctx.sectorPerformance.length > 0) {
      parts.push("\n## Sector Performance");
      for (const s of ctx.sectorPerformance) {
        const syms = s.symbols.map((x) => `${x.symbol} ${x.changePct >= 0 ? "+" : ""}${x.changePct.toFixed(2)}%`).join(", ");
        parts.push(`- ${s.sector} (avg ${s.avgChange >= 0 ? "+" : ""}${s.avgChange.toFixed(2)}%): ${syms}`);
      }
    }

    if (ctx.topGainers.length > 0) {
      parts.push("\n## Top Gainers");
      for (const g of ctx.topGainers) {
        parts.push(`- ${g.symbol}: +${g.changePct.toFixed(2)}% ($${g.price.toFixed(2)})`);
      }
    }

    if (ctx.topLosers.length > 0) {
      parts.push("\n## Top Losers");
      for (const l of ctx.topLosers) {
        parts.push(`- ${l.symbol}: ${l.changePct.toFixed(2)}% ($${l.price.toFixed(2)})`);
      }
    }

    if (ctx.recentSignals.length > 0) {
      parts.push("\n## Recent Technical Signals");
      for (const s of ctx.recentSignals) {
        parts.push(`- ${s.symbol} [${s.signal}] (${(s.confidence * 100).toFixed(0)}%): ${s.plainEnglish.slice(0, 150)}`);
      }
    }

    return parts.join("\n");
  }

  private buildChatContext(ctx: ChatContext): string {
    const parts: string[] = [];

    if (ctx.recentDigest) {
      parts.push(`## Today's Market Recap\n${ctx.recentDigest}`);
    }

    if (ctx.news.length > 0) {
      parts.push("\n## Recent News");
      for (const a of ctx.news.slice(0, 10)) {
        parts.push(`- ${a.headline}: ${a.summary.slice(0, 150)}`);
      }
    }

    if (ctx.topMovers.length > 0) {
      parts.push("\n## Top Movers");
      for (const m of ctx.topMovers) {
        parts.push(`- ${m.symbol}: ${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(2)}%`);
      }
    }

    if (ctx.relevantSignals.length > 0) {
      parts.push("\n## Recent Signals");
      for (const s of ctx.relevantSignals) {
        parts.push(`- ${s.symbol} [${s.signal}]: ${s.plainEnglish.slice(0, 150)}`);
      }
    }

    if (ctx.educationGuides && ctx.educationGuides.length > 0) {
      parts.push("\n## Relevant Sentinel Education Guides");
      parts.push(
        "When you reference these in your answer, cite them as a Markdown link in this format:",
      );
      parts.push(
        "[Guide Title — section](/dashboard/education/guides/<slug>#<sectionId>)",
      );
      for (const g of ctx.educationGuides) {
        parts.push(
          `- [${g.title} — ${g.sectionHeading}](/dashboard/education/guides/${g.slug}#${g.sectionId}): ${g.snippet}`,
        );
      }
    }

    return parts.join("\n");
  }
}

// Singleton
const g = globalThis as typeof globalThis & { __claudeClient?: LLMClient };
g.__claudeClient ??= new LLMClient();

export function getClaudeClient(): LLMClient {
  return g.__claudeClient!;
}
