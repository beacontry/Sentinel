# Sentinel — Future Ideas

## Optimizer Improvements

### Momentum-Weighted Position Sizing in Backtester
Currently the optimizer backtester uses fixed 10% per position (equal weight). Instead, allocate capital proportional to each stock's momentum score:

```
weight = momentum_score / total_momentum_scores
positionSize = weight × available_capital
```

Stocks with stronger 60-day momentum get larger allocations. This matches how tactical-smart already sizes positions live (inverse volatility weighting). Applying it in the backtester means the GA would optimize for strategies that work with momentum-weighted portfolios — closer to real trading behavior.

**Impact:** Medium. Improves backtest realism and may find strategies that pair better with concentration in high-momentum names.

### Optimize Tactical-Smart Mode Directly
The mode comparison showed tactical-smart (+65.8%) outperforming pure optimized (+60.2%) with default params. Instead of optimizing the "optimized" mode (individual stock signals), build a backtester that simulates tactical-smart logic:

- SPY-based entry/exit (above 50 SMA = buy, below 20 SMA for 3 days = sell all)
- Scored stock selection: momentum × 300 + signal score + confidence × 2
- Inverse volatility weighted position sizing
- Active rotation: swap weak positions for strong ones during holds
- GA tunes the same 8 params but they're applied within the tactical-smart framework

The current optimizer backtester simulates a simple signal → buy/sell loop. A tactical-smart backtester would simulate the full SPY timing + scoring + rotation loop, finding params that work best for that specific mode.

**Impact:** High. The GA would optimize what you'd actually run live. Tactical-smart with tuned params could significantly outperform both current optimized mode and tactical-smart with defaults.

### Adaptive Take Profit — Option B (Volatility-Scaled)
Instead of ATR × multiplier (current approach), scale take profit based on both ATR and momentum:

```
takeProfit = entry + ATR × baseMult × (1 + momentumBoost)
```

Stocks with strong momentum get even wider targets. Stocks with weak momentum take profits tighter. Adds one more param for the GA to tune (`momentumBoostFactor`), but could better separate breakout trades from mean-reversion trades.

**Impact:** Low-medium. Current ATR × mult already adapts to volatility. Adding momentum scaling adds complexity the GA may not reliably exploit.
