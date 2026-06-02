-- ============================================================
-- AI Coloring Generator — D1 Schema v1
-- ============================================================

-- 每日 IP 用量表（按日期 + IP 去重）
CREATE TABLE IF NOT EXISTS ip_daily_usage (
  ip_date_key  TEXT PRIMARY KEY,        -- "{ip}:{YYYY-MM-DD}"
  first_seen   INTEGER NOT NULL,        -- UTC timestamp (seconds)
  request_count INTEGER NOT NULL DEFAULT 0,
  registered   INTEGER NOT NULL DEFAULT 0, -- 0=未注册, 1=已注册
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 每分钟请求桶（用于高频检测 & 冷却）
CREATE TABLE IF NOT EXISTS minute_buckets (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ip        TEXT NOT NULL,
  timestamp INTEGER NOT NULL  -- UTC seconds
);

CREATE INDEX IF NOT EXISTS idx_minute_buckets_ip_ts
  ON minute_buckets(ip, timestamp);

-- 生成记录（可选，用于分析）
CREATE TABLE IF NOT EXISTS generation_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash       TEXT NOT NULL,         -- 脱敏 IP（前8字符）
  prompt_hash   TEXT NOT NULL,         -- prompt MD5 摘要
  style         TEXT,
  cached        INTEGER NOT NULL DEFAULT 0,
  success       INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_gen_logs_ip_date
  ON generation_logs(ip_hash, created_at);
