CREATE TABLE IF NOT EXISTS stats_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  path TEXT,
  domain TEXT,
  visitor_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  ua_summary TEXT,
  country TEXT
);
CREATE INDEX IF NOT EXISTS idx_stats_events_kind_ts ON stats_events(kind, ts);
CREATE INDEX IF NOT EXISTS idx_stats_events_domain_ts ON stats_events(domain, ts);
