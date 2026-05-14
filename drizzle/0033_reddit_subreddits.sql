-- Admin-managed list of subreddits the Reddit ticker-mention feed queries.
--
-- Surfaced on the Analysis page → Reddit intelligence tab, and (later) as
-- a "Trending tickers on Reddit" dashboard widget. Admins manage the set
-- via /dashboard/admin → Reddit Subreddits card so we don't have to ship
-- a code change every time a new finance subreddit appears.
--
-- Columns:
--   name           Lowercase subreddit slug (no "r/" prefix). Used directly
--                  in the Reddit JSON URL.
--   display_name   What the UI shows ("WallStreetBets" vs. "wallstreetbets").
--   description    Optional human note ("Meme-driven retail" / "Long-form DD").
--   weight         1.0 = treat as authoritative; <1.0 = down-weight in the
--                  hybrid sentiment aggregator. Lets admins penalize noisy
--                  subs without removing them.
--   enabled        Soft-disable without losing the row.
--
-- Seeds with the four standard finance subreddits. Re-running the migration
-- on a populated DB is a no-op (ON CONFLICT DO NOTHING).

CREATE TABLE IF NOT EXISTS reddit_subreddits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  description   TEXT,
  weight        NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lowercase-only natural key. Case-insensitive uniqueness via a functional
-- index — Reddit treats /r/Stocks and /r/stocks as the same sub, so we do
-- too.
CREATE UNIQUE INDEX IF NOT EXISTS reddit_subreddits_name_uniq
  ON reddit_subreddits (LOWER(name));

CREATE INDEX IF NOT EXISTS reddit_subreddits_enabled_idx
  ON reddit_subreddits (enabled) WHERE enabled = true;

-- Seed: standard finance subreddits. Weights reflect signal-to-noise:
--   - r/stocks                ~ general, low noise
--   - r/investing             ~ long-horizon, low noise
--   - r/SecurityAnalysis      ~ DD-heavy, very low noise (but low volume)
--   - r/wallstreetbets        ~ high signal velocity, very noisy → down-weighted
INSERT INTO reddit_subreddits (name, display_name, description, weight)
VALUES
  ('stocks',           'r/stocks',           'General stock discussion',                  1.00),
  ('investing',        'r/investing',        'Long-horizon discussion + analysis',        1.00),
  ('SecurityAnalysis', 'r/SecurityAnalysis', 'Deep-dive due-diligence posts (low volume)', 1.00),
  ('wallstreetbets',   'r/wallstreetbets',   'Retail meme + options chatter (noisy)',     0.40)
ON CONFLICT DO NOTHING;
