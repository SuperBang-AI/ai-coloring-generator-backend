/* ─── Cloudflare Workers 主入口 ───
 *
 * AI Coloring Page Generator — API 后端
 *
 * 路由表：
 *   GET  /api/health    — 健康检查
 *   GET  /api/usage     — 查询当前IP剩余额度
 *   POST /api/generate  — 生成涂色线稿
 *   GET  /api/images/*  — R2 缓存图片直出
 *   ALL  /*             — 回落静态资源
 */

import type { Env } from './types';
import { corsPreflight, json, error } from './lib/response';
import { handleHealth } from './routes/health';
import { handleGenerate } from './routes/generate';
import { handleUsage } from './routes/usage';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return corsPreflight();
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // ── API Routes ──
      if (pathname === '/api/health') {
        return handleHealth(env);
      }

      if (pathname === '/api/generate') {
        return handleGenerate(request, env);
      }

      if (pathname === '/api/usage') {
        return handleUsage(request, env);
      }

      // ── R2 图片代理 ──
      if (pathname.startsWith('/api/images/')) {
        const objectPath = pathname.slice('/api/images/'.length);
        const obj = await env.R2.get(objectPath);
        if (!obj) {
          return error('Image not found', 'NOT_FOUND', 404);
        }
        const body = await obj.arrayBuffer();
        return new Response(body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
            'ETag': obj.httpEtag || '',
          },
        });
      }

      // ── 静态资源 ──
      return env.ASSETS.fetch(request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal server error';
      console.error('Unhandled error:', msg);
      return error('Internal server error', 'INTERNAL_ERROR', 500);
    }
  },
};
