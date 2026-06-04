/* ─── Rate Limit 中间件（IP 维度） ─── */

import type { Env, RatelimitResult } from '../types';

/**
 * 三层限流：
 * 1. 每分钟最多 MAX 次（高频检测 → 冷却）
 * 2. 每天最多 MAX_IP_DAILY_LIMIT 次（IP硬上限）
 * 3. 免费层每天 FREE_DAILY_LIMIT 次（未注册）/ 注册后 REGISTERED_DAILY_LIMIT 次
 */

const MINUTE_WINDOW = 60; // seconds
const DAY_WINDOW = 86400; // seconds

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function todayKey(ip: string): string {
  // 使用亚洲/上海时区（用户所在地），而非 UTC
  const tz = 'Asia/Shanghai';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateStr = fmt.format(new Date()); // "YYYY-MM-DD"
  return `${ip}:${dateStr}`;
}

/**
 * 查询当前 IP 本日已使用次数 & 是否已注册
 */
async function getIpUsage(env: Env, ip: string): Promise<{ count: number; registered: boolean }> {
  const key = todayKey(ip);
  const row = await env.DB.prepare(
    'SELECT request_count, registered FROM ip_daily_usage WHERE ip_date_key = ?'
  )
    .bind(key)
    .first<{ request_count: number; registered: boolean }>();

  return { count: row?.request_count ?? 0, registered: row?.registered ?? false };
}

/**
 * 递增 IP 使用计数（条件 UPDATE 防并发）
 * 新 IP 首个请求走 INSERT OR IGNORE + UPDATE
 */
async function incrementUsage(
  env: Env,
  ip: string,
  registered = false
): Promise<{ count: number }> {
  const key = todayKey(ip);

  // 尝试插入（幂等）
  await env.DB.prepare(
    `INSERT OR IGNORE INTO ip_daily_usage (ip_date_key, first_seen, request_count, registered)
     VALUES (?, ?, 0, ?)`
  )
    .bind(key, now(), registered ? 1 : 0)
    .run();

  // 条件增量，返回更新后的值
  const result = await env.DB.prepare(
    `UPDATE ip_daily_usage SET request_count = request_count + 1
     WHERE ip_date_key = ? RETURNING request_count`
  )
    .bind(key)
    .first<{ request_count: number }>();

  return { count: result?.request_count ?? 1 };
}

/**
 * 每分钟限流（基于 D1 minute_buckets 表滑动窗口）
 */
async function checkMinuteLimit(env: Env, ip: string): Promise<{
  allowed: boolean;
  cooldownUntil?: number;
}> {
  const minuteLimit = parseInt(env.MINUTE_RATE_LIMIT, 10) || 3;
  const cooldownSecs = parseInt(env.COOLDOWN_SECONDS, 10) || 60;
  const windowStart = now() - MINUTE_WINDOW;

  // 清理旧记录
  await env.DB.prepare('DELETE FROM minute_buckets WHERE timestamp < ?')
    .bind(windowStart)
    .run();

  // 插入当前请求
  await env.DB.prepare('INSERT INTO minute_buckets (ip, timestamp) VALUES (?, ?)')
    .bind(ip, now())
    .run();

  // 统计窗口内请求
  const row = await env.DB.prepare(
    'SELECT COUNT(*) as cnt, MAX(timestamp) as latest FROM minute_buckets WHERE ip = ? AND timestamp > ?'
  )
    .bind(ip, windowStart)
    .first<{ cnt: number; latest: number }>();

  if (!row || row.cnt <= minuteLimit) {
    return { allowed: true };
  }

  // 超出限制：计算冷却时间
  const cooldownUntil = (row.latest || now()) + cooldownSecs;
  return { allowed: false, cooldownUntil };
}

/**
 * 全量限流检查
 */
export async function checkLimit(env: Env, ip: string): Promise<RatelimitResult> {
  // 第一层：每分钟限流
  const minuteCheck = await checkMinuteLimit(env, ip);
  if (!minuteCheck.allowed) {
    const wait = (minuteCheck.cooldownUntil || now() + 60) - now();
    return {
      allowed: false,
      code: 'RATE_LIMITED_MINUTE',
      retryAfter: Math.max(1, wait),
    };
  }

  // 第二层：IP 硬上限（每天）
  const { count: todayCount } = await getIpUsage(env, ip);
  const maxDaily = parseInt(env.MAX_IP_DAILY_LIMIT, 10) || 30;
  if (todayCount >= maxDaily) {
    return {
      allowed: false,
      code: 'IP_DAILY_LIMIT_REACHED',
    };
  }

  return { allowed: true, code: 'OK' };
}

/**
 * 检查免费层额度 + 消费计数
 */
export async function consumeFreeQuota(
  env: Env,
  ip: string
): Promise<{
  allowed: boolean;
  code: string;
  remaining?: number;
  dailyLimit: number;
}> {
  const { count: todayCount, registered } = await getIpUsage(env, ip);
  const dailyLimit = registered
    ? parseInt(env.REGISTERED_DAILY_LIMIT, 10) || 10
    : parseInt(env.FREE_DAILY_LIMIT, 10) || 5;

  if (todayCount >= dailyLimit) {
    return {
      allowed: false,
      code: 'DAILY_QUOTA_EXCEEDED',
      remaining: 0,
      dailyLimit,
    };
  }

  // 消费一次（计数+1）
  // 注意：实际生成成功后才实时可见；此处预占但允许超1次（最终校验在 AI 生成前）
  const { count: newCount } = await incrementUsage(env, ip, registered);

  const remaining = Math.max(0, dailyLimit - newCount);
  return {
    allowed: true,
    code: 'OK',
    remaining,
    dailyLimit,
  };
}

/** 检查免费层额度（不消费） — 用于预检查，失败时不扣额度 */
export async function checkFreeQuota(
  env: Env,
  ip: string
): Promise<{
  allowed: boolean;
  code: string;
  remaining?: number;
  dailyLimit: number;
}> {
  const { count: todayCount, registered } = await getIpUsage(env, ip);
  const dailyLimit = registered
    ? parseInt(env.REGISTERED_DAILY_LIMIT, 10) || 10
    : parseInt(env.FREE_DAILY_LIMIT, 10) || 5;

  if (todayCount >= dailyLimit) {
    return {
      allowed: false,
      code: 'DAILY_QUOTA_EXCEEDED',
      remaining: 0,
      dailyLimit,
    };
  }

  return {
    allowed: true,
    code: 'OK',
    remaining: dailyLimit - todayCount,
    dailyLimit,
  };
}

/** 获取当前 IP 的剩余次数信息（不消费） */
export async function getQuotaInfo(
  env: Env,
  ip: string
): Promise<{ remaining: number; dailyLimit: number; used: number }> {
  const { count, registered } = await getIpUsage(env, ip);
  const dailyLimit = registered
    ? parseInt(env.REGISTERED_DAILY_LIMIT, 10) || 10
    : parseInt(env.FREE_DAILY_LIMIT, 10) || 5;
  return {
    remaining: Math.max(0, dailyLimit - count),
    dailyLimit,
    used: count,
  };
}
