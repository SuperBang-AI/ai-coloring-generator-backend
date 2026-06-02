/* ─── GET /api/usage ─── */

import type { Env } from '../types';
import { json, error } from '../lib/response';
import { getQuotaInfo } from '../lib/ratelimit';

function getClientIP(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    request.headers.get('X-Real-IP') ||
    '127.0.0.1'
  );
}

export async function handleUsage(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== 'GET') {
    return error('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
  }

  const ip = getClientIP(request);
  const info = await getQuotaInfo(env, ip);

  return json({
    ip_hash: ip.slice(0, 8) + '...', // 脱敏
    usedToday: info.used,
    remaining: info.remaining,
    dailyLimit: info.dailyLimit,
    resetAt: new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() + 1
    )).toISOString(),
  });
}
