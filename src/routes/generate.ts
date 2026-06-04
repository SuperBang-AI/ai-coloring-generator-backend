/* ─── POST /api/generate ─── */

import type { Env, GenerateRequest, GenerateResponse } from '../types';
import { json, error } from '../lib/response';
import { checkLimit, consumeFreeQuota, checkFreeQuota } from '../lib/ratelimit';
import { verifyTurnstile } from '../lib/turnstile';
import { generateImage } from '../lib/ai';
import { getFromR2, uploadToR2, getR2PublicUrl } from '../lib/r2';

function getClientIP(request: Request): string {
  // X-Quota-Id takes top priority — set by our trusted Next.js proxy
  // This carries the client-side generated ID for per-user quota tracking
  const quotaId = request.headers.get('X-Quota-Id');
  if (quotaId) return quotaId;

  // Fallback chain for direct access
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Real-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

const MAX_PROMPT_LENGTH = 500;
const VALID_STYLES = ['simple', 'medium', 'complex'];

export async function handleGenerate(
  request: Request,
  env: Env
): Promise<Response> {
  // 仅 POST
  if (request.method !== 'POST') {
    return error('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
  }

  const ip = getClientIP(request);

  // Step 1: 三层限流检查
  const rateCheck = await checkLimit(env, ip);
  if (!rateCheck.allowed) {
    return error(
      rateCheck.code === 'RATE_LIMITED_MINUTE'
        ? 'Too many requests. Please wait.'
        : 'Daily IP limit reached. Try again tomorrow.',
      rateCheck.code,
      429,
      rateCheck.retryAfter
    );
  }

  // Step 2: 解析请求体
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return error('Invalid JSON body', 'INVALID_JSON', 400);
  }

  // Step 3: 参数校验
  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length === 0) {
    return error('Missing required field: prompt', 'MISSING_PROMPT', 400);
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return error(
      `Prompt too long. Maximum ${MAX_PROMPT_LENGTH} characters.`,
      'PROMPT_TOO_LONG',
      400
    );
  }
  const style = body.style || 'medium';
  if (!VALID_STYLES.includes(style)) {
    return error(
      `Invalid style. Must be one of: ${VALID_STYLES.join(', ')}`,
      'INVALID_STYLE',
      400
    );
  }

  // Step 4: 免费层额度预检查（只查不扣，失败时不消耗额度）
  const preCheck = await checkFreeQuota(env, ip);
  if (!preCheck.allowed) {
    return error(
      preCheck.code === 'DAILY_QUOTA_EXCEEDED'
        ? `Daily free limit (${preCheck.dailyLimit}) reached. Try again tomorrow.`
        : 'Quota exceeded',
      preCheck.code,
      429
    );
  }

  // Step 5: Turnstile 验证
  if (body.turnstileToken && env.TURNSTILE_SECRET_KEY) {
    const turnstileResult = await verifyTurnstile(
      body.turnstileToken,
      env.TURNSTILE_SECRET_KEY,
      ip
    );
    if (!turnstileResult.success) {
      return error('Turnstile verification failed', 'TURNSTILE_FAILED', 400);
    }
  }

  // Step 6: 检查 R2 缓存
  try {
    const cached = await getFromR2(env, prompt, style);
    if (cached) {
      // 命中缓存：扣额度后返回
      const quotaResult = await consumeFreeQuota(env, ip);
      return new Response(cached.buffer, {
        status: 200,
        headers: {
          'Content-Type': cached.contentType,
          'X-Cache': 'HIT',
          'Cache-Control': 'public, max-age=86400',
          'X-Remaining': String(quotaResult.remaining ?? 0),
        },
      });
    }
  } catch (err) {
    // 缓存查询失败不阻塞生成
    console.warn('R2 cache lookup failed:', err);
  }

  // Step 7: AI 生成
  let imageBuffer: ArrayBuffer;
  try {
    imageBuffer = await generateImage(env, prompt, style);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI generation failed';
    console.error('AI generation error:', msg);
    // AI 生成失败，不扣额度
    return error(
      'AI generation failed. Please try again with a different prompt.',
      'AI_GENERATION_FAILED',
      502
    );
  }

  // Step 8: AI 生成成功，才扣减额度
  const quotaResult = await consumeFreeQuota(env, ip);

  // Step 9: 存储到 R2
  let imagePath: string;
  try {
    imagePath = await uploadToR2(env, imageBuffer, prompt, style);
  } catch (err) {
    console.error('R2 upload failed:', err);
    // 上传失败不阻塞响应，直接返回图片
    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=300',
        'X-Remaining': String(quotaResult.remaining ?? 0),
      },
    });
  }

  // Step 10: 返回结果
  const publicUrl = getR2PublicUrl(imagePath, env.APP_ORIGIN);

  return new Response(imageBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'X-Cache': 'MISS',
      'Cache-Control': 'public, max-age=86400',
      'X-Image-Url': publicUrl,
      'X-Remaining': String(quotaResult.remaining ?? 0),
    },
  });
}
