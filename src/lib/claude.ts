import { CLAUDE_CONFIG } from "./config";
import { getLlmApiKey } from "./system-config";
import { recordApiUsage } from "./api-usage";
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

const CHAT_SYSTEM_PROMPT = `You are an AI market analyst assistant integrated into Beacontry, a trading intelligence platform.

Data freshness is the most important rule. The context block tells you the current server time and stamps every data point with when it was captured. **Never characterize "current" or "right now" market state using data more than 30 minutes old.** If the user asks about the market's state *right now* and the data you have is older than that, lead with the staleness — name the timestamps, then describe what the latest data showed, then say conditions may have shifted.

Specifically:

- Every market-state claim (sentiment, direction, sector performance, mover lists) must include an "as of HH:MM ET" timestamp derived from the data's stamp, never from the current server time. A claim with no source-timestamp is forbidden.
- **The "Live Tape" section, when present, is your only source for "right now" SPY/QQQ price + change.** The Top Movers list is daily-bar diffs and can lag the live tape significantly intraday. If asked about the current market, prefer the Live Tape and explicitly say so.
- The Market Digest is generated once per hour. If its generatedAt is more than 60 minutes before the current server time, say so before quoting it.
- If the current market session is "pre-market" and the user asks about the live session, note that regular hours haven't opened yet or are about to.
- When data is stale relative to the user's question, recommend they look at the live trader / momentum / dashboard surfaces for current state — don't pretend to know what you can't see.

When answering:

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

/**
 * Format an ISO timestamp as "HH:MM ET" for prompt context. The LLM needs
 * a human-readable per-piece timestamp to enforce the "as of HH:MM" rule
 * — embedding raw ISO strings is unreliable across model versions.
 */
function fmtEt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
      hourCycle: "h23",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function pctStr(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
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
  // Bound the request — every other Groq call site (ai-scoring, quick-insights,
  // sentiment) has a timeout; without one a hung connection blocks the market
  // digest / AI chat indefinitely. 20s matches quick-insights.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    // Track the failed call (counts as a request + error, 0 tokens billed).
    recordApiUsage("groq", { error: true });
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as GroqResponse;
  // Fire-and-forget usage tracking — never blocks the caller.
  recordApiUsage("groq", { tokensUsed: json.usage?.total_tokens ?? 0 });
  return json;
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

    // Note: no priming "I've reviewed the current market context" assistant
    // turn — that wording made the model treat the context as live regardless
    // of timestamps. Context goes in as a system-level brief and the model
    // makes the first turn directly in response to the user.
    const messages: GroqMessage[] = [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      { role: "system", content: `[Market Context]\n${contextBlock}\n\n[End Context]` },
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

    // Lead with current time + session so every claim that follows can be
    // age-checked against it.
    const nowEt = fmtEt(ctx.currentServerTime);
    parts.push(`## Current Server Time`);
    parts.push(
      `- Now: ${nowEt} (UTC ISO: ${ctx.currentServerTime})`
    );
    parts.push(`- US equity session: **${ctx.marketSession}**`);

    if (ctx.liveTape && (ctx.liveTape.spy || ctx.liveTape.qqq)) {
      parts.push(
        `\n## Live Tape (as of ${fmtEt(ctx.liveTape.fetchedAt)}) — use this for "right now" market state`
      );
      if (ctx.liveTape.spy) {
        parts.push(
          `- SPY: $${ctx.liveTape.spy.price.toFixed(2)} (${pctStr(ctx.liveTape.spy.changePct)} vs prev close)`
        );
      }
      if (ctx.liveTape.qqq) {
        parts.push(
          `- QQQ: $${ctx.liveTape.qqq.price.toFixed(2)} (${pctStr(ctx.liveTape.qqq.changePct)} vs prev close)`
        );
      }
    } else {
      parts.push(
        `\n## Live Tape: unavailable — provider failed. Do NOT characterize "right now" SPY/QQQ levels.`
      );
    }

    if (ctx.recentDigest) {
      const digestEt = fmtEt(ctx.recentDigest.generatedAt);
      const ageMin = Math.floor(
        (new Date(ctx.currentServerTime).getTime() -
          new Date(ctx.recentDigest.generatedAt).getTime()) /
          60000
      );
      parts.push(
        `\n## Market Digest (generated ${digestEt}, ${ageMin} min ago)`
      );
      parts.push(ctx.recentDigest.summary);
    }

    if (ctx.news.length > 0) {
      parts.push("\n## Recent News (per-article timestamps in [brackets])");
      for (const a of ctx.news.slice(0, 10)) {
        parts.push(
          `- [${fmtEt(a.publishedAt)}] ${a.headline}: ${a.summary.slice(0, 150)}`
        );
      }
    }

    if (ctx.topMovers.items.length > 0) {
      parts.push(
        `\n## Top Movers — daily-bar diffs (fetched ${fmtEt(ctx.topMovers.fetchedAt)}; can lag intraday — prefer Live Tape for SPY/QQQ)`
      );
      for (const m of ctx.topMovers.items) {
        parts.push(`- ${m.symbol}: ${pctStr(m.changePct)}`);
      }
    }

    if (ctx.relevantSignals.length > 0) {
      parts.push("\n## Recent Signals");
      for (const s of ctx.relevantSignals) {
        const stamp = s.createdAt ? ` [${fmtEt(s.createdAt)}]` : "";
        parts.push(
          `-${stamp} ${s.symbol} [${s.signal}]: ${s.plainEnglish.slice(0, 150)}`
        );
      }
    }

    if (ctx.educationGuides && ctx.educationGuides.length > 0) {
      parts.push("\n## Relevant Beacontry Education Guides");
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
