export type GlossaryCategory =
  | "basics"
  | "technical"
  | "fundamental"
  | "options"
  | "risk"
  | "wealth";

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  category: GlossaryCategory;
  examples: string[];
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "pe-ratio",
    term: "P/E Ratio",
    definition:
      "Price-to-Earnings ratio compares a company's stock price to its earnings per share. A high P/E may suggest investors expect future growth, while a low P/E could mean the stock is undervalued or the company faces challenges.",
    category: "fundamental",
    examples: [
      "Apple trades at a P/E of 30, meaning investors pay $30 for every $1 of earnings.",
      "A utility company with a P/E of 12 is considered cheap relative to a tech stock at P/E 50.",
    ],
  },
  {
    id: "market-cap",
    term: "Market Cap",
    definition:
      "Market capitalization is the total value of a company's outstanding shares, calculated by multiplying the stock price by the number of shares. It categorizes companies as large-cap, mid-cap, or small-cap.",
    category: "basics",
    examples: [
      "A company with 1 billion shares trading at $150 has a market cap of $150 billion (large-cap).",
      "Small-cap stocks (under $2B market cap) tend to be more volatile but offer higher growth potential.",
    ],
  },
  {
    id: "eps",
    term: "EPS",
    definition:
      "Earnings Per Share is a company's net profit divided by its outstanding shares. It shows how much money a company makes for each share and is a key metric for comparing profitability.",
    category: "fundamental",
    examples: [
      "A company earning $1B with 500M shares has an EPS of $2.00.",
      "If EPS grows from $3.50 to $4.20 year-over-year, that is a 20% increase in profitability.",
    ],
  },
  {
    id: "dividend-yield",
    term: "Dividend Yield",
    definition:
      "The annual dividend payment divided by the stock price, expressed as a percentage. It shows how much cash flow you get for each dollar invested in the stock.",
    category: "fundamental",
    examples: [
      "A stock at $100 paying $3/year in dividends has a 3% dividend yield.",
      "REITs often have yields of 4-8%, making them popular with income investors.",
    ],
  },
  {
    id: "rsi",
    term: "RSI",
    definition:
      "Relative Strength Index is a momentum oscillator ranging from 0 to 100. Readings above 70 suggest a stock may be overbought, while readings below 30 suggest it may be oversold.",
    category: "technical",
    examples: [
      "A stock with RSI at 85 after a rally may be due for a pullback.",
      "RSI dropping to 25 after a sell-off could signal a buying opportunity.",
    ],
  },
  {
    id: "macd",
    term: "MACD",
    definition:
      "Moving Average Convergence Divergence tracks the relationship between two moving averages. When the MACD line crosses above the signal line, it is a bullish signal; crossing below is bearish.",
    category: "technical",
    examples: [
      "A MACD bullish crossover on AAPL confirmed the start of a 15% rally.",
      "Negative MACD histogram bars growing larger indicate increasing bearish momentum.",
    ],
  },
  {
    id: "sma",
    term: "SMA",
    definition:
      "Simple Moving Average calculates the average closing price over a set number of periods. It smooths out price data to identify trends and is commonly used with 20, 50, and 200-day periods.",
    category: "technical",
    examples: [
      "When a stock's price crosses above its 50-day SMA, it may signal an uptrend.",
      "The 200-day SMA is widely watched as a long-term trend indicator.",
    ],
  },
  {
    id: "ema",
    term: "EMA",
    definition:
      "Exponential Moving Average gives more weight to recent prices compared to SMA, making it more responsive to new information. Traders use it to catch trends earlier.",
    category: "technical",
    examples: [
      "The 9-day EMA reacts faster to price changes than the 9-day SMA.",
      "A 21-day EMA crossing above the 50-day EMA is a common bullish signal.",
    ],
  },
  {
    id: "vwap",
    term: "VWAP",
    definition:
      "Volume Weighted Average Price is the average price weighted by volume throughout the trading day. Institutional traders use it as a benchmark to assess whether they got a good fill price.",
    category: "technical",
    examples: [
      "If a stock is trading above VWAP, buyers are in control for the session.",
      "Day traders often buy at or below VWAP and sell above it.",
    ],
  },
  {
    id: "bollinger-bands",
    term: "Bollinger Bands",
    definition:
      "A volatility indicator with a middle SMA band and upper/lower bands set at 2 standard deviations. Prices touching the upper band may be overbought; touching the lower band may be oversold.",
    category: "technical",
    examples: [
      "Bollinger Band squeeze (bands narrowing) often precedes a big price move.",
      "A stock breaking above the upper Bollinger Band on high volume may signal a breakout.",
    ],
  },
  {
    id: "atr",
    term: "ATR",
    definition:
      "Average True Range measures market volatility by calculating the average range between high and low prices over a period. Higher ATR means more volatile price action.",
    category: "technical",
    examples: [
      "A stock with ATR of $5 on a $100 price moves about 5% daily on average.",
      "Traders use ATR to set stop-loss distances, e.g. 2x ATR below entry.",
    ],
  },
  {
    id: "bull-market",
    term: "Bull Market",
    definition:
      "A market condition where prices are rising or expected to rise, typically defined as a 20% or more increase from recent lows. Bull markets are driven by optimism and strong economic fundamentals.",
    category: "basics",
    examples: [
      "The 2009-2020 bull market was the longest in U.S. history, lasting 11 years.",
      "Tech stocks led the bull market recovery after the 2022 bear market.",
    ],
  },
  {
    id: "bear-market",
    term: "Bear Market",
    definition:
      "A market condition where prices fall 20% or more from recent highs. Bear markets are driven by pessimism, economic downturns, or major crises and can last months to years.",
    category: "basics",
    examples: [
      "The 2008 financial crisis triggered a bear market where the S&P 500 fell over 50%.",
      "Investors may shift to defensive sectors like utilities during bear markets.",
    ],
  },
  {
    id: "short-selling",
    term: "Short Selling",
    definition:
      "Borrowing shares to sell them at the current price, hoping to buy them back cheaper later. The profit is the difference, but losses are theoretically unlimited if the price rises.",
    category: "basics",
    examples: [
      "A trader shorts 100 shares at $50, buys back at $40, and profits $1,000.",
      "GameStop's 2021 short squeeze caused massive losses for short sellers.",
    ],
  },
  {
    id: "margin",
    term: "Margin",
    definition:
      "Borrowing money from your broker to buy more securities than your cash allows. Margin amplifies both gains and losses, and your broker can force-sell your positions if the account value drops too low.",
    category: "risk",
    examples: [
      "With 2:1 margin, $10,000 in cash lets you buy $20,000 worth of stock.",
      "A margin call occurs when your equity falls below the maintenance requirement, forcing you to add funds or sell.",
    ],
  },
  {
    id: "limit-order",
    term: "Limit Order",
    definition:
      "An order to buy or sell at a specific price or better. It guarantees price but not execution, since the order only fills if the market reaches your limit price.",
    category: "basics",
    examples: [
      "Placing a limit buy at $95 when a stock trades at $100 means you only buy if it drops to $95.",
      "A limit sell at $110 ensures you sell at $110 or higher.",
    ],
  },
  {
    id: "market-order",
    term: "Market Order",
    definition:
      "An order to buy or sell immediately at the best available price. It guarantees execution but not price, which can result in slippage during volatile conditions.",
    category: "basics",
    examples: [
      "Using a market order on a low-volume stock could result in filling at a much worse price.",
      "Market orders at the open can fill at prices significantly different from the previous close.",
    ],
  },
  {
    id: "stop-loss",
    term: "Stop Loss",
    definition:
      "An order that automatically sells your position when the price drops to a specified level, limiting potential losses. It converts to a market order once triggered.",
    category: "risk",
    examples: [
      "Buying at $100 with a stop loss at $95 limits your maximum loss to 5%.",
      "During flash crashes, stop losses can execute far below the trigger price due to gaps.",
    ],
  },
  {
    id: "take-profit",
    term: "Take Profit",
    definition:
      "An order that automatically sells your position when the price reaches a specified profit target. It locks in gains without requiring constant monitoring.",
    category: "risk",
    examples: [
      "Setting a take profit at $120 on a $100 entry locks in a 20% gain.",
      "Some traders use trailing take-profit orders that adjust upward as the price rises.",
    ],
  },
  {
    id: "trailing-stop",
    term: "Trailing Stop",
    definition:
      "A stop loss that moves with the price, maintaining a fixed distance or percentage below the highest price reached. It locks in profits while allowing the position to run.",
    category: "risk",
    examples: [
      "A 5% trailing stop on a stock that rises from $100 to $120 sets the stop at $114.",
      "Trailing stops are popular in trending markets where you want to ride the momentum.",
    ],
  },
  {
    id: "options",
    term: "Options",
    definition:
      "Financial contracts giving the right (but not obligation) to buy or sell an asset at a specific price before a specific date. They are used for hedging, income, and speculation.",
    category: "options",
    examples: [
      "Buying a call option on AAPL lets you profit if AAPL rises above the strike price.",
      "Selling covered calls on stocks you own generates premium income.",
    ],
  },
  {
    id: "call",
    term: "Call",
    definition:
      "An options contract giving the holder the right to buy 100 shares at the strike price before expiration. Calls profit when the underlying stock price rises.",
    category: "options",
    examples: [
      "A $150 call on AAPL trading at $160 is $10 in-the-money and worth at least $1,000.",
      "Buying calls is a leveraged bullish bet with risk limited to the premium paid.",
    ],
  },
  {
    id: "put",
    term: "Put",
    definition:
      "An options contract giving the holder the right to sell 100 shares at the strike price before expiration. Puts profit when the underlying stock price falls.",
    category: "options",
    examples: [
      "Buying puts on SPY acts as portfolio insurance during market downturns.",
      "A $100 put on a stock trading at $90 is $10 in-the-money.",
    ],
  },
  {
    id: "strike-price",
    term: "Strike Price",
    definition:
      "The predetermined price at which an option holder can buy (call) or sell (put) the underlying asset. The relationship between strike price and current price determines if an option is in, at, or out of the money.",
    category: "options",
    examples: [
      "A call with a $100 strike is in-the-money when the stock trades above $100.",
      "Lower strike calls cost more because they have a higher probability of profit.",
    ],
  },
  {
    id: "expiration",
    term: "Expiration",
    definition:
      "The date an options contract expires and becomes worthless if not exercised. Options lose time value as expiration approaches, a phenomenon known as time decay (theta).",
    category: "options",
    examples: [
      "Weekly options expire every Friday; monthly options expire the third Friday.",
      "An out-of-the-money call loses all its value at expiration.",
    ],
  },
  {
    id: "implied-volatility",
    term: "IV (Implied Volatility)",
    definition:
      "A forward-looking measure of expected price movement priced into options. Higher IV means options are more expensive because the market expects larger price swings.",
    category: "options",
    examples: [
      "IV spikes before earnings announcements, making options more expensive.",
      "Selling options during high IV (IV crush) is a common income strategy.",
    ],
  },
  {
    id: "open-interest",
    term: "Open Interest",
    definition:
      "The total number of outstanding options contracts that have not been settled. Rising open interest alongside price moves confirms the strength of a trend.",
    category: "options",
    examples: [
      "High open interest at a strike price can act as a magnet for the stock price (max pain).",
      "A spike in put open interest may indicate hedging activity by large institutions.",
    ],
  },
  {
    id: "volume",
    term: "Volume",
    definition:
      "The number of shares or contracts traded in a given period. High volume confirms price moves, while low volume suggests weak conviction and potential reversal.",
    category: "basics",
    examples: [
      "A breakout on 3x average volume is more reliable than one on low volume.",
      "Volume spikes at market open and close are normal due to institutional activity.",
    ],
  },
  {
    id: "bid-ask-spread",
    term: "Bid-Ask Spread",
    definition:
      "The difference between the highest price a buyer will pay (bid) and the lowest price a seller will accept (ask). Tighter spreads indicate more liquidity; wider spreads mean higher trading costs.",
    category: "basics",
    examples: [
      "AAPL might have a $0.01 spread, while a small-cap stock could have a $0.50 spread.",
      "Market makers profit from the bid-ask spread by buying at bid and selling at ask.",
    ],
  },
  {
    id: "support",
    term: "Support",
    definition:
      "A price level where buying pressure consistently prevents the stock from falling further. Support levels form when demand increases as prices drop to a specific zone.",
    category: "technical",
    examples: [
      "A stock bouncing off $50 three times establishes strong support at that level.",
      "When support breaks, it often becomes the new resistance level.",
    ],
  },
  {
    id: "resistance",
    term: "Resistance",
    definition:
      "A price level where selling pressure consistently prevents the stock from rising further. Resistance forms when supply increases as prices rise to a specific zone.",
    category: "technical",
    examples: [
      "A stock failing to break above $200 repeatedly has strong resistance there.",
      "Once resistance breaks on high volume, it often becomes the new support.",
    ],
  },
  {
    id: "fibonacci-retracement",
    term: "Fibonacci Retracement",
    definition:
      "A technical tool that identifies potential support and resistance levels using Fibonacci ratios (23.6%, 38.2%, 50%, 61.8%). Traders expect price pullbacks to reverse near these levels.",
    category: "technical",
    examples: [
      "After a rally from $100 to $150, the 38.2% retracement level is around $131.",
      "The 61.8% level is considered the 'golden ratio' and often provides strong support.",
    ],
  },
  {
    id: "breakout",
    term: "Breakout",
    definition:
      "When a stock's price moves above resistance or below support with increased volume. Breakouts signal the start of a new trend and are a common entry point for traders.",
    category: "technical",
    examples: [
      "A stock breaking above a 3-month resistance of $50 on 4x volume signals a bullish breakout.",
      "False breakouts occur when price briefly breaks a level but quickly reverses.",
    ],
  },
  {
    id: "pullback",
    term: "Pullback",
    definition:
      "A temporary decline in price during an ongoing uptrend. Pullbacks are considered normal and healthy, offering buying opportunities before the trend resumes.",
    category: "technical",
    examples: [
      "A stock in an uptrend pulling back to its 20-day SMA before bouncing higher.",
      "Buying pullbacks to Fibonacci retracement levels is a classic trend-following strategy.",
    ],
  },
  {
    id: "consolidation",
    term: "Consolidation",
    definition:
      "A period where price trades within a narrow range, indicating indecision between buyers and sellers. Consolidation often precedes a significant move in either direction.",
    category: "technical",
    examples: [
      "A stock trading between $48 and $52 for three weeks is consolidating.",
      "Bollinger Bands narrowing during consolidation signals a potential breakout.",
    ],
  },
  {
    id: "trend-line",
    term: "Trend Line",
    definition:
      "A straight line connecting two or more price points that identifies and confirms a trend direction. Uptrend lines connect higher lows; downtrend lines connect lower highs.",
    category: "technical",
    examples: [
      "Drawing a line connecting three higher lows shows a clear ascending trend.",
      "A break below an uptrend line held for months may signal a trend reversal.",
    ],
  },
  {
    id: "moving-average-crossover",
    term: "Moving Average Crossover",
    definition:
      "When a shorter-period moving average crosses above or below a longer-period one. A 'golden cross' (50-day above 200-day) is bullish; a 'death cross' is bearish.",
    category: "technical",
    examples: [
      "The golden cross on SPY in April 2020 preceded a massive rally.",
      "A 9-EMA crossing below the 21-EMA on the daily chart is a short-term sell signal.",
    ],
  },
  {
    id: "divergence",
    term: "Divergence",
    definition:
      "When price makes a new high or low but the indicator (RSI, MACD) does not confirm it. Divergence warns that the current trend may be weakening and a reversal is possible.",
    category: "technical",
    examples: [
      "Bearish divergence: stock makes a new high but RSI makes a lower high.",
      "Bullish divergence on MACD often precedes a strong upward reversal.",
    ],
  },
  {
    id: "overbought",
    term: "Overbought",
    definition:
      "A condition where a stock has risen too quickly and may be due for a pullback or reversal. Often identified by RSI above 70 or price touching the upper Bollinger Band.",
    category: "technical",
    examples: [
      "A stock with RSI at 80 after a 30% rally is considered overbought.",
      "Overbought stocks can stay overbought for weeks in strong uptrends.",
    ],
  },
  {
    id: "oversold",
    term: "Oversold",
    definition:
      "A condition where a stock has fallen too quickly and may be due for a bounce or reversal. Often identified by RSI below 30 or price touching the lower Bollinger Band.",
    category: "technical",
    examples: [
      "Panic selling driving RSI to 15 often creates oversold bounce opportunities.",
      "Oversold conditions in a bear market can persist longer than expected.",
    ],
  },
  {
    id: "beta",
    term: "Beta",
    definition:
      "A measure of a stock's volatility relative to the overall market. A beta of 1.0 means the stock moves with the market; above 1.0 is more volatile, below 1.0 is less volatile.",
    category: "risk",
    examples: [
      "Tesla with a beta of 2.0 is expected to move twice as much as the S&P 500.",
      "Utility stocks often have betas of 0.5, making them defensive holdings.",
    ],
  },
  {
    id: "alpha",
    term: "Alpha",
    definition:
      "The excess return of an investment relative to a benchmark index. Positive alpha means the investment outperformed; negative alpha means it underperformed.",
    category: "risk",
    examples: [
      "A fund returning 15% when the S&P returned 10% generated 5% alpha.",
      "Most active fund managers fail to generate consistent positive alpha over time.",
    ],
  },
  {
    id: "sharpe-ratio",
    term: "Sharpe Ratio",
    definition:
      "Measures risk-adjusted return by dividing excess return (over risk-free rate) by portfolio volatility. Higher values indicate better returns per unit of risk taken.",
    category: "risk",
    examples: [
      "A Sharpe ratio above 1.0 is considered good; above 2.0 is excellent.",
      "Comparing two strategies: 20% return with Sharpe 0.8 vs 15% return with Sharpe 1.5 — the second is more efficient.",
    ],
  },
  {
    id: "drawdown",
    term: "Drawdown",
    definition:
      "The peak-to-trough decline in an investment's value before it recovers. Maximum drawdown shows the worst loss an investor would have experienced.",
    category: "risk",
    examples: [
      "A portfolio dropping from $100K to $70K has a 30% drawdown.",
      "Professional traders aim to keep maximum drawdown under 20%.",
    ],
  },
  {
    id: "risk-reward-ratio",
    term: "Risk-Reward Ratio",
    definition:
      "Compares the potential loss to the potential gain of a trade. A 1:3 ratio means risking $1 to potentially make $3, which is generally considered favorable.",
    category: "risk",
    examples: [
      "Entry at $100, stop loss at $95, target at $115 gives a 1:3 risk-reward ratio.",
      "Traders typically require at least 1:2 risk-reward before entering a trade.",
    ],
  },
  {
    id: "position-sizing",
    term: "Position Sizing",
    definition:
      "Determining how many shares or contracts to trade based on your risk tolerance and account size. Proper position sizing prevents any single trade from causing catastrophic losses.",
    category: "risk",
    examples: [
      "Risking 1% of a $50K account means maximum loss per trade is $500.",
      "If your stop loss is $2 away and risk budget is $500, position size is 250 shares.",
    ],
  },
  {
    id: "dollar-cost-averaging",
    term: "Dollar Cost Averaging",
    definition:
      "Investing a fixed dollar amount at regular intervals regardless of price. This strategy reduces the impact of volatility by buying more shares when prices are low and fewer when prices are high.",
    category: "basics",
    examples: [
      "Investing $500/month in an S&P 500 index fund regardless of market conditions.",
      "DCA into a volatile stock over 6 months reduces risk compared to a single lump-sum purchase.",
    ],
  },
  {
    id: "tax-loss-harvesting",
    term: "Tax Loss Harvesting",
    definition:
      "Selling losing investments to offset capital gains taxes. The loss reduces your tax liability, and you can reinvest in a similar (but not identical) asset to maintain market exposure.",
    category: "fundamental",
    examples: [
      "Selling a stock at a $5,000 loss to offset $5,000 in gains from another trade.",
      "The wash-sale rule prevents buying back the same security within 30 days.",
    ],
  },
  {
    id: "ipo",
    term: "IPO",
    definition:
      "Initial Public Offering is when a private company first sells shares to the public. IPOs often generate excitement but can be volatile as the market discovers the fair price.",
    category: "basics",
    examples: [
      "Facebook's 2012 IPO priced at $38, dropped initially, then rallied significantly over years.",
      "Many IPOs 'pop' 20-50% on the first day, then decline in the following months.",
    ],
  },
  {
    id: "sec-filing",
    term: "SEC Filing",
    definition:
      "Documents companies must submit to the Securities and Exchange Commission. Key filings include 10-K (annual report), 10-Q (quarterly report), and 8-K (material events).",
    category: "fundamental",
    examples: [
      "A 10-K filing contains audited financials, risk factors, and management discussion.",
      "An 8-K filing about a CEO resignation can cause immediate stock price movement.",
    ],
  },

  // ─── Wealth / Personal Finance ──────────────────────────────────────────
  // Educational only — not advice. Limits/rules current as of 2026; verify before acting.

  {
    id: "roth-ira",
    term: "Roth IRA",
    definition:
      "Individual retirement account funded with after-tax dollars. Contributions are never deductible, but qualified withdrawals (after age 59½ and 5+ years) are 100% tax-free — including all growth. Subject to income limits (MAGI phase-outs).",
    category: "wealth",
    examples: [
      "2026 contribution limit: $7,000 (under 50) / $8,000 (50+).",
      "Direct contributions phase out for single filers between $150K–$165K MAGI.",
      "Contributions (not earnings) can be withdrawn anytime, tax- and penalty-free.",
    ],
  },
  {
    id: "traditional-ira",
    term: "Traditional IRA",
    definition:
      "Retirement account where contributions may be tax-deductible now (depending on income and workplace plan coverage), and growth is tax-deferred. Withdrawals in retirement are taxed as ordinary income. Required Minimum Distributions (RMDs) start at age 73.",
    category: "wealth",
    examples: [
      "If your marginal rate is 32% now and 22% in retirement, Traditional often wins.",
      "Deductibility phases out for active 401(k) participants above certain MAGI thresholds.",
    ],
  },
  {
    id: "401k",
    term: "401(k)",
    definition:
      "Employer-sponsored retirement plan where you defer salary pre-tax (Traditional) or after-tax (Roth). Often includes an employer match — typically the highest-return investment available since it's a 100% return on contribution.",
    category: "wealth",
    examples: [
      "2026 employee deferral limit: $23,500. Catch-up (50+): additional $7,500.",
      "Always contribute at least up to the full employer match — leaving it on the table is leaving free money behind.",
    ],
  },
  {
    id: "backdoor-roth",
    term: "Backdoor Roth IRA",
    definition:
      "Strategy for high earners above the Roth income limit: contribute non-deductible dollars to a Traditional IRA, then immediately convert to Roth. Bypasses the income cap. Watch the pro-rata rule if you have other pre-tax IRA balances.",
    category: "wealth",
    examples: [
      "Single filer with MAGI of $250K cannot contribute to Roth directly, but can do the backdoor.",
      "Pro-rata rule: if you have $90K pre-tax in a Rollover IRA and contribute $7K non-deductible, ~93% of the conversion is taxable.",
    ],
  },
  {
    id: "mega-backdoor-roth",
    term: "Mega Backdoor Roth",
    definition:
      "Advanced 401(k) strategy: make after-tax (non-Roth) contributions up to the total annual addition limit, then in-plan convert or roll out to a Roth IRA. Lets high earners stuff far more into Roth than the IRA limit allows. Requires plan support.",
    category: "wealth",
    examples: [
      "2026 total 401(k) addition limit (employee + employer + after-tax): $70,000. After max deferral and match, leftover headroom can become Roth.",
      "Not all employer plans allow after-tax contributions or in-service withdrawals — check your plan document.",
    ],
  },
  {
    id: "pro-rata-rule",
    term: "Pro-Rata Rule",
    definition:
      "IRS rule for Roth conversions: when converting from a Traditional IRA, the taxable portion is calculated across ALL your pre-tax IRA balances combined (Traditional, SEP, SIMPLE, Rollover) — you can't cherry-pick the after-tax basis.",
    category: "wealth",
    examples: [
      "$93K pre-tax + $7K non-deductible = $100K total. Converting $7K means 93% ($6,510) is taxable.",
      "Workaround: roll pre-tax IRA into your 401(k) first to isolate the after-tax basis.",
    ],
  },
  {
    id: "roth-5-year-rule",
    term: "Roth 5-Year Rule",
    definition:
      "Two separate 5-year clocks. (1) For tax-free earnings withdrawals: any Roth IRA must be open 5+ years AND you must be 59½. (2) For converted dollars: each conversion has its own 5-year clock before the converted principal can be withdrawn penalty-free under 59½.",
    category: "wealth",
    examples: [
      "Open a $1 Roth IRA in your 30s — it starts the earnings clock for life.",
      "A 2026 Roth conversion's 5-year clock ends Jan 1, 2031.",
    ],
  },
  {
    id: "rmd",
    term: "RMD (Required Minimum Distribution)",
    definition:
      "Mandatory annual withdrawal from pre-tax retirement accounts (Traditional IRA, 401(k), 403(b)) starting at age 73. Calculated by dividing year-end balance by an IRS life-expectancy factor. Roth IRAs have no RMDs during the owner's lifetime.",
    category: "wealth",
    examples: [
      "$1M Traditional IRA balance at age 73 with a divisor of 26.5 = ~$37,700 RMD.",
      "Missing an RMD historically meant a 50% penalty (now 25%, or 10% if corrected timely).",
    ],
  },
  {
    id: "qcd",
    term: "QCD (Qualified Charitable Distribution)",
    definition:
      "Direct transfer from your IRA to a qualified charity (up to $108K in 2026) once you're 70½+. Counts toward your RMD but isn't included in taxable income — better than itemizing the donation because it lowers AGI.",
    category: "wealth",
    examples: [
      "$30K RMD requirement, donate $30K via QCD: zero added to taxable income vs. taking the RMD and writing a check.",
      "Lower AGI can also reduce Medicare IRMAA surcharges and Social Security taxation.",
    ],
  },
  {
    id: "hsa",
    term: "HSA (Health Savings Account)",
    definition:
      "Triple tax-advantaged account for those on a qualifying high-deductible health plan (HDHP). Contributions are deductible, growth is tax-free, and withdrawals for qualified medical expenses are tax-free — at any age. Becomes a Traditional IRA for non-medical uses after 65.",
    category: "wealth",
    examples: [
      "2026 limits: $4,400 self-only / $8,750 family. Catch-up (55+): $1,000.",
      "Pay current medical bills out of pocket, save receipts, invest the HSA for decades, reimburse yourself tax-free anytime — receipts have no expiration.",
    ],
  },
  {
    id: "hdhp",
    term: "HDHP (High-Deductible Health Plan)",
    definition:
      "Health plan with a higher deductible and lower premium than traditional coverage. Required to fund an HSA. The IRS sets minimum-deductible and maximum-out-of-pocket thresholds annually.",
    category: "wealth",
    examples: [
      "2026 minimums: $1,700 self / $3,400 family deductible.",
      "2026 OOP max: $8,500 self / $17,000 family.",
    ],
  },
  {
    id: "fsa",
    term: "FSA (Flexible Spending Account)",
    definition:
      "Employer-sponsored pre-tax account for medical (or dependent care) expenses. Use-it-or-lose-it: most balances forfeit at year-end (some plans allow up to ~$640 carryover or a 2.5-month grace period). Cannot be combined with an HSA.",
    category: "wealth",
    examples: [
      "Estimate medical spend conservatively — overfunding means losing the excess.",
      "Dependent Care FSA limit: $5,000/year for childcare expenses (single or married filing jointly).",
    ],
  },
  {
    id: "529-plan",
    term: "529 Plan",
    definition:
      "State-sponsored tax-advantaged account for education savings. Contributions grow tax-free; withdrawals for qualified education expenses (tuition, room, board, books, computers, K-12 tuition up to $10K/yr) are tax-free federally. Many states offer a deduction for contributions.",
    category: "wealth",
    examples: [
      "Beneficiary can be changed to any family member (sibling, cousin, parent, yourself) without tax.",
      "SECURE 2.0: up to $35K lifetime can roll to a Roth IRA for the beneficiary if the 529 has been open 15+ years (subject to annual Roth limits).",
    ],
  },
  {
    id: "coverdell-esa",
    term: "Coverdell ESA",
    definition:
      "Education Savings Account similar to a 529 but with a $2,000/year contribution cap, income limits, and a requirement to use funds by age 30. More investment flexibility than most 529s but less practical for serious college funding.",
    category: "wealth",
    examples: [
      "Income phase-out: $95K–$110K single, $190K–$220K married.",
      "Generally superseded by 529 plans for most families.",
    ],
  },
  {
    id: "utma-ugma",
    term: "UTMA / UGMA",
    definition:
      "Custodial accounts that hold assets for a minor until they reach the age of majority (18–25 depending on state). No tax advantage for education specifically. Counts heavily against financial aid (20% of value) since it's the student's asset.",
    category: "wealth",
    examples: [
      "Once the kid reaches the age of termination, they own the money outright — they can buy a sports car instead of going to college.",
      "Subject to kiddie tax: unearned income above ~$2,700 taxed at parent's marginal rate.",
    ],
  },
  {
    id: "term-life",
    term: "Term Life Insurance",
    definition:
      "Pure death-benefit insurance for a fixed term (10/20/30 years). No cash value. Premiums are 5–15× cheaper than permanent insurance for the same coverage. Right answer for nearly all middle-class buyers covering income-replacement risk during working years.",
    category: "wealth",
    examples: [
      "Healthy 35-year-old non-smoker: ~$25/month for $1M of 20-year term coverage.",
      "Same person, $1M whole life: ~$700+/month — most of the spread is sales commission and overhead, not investment value.",
    ],
  },
  {
    id: "whole-life",
    term: "Whole Life Insurance",
    definition:
      "Permanent insurance with a guaranteed death benefit, fixed premium, and a cash value that grows on a schedule set by the insurer. Often pitched as 'forced savings + tax-free retirement' — but cash value grows slowly in early years (largely commissions + overhead), and surrendering early often returns less than premiums paid.",
    category: "wealth",
    examples: [
      "First 5–10 years of premiums: most goes to commissions and policy expenses, not cash value.",
      "Common pitch: 'use it as your bank' (infinite banking) — works for some, but the underlying IRR over 20 years is typically 2–4%, often beaten by index funds in a Roth.",
    ],
  },
  {
    id: "iul",
    term: "IUL (Indexed Universal Life)",
    definition:
      "Permanent insurance whose cash value is credited based on a stock index (e.g., S&P 500) with a floor (often 0%) and a cap (often 8–12%) or participation rate. Marketed as 'market upside, no downside.' Reality: caps reset annually, fees are high, and the insurer can change caps mid-policy.",
    category: "wealth",
    examples: [
      "S&P 500 returns +25%, but your 9% cap means you're credited 9%. Dividends usually excluded.",
      "Surrender charges often run 10–15 years. Illustrations frequently use overly optimistic returns (~6–7%) — run them at 4–5% to see realistic outcomes.",
    ],
  },
  {
    id: "vul",
    term: "VUL (Variable Universal Life)",
    definition:
      "Permanent insurance where cash value is invested in subaccounts (like mutual funds). Full market exposure — both upside and downside — wrapped in a life policy. Higher fees than holding the same funds in a brokerage or Roth.",
    category: "wealth",
    examples: [
      "Cash value can drop in a bear market, requiring premium increases to keep the policy in force.",
      "Generally only makes sense for HNW individuals using it for estate-planning leverage.",
    ],
  },
  {
    id: "policy-loan",
    term: "Policy Loan",
    definition:
      "Loan taken against a permanent life insurance policy's cash value. Not a withdrawal — the insurer lends you money using the cash value as collateral, charging interest (often 4–8%). Loan balance reduces the death benefit if unpaid. Often pitched as a way to fund college without affecting financial aid.",
    category: "wealth",
    examples: [
      "$200K cash value, borrow $50K at 5%: cash value still grows on the full $200K (some policies), but you owe $50K + accruing interest against the death benefit.",
      "If the policy lapses with an outstanding loan, the loan amount above basis becomes taxable income — a 'phantom income' tax bomb.",
    ],
  },
  {
    id: "mec",
    term: "MEC (Modified Endowment Contract)",
    definition:
      "A life insurance policy that has been overfunded relative to IRS 7-pay test limits. Loses key tax benefits: withdrawals and loans are taxed LIFO (gains first) and may incur a 10% penalty before 59½. Once a MEC, always a MEC.",
    category: "wealth",
    examples: [
      "Dumping a large lump sum into a small policy can accidentally trigger MEC status — agents should run the 7-pay test before funding.",
      "MEC status doesn't kill the death benefit, but eliminates the 'tax-free loan' angle that makes permanent insurance financially interesting.",
    ],
  },
  {
    id: "infinite-banking",
    term: "Infinite Banking Concept",
    definition:
      "Marketing strategy promoting overfunded whole life policies as a personal banking system: borrow against cash value at low rates, repay yourself, recapture interest. Works mathematically but underperforms simple alternatives (HELOCs, taxable brokerage, Roth IRAs) for most users after fees and opportunity cost.",
    category: "wealth",
    examples: [
      "20-year break-even is common; opportunity cost vs. low-cost index funds is often 4–6% IRR per year.",
      "Genuine fit: HNW buyers seeking estate liquidity, business owners with stable cash flow needing collateral, niche tax planning. Not a substitute for retirement accounts.",
    ],
  },
  {
    id: "step-up-basis",
    term: "Step-Up in Basis",
    definition:
      "When you inherit appreciated assets (stocks, real estate), the cost basis resets to the fair market value at the date of death. Heirs can sell immediately with no capital gains tax on appreciation that occurred during the original owner's lifetime.",
    category: "wealth",
    examples: [
      "Parent buys stock at $10K, dies when it's worth $200K. You inherit at $200K basis — sell for $205K and only owe tax on $5K of gain.",
      "One reason aging investors often hold appreciated positions instead of selling: 'die with it' eliminates the embedded gain.",
    ],
  },
  {
    id: "tax-loss-harvesting",
    term: "Tax-Loss Harvesting",
    definition:
      "Selling positions at a loss to offset realized gains, plus up to $3,000/yr against ordinary income. Excess losses carry forward indefinitely. Watch the wash-sale rule: buying back the 'substantially identical' security within 30 days disallows the loss.",
    category: "wealth",
    examples: [
      "Sell SPY at a $10K loss, buy VOO same day — likely a wash sale (both track S&P 500). Buy a different index (e.g., VTI total market) to stay safe.",
      "Wash sale also triggered by purchases in your spouse's account or your IRA.",
    ],
  },
  {
    id: "asset-location",
    term: "Asset Location",
    definition:
      "Strategy of placing different asset classes in the most tax-efficient account type. Tax-inefficient assets (REITs, bonds, high-turnover funds) go in tax-deferred accounts (401(k), IRA); tax-efficient assets (broad index funds, qualified dividends) go in taxable; highest-growth assets go in Roth.",
    category: "wealth",
    examples: [
      "Bonds yielding 5%: 100% taxed as ordinary income → put in Traditional IRA.",
      "Aggressive growth ETFs: highest expected return → put in Roth where growth is tax-free.",
    ],
  },
  {
    id: "roth-conversion-ladder",
    term: "Roth Conversion Ladder",
    definition:
      "Multi-year strategy for early retirees: convert chunks of Traditional IRA to Roth each year, paying taxes at low brackets while income is reduced. After the 5-year clock, the converted principal can be withdrawn penalty-free pre-59½ — funding early retirement.",
    category: "wealth",
    examples: [
      "Retire at 50, convert $40K/year for 10 years staying in 12% bracket. Each conversion becomes accessible 5 years later.",
      "Pairs well with low-income years: layoff, sabbatical, or first year of retirement before Social Security starts.",
    ],
  },
  {
    id: "magi",
    term: "MAGI (Modified Adjusted Gross Income)",
    definition:
      "Adjusted Gross Income with certain deductions added back (student loan interest, foreign earned income exclusion, IRA deduction, etc.). Used to determine eligibility for Roth contributions, IRA deductibility, ACA subsidies, IRMAA, education credits, and NIIT.",
    category: "wealth",
    examples: [
      "Single filer with $158K MAGI in 2026: partially phased out of direct Roth contributions.",
      "MAGI just over $103K for individuals (2026) triggers Medicare IRMAA Part B/D surcharges.",
    ],
  },
  {
    id: "secure-act-2",
    term: "SECURE Act 2.0",
    definition:
      "2022 law (effective 2023+) that introduced major retirement-account changes: RMD age raised to 73 (75 by 2033), $35K lifetime 529-to-Roth rollover, mandatory Roth catch-ups for high earners, employer Roth match option, and an emergency-savings sidecar in 401(k)s.",
    category: "wealth",
    examples: [
      "529-to-Roth: account must be 15+ years old, beneficiary is the recipient, subject to annual Roth limits.",
      "Catch-up contributions for those earning over $145K must go to Roth (not pre-tax) starting 2026.",
    ],
  },
  {
    id: "kiddie-tax",
    term: "Kiddie Tax",
    definition:
      "Unearned income of a dependent child above ~$2,700 (2026) is taxed at the parent's marginal rate. Applies to children under 18, or under 24 if a full-time student. Curtails the strategy of shifting investment income to a child's lower bracket.",
    category: "wealth",
    examples: [
      "$10K dividends in a child's UTMA: first $1,350 tax-free, next $1,350 at child's rate, remainder at parent's rate.",
      "Reason 529s and Roth IRAs (with earned income) often beat UTMAs for college savings.",
    ],
  },
  {
    id: "agi",
    term: "AGI (Adjusted Gross Income)",
    definition:
      "Total income minus 'above-the-line' deductions (HSA contributions, Traditional IRA contributions, self-employment tax, student loan interest, etc.). The starting point for taxable income and most income-based calculations.",
    category: "wealth",
    examples: [
      "Lowering AGI through Traditional 401(k), HSA, and FSA contributions can drop you into a lower bracket and unlock other phaseout-sensitive benefits.",
      "AGI ≠ MAGI — most income tests use MAGI, which adds certain items back.",
    ],
  },

  // ─── Trader-tax & estate additions for v2 guides ────────────────────────

  {
    id: "trader-tax-status",
    term: "Trader Tax Status (TTS)",
    definition:
      "IRS classification for active traders meeting frequency/regularity tests under case law (Holsinger, Endicott). Grants Schedule C deductions for trading expenses (home office, education, software) but does NOT change wash-sale or capital-gain treatment by itself — that requires the §475(f) MTM election. No formal IRS application; you self-declare on your return.",
    category: "wealth",
    examples: [
      "Common qualifying profile: 4+ trades/day, 75%+ of trading days active, average holding under 31 days, full-time activity.",
      "TTS without MTM election: still file gains on Schedule D / Form 8949 with $3K loss limit and wash sales — only the expense deductibility changes.",
    ],
  },
  {
    id: "section-475f",
    term: "§475(f) Mark-to-Market Election",
    definition:
      "Optional tax election that converts trader gains/losses to ordinary income, removes the $3,000 capital loss limit, and exempts the trader from wash-sale rules. Filed via a written statement attached to the prior-year return by April 15, plus Form 3115 to formalize the accounting-method change. Required if you have Trader Tax Status and want to fully decouple from capital-gains treatment.",
    category: "wealth",
    examples: [
      "To elect MTM for tax year 2026: attach the election statement to your 2025 return filed by April 15, 2026.",
      "Once elected, year-end open positions are treated as if sold at fair market value — basis is reset and gain/loss is recognized.",
    ],
  },
  {
    id: "form-3115",
    term: "Form 3115",
    definition:
      "Application for Change in Accounting Method. Required to formalize a §475(f) MTM election (changes from realization to mark-to-market). Filed in the year of the election with both the taxpayer's return and a separate copy mailed to the IRS National Office. Includes a §481(a) adjustment for the transition.",
    category: "wealth",
    examples: [
      "Filing 3115 for MTM election triggers a one-time §481(a) adjustment — open positions on Jan 1 are deemed sold at FMV.",
      "Missing Form 3115 doesn't void the election, but invites IRS scrutiny — file it.",
    ],
  },
  {
    id: "form-4797",
    term: "Form 4797",
    definition:
      "Sales of Business Property — used by §475(f) MTM electors to report trading gains/losses as ordinary income (Part II) instead of capital gains on Form 8949 / Schedule D. Also used for §1231 property and depreciation recapture, but for traders it's the ordinary-income trading vehicle.",
    category: "wealth",
    examples: [
      "Pre-MTM trader: gains on Form 8949 → Schedule D, capped $3K loss limit.",
      "Post-MTM trader: gains on Form 4797 Part II → Form 1040 line 8, no capital-loss limit.",
    ],
  },
  {
    id: "form-1040-es",
    term: "Form 1040-ES",
    definition:
      "Estimated Tax for Individuals. Quarterly payment voucher used by self-employed, retirees, and traders without sufficient W-2 withholding. Due dates: April 15 (Q1), June 15 (Q2), September 15 (Q3), January 15 of next year (Q4). Underpayment may trigger §6654 penalty unless safe-harbor rules are met.",
    category: "wealth",
    examples: [
      "Trader nets $200K in Q1 with no withholding: should make Q1 estimated payment of ~$45K by April 15 to avoid penalty.",
      "Withheld income (W-2, 1099-R) is treated as paid evenly across the year — quarterly payments aren't.",
    ],
  },
  {
    id: "safe-harbor-estimated-tax",
    term: "Safe Harbor (Estimated Tax)",
    definition:
      "Two paths to avoid §6654 underpayment penalty: (a) pay 90% of the current year's tax, OR (b) pay 100% of prior year's tax (110% if prior-year AGI > $150K). Meeting either eliminates the penalty regardless of how lumpy the actual income is.",
    category: "wealth",
    examples: [
      "Prior-year AGI $200K, tax $40K: 110% safe harbor = pay $44K through estimates/withholding to be safe regardless of current-year income.",
      "Trader expecting a huge year? Pay 110% of last year's tax in even quarterly chunks — IRS doesn't penalize even if you owe $300K extra at filing.",
    ],
  },
  {
    id: "section-1091",
    term: "§1091 (Wash Sale Rule)",
    definition:
      "IRC section disallowing a capital loss when 'substantially identical' securities are bought within 30 days before OR after the loss sale. The disallowed loss adds to the cost basis of the replacement security. Includes spouse's accounts and IRAs (Rev. Rul. 2008-5).",
    category: "wealth",
    examples: [
      "Sell SPY at $5K loss on Dec 15, buy SPY in your IRA on Dec 20: loss permanently lost (basis adjustment can't apply to an IRA).",
      "§475(f) MTM electors are exempt from §1091 entirely.",
    ],
  },
  {
    id: "substantially-identical",
    term: "Substantially Identical Security",
    definition:
      "Wash-sale standard for what triggers loss disallowance. Same CUSIP is clearly identical. Different ETFs tracking the same index (SPY/IVV/VOO) are widely viewed as substantially identical. Different total-market or sector ETFs (SPY vs VTI) generally are not. Bonds with same issuer/coupon/maturity are. Stock and its options can be.",
    category: "wealth",
    examples: [
      "Common safe swap pair: SPY → VTI (S&P 500 to total US market) — different index methodology.",
      "Risky: SPY → VOO. Both track S&P 500 — IRS hasn't issued bright-line guidance, but most tax pros consider them substantially identical.",
    ],
  },
  {
    id: "ilit",
    term: "ILIT (Irrevocable Life Insurance Trust)",
    definition:
      "Irrevocable trust that owns a life insurance policy on the grantor. Proceeds escape the grantor's estate (avoiding estate tax) while remaining payable to beneficiaries. Funded with annual gifts via 'Crummey' withdrawal rights. Common HNW estate-planning tool when permanent insurance is also needed for liquidity.",
    category: "wealth",
    examples: [
      "$10M estate near the federal exemption: ILIT-owned $5M permanent policy can fund estate-tax liquidity without inflating the taxable estate.",
      "Three-year lookback rule: transferring an existing policy to an ILIT pulls it back into the estate if death occurs within 3 years.",
    ],
  },
  {
    id: "per-stirpes",
    term: "Per Stirpes",
    definition:
      "Beneficiary designation method: if a named beneficiary predeceases you, their share passes to THEIR descendants (kids, grandkids), not to your other beneficiaries. Latin for 'by the branch.' Default in many states for intestate succession.",
    category: "wealth",
    examples: [
      "You name three kids equally. One predeceases you, leaving two grandchildren: per stirpes splits that child's third equally between the two grandkids.",
      "Per capita instead would split the same estate equally among the surviving beneficiaries — the grandchildren would get nothing.",
    ],
  },
  {
    id: "durable-poa",
    term: "Durable Power of Attorney",
    definition:
      "Legal document granting a designated 'agent' authority to act on your behalf for financial decisions. 'Durable' means it survives your incapacity (regular POAs end at incapacity). Springing variants only activate upon disability certification. Revocable while you're competent.",
    category: "wealth",
    examples: [
      "If you become incapacitated without a durable POA, your family typically must petition for guardianship/conservatorship — slow, expensive, public.",
      "Pair with a Healthcare POA / Advance Directive for medical decisions — financial POA does not cover medical authority.",
    ],
  },
  {
    id: "tod-pod",
    term: "TOD / POD",
    definition:
      "Transfer-on-Death and Payable-on-Death designations. Allow brokerage and bank accounts to bypass probate by passing directly to a named beneficiary at death. TOD for securities, POD for cash accounts. Override the will. Free and easy to set up.",
    category: "wealth",
    examples: [
      "Brokerage account TOD'd to your spouse: zero probate, immediate transfer on death certificate presentation.",
      "Pitfall: TOD overrides the will. Forgetting to update after divorce can leave assets to an ex-spouse.",
    ],
  },
  {
    id: "revocable-living-trust",
    term: "Revocable Living Trust",
    definition:
      "A trust you create during your life, retain control over, and can amend or revoke at will. Assets titled to the trust avoid probate and remain private. Does NOT reduce estate or income taxes. Useful for real estate in multiple states, privacy, and incapacity planning.",
    category: "wealth",
    examples: [
      "Most middle-class estates don't need a living trust — a will + beneficiary designations achieve the same goals at lower cost.",
      "Common need: real estate in multiple states (avoids ancillary probate in each); wanting privacy (wills become public record at probate).",
    ],
  },
  {
    id: "intestate",
    term: "Intestate Succession",
    definition:
      "State-defined default distribution of your assets when you die without a valid will. Each state has its own statute — typically prioritizes spouse and children, then parents, siblings, etc. Probate court appoints an administrator. Slower and less private than dying with a will.",
    category: "wealth",
    examples: [
      "Common state default: spouse gets 50%, kids split 50%. Many people would prefer 100% to spouse and trust them to support kids.",
      "Unmarried partners typically inherit nothing under intestate succession regardless of length of relationship.",
    ],
  },
  {
    id: "hifo-cost-basis",
    term: "HIFO Cost Basis",
    definition:
      "Highest In, First Out — cost-basis lot-selection method that sells the highest-cost lot first to minimize realized gains. Great for tax-loss harvesting. Not available at all brokers; some offer 'Specific ID' or 'Lot Selection' which lets you achieve the same. Default at most brokers is FIFO (oldest lot first).",
    category: "wealth",
    examples: [
      "Long position with 5 lots at $100, $120, $150, $180, $200; current price $180. HIFO sells the $200 lot first, realizing a $20 loss instead of an $80 gain.",
      "Switch to specific-ID or HIFO before tax-loss harvesting — FIFO usually realizes gains exactly when you don't want them.",
    ],
  },
];
