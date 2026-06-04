/* ─── GET /api/usage ─── */

import type { Env } from '../types';
import { json, error } from '../lib/response';
import { getQuotaInfo } from '../lib/ratelimit';

function getClientIP(request: Request): string {
  // X-Quota-Id takes top priority — set by our trusted Next.js proxy
  const quotaId = request.headers.get('X-Quota-Id');
  if (quotaId) return quotaId;

  // Check query param as fallback
  const url = new URL(request.url);
  const queryClientId = url.searchParams.get('clientId');
  if (queryClientId) return queryClientId;

  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Real-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
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
