/* ─── GET /api/health ─── */

import type { Env } from '../types';
import { json } from '../lib/response';

let startTime = Date.now();

export function handleHealth(env: Env): Response {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  return json({
    status: 'ok',
    version: '1.0.0',
    uptime,
    aiProvider: env.AI_PROVIDER || 'replicate',
    model: env.AI_MODEL || 'black-forest-labs/flux-schnell',
    timestamp: new Date().toISOString(),
  });
}
