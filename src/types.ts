/* ─── 类型定义 ─── */

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  ASSETS: Fetcher;
  // Secrets
  REPLICATE_API_TOKEN: string;
  TURNSTILE_SECRET_KEY: string;
  // Vars
  SITE_NAME: string;
  APP_ORIGIN: string;
  AI_PROVIDER: string;
  AI_MODEL: string;
  REPLICATE_API_BASE: string;
  FREE_DAILY_LIMIT: string;
  REGISTERED_DAILY_LIMIT: string;
  MAX_IP_DAILY_LIMIT: string;
  MINUTE_RATE_LIMIT: string;
  COOLDOWN_SECONDS: string;
  MAX_RETRIES: string;
  TURNSTILE_SITE_KEY: string;
  CACHE_TTL_DAYS: string;
}

export interface GenerateRequest {
  prompt: string;
  style?: 'simple' | 'medium' | 'complex';
  turnstileToken?: string;
}

export interface GenerateResponse {
  id: string;
  url: string;
  prompt: string;
  cached: boolean;
  remaining?: number;
}

export interface ApiError {
  error: string;
  code: string;
  retryAfter?: number;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
  aiProvider: string;
  model: string;
}

export interface RatelimitResult {
  allowed: boolean;
  code: string;
  retryAfter?: number;
  remaining?: number;
}
