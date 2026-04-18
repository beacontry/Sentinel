export type GlossaryCategory = "basics" | "technical" | "fundamental" | "options" | "risk";

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
];
