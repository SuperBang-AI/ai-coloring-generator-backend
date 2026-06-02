/* ─── R2 缓存操作 ─── */

import type { Env } from '../types';

/**
 * 根据 prompt hash 生成缓存 key
 * 对 prompt 做标准化：trim + lowercase + 去除多余空格
 */
function cacheKey(prompt: string, style?: string): string {
  const normalized = prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  const styleSuffix = style ? `:${style}` : '';
  return `cache:${normalized}${styleSuffix}.png`;
}

/** 计算简单哈希（用于文件名） */
function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  // 取绝对值并转 hex
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/** 生成存储路径 */
function storagePath(prompt: string, style?: string): string {
  const key = cacheKey(prompt, style);
  return `generated/${hashString(key)}/${key}`;
}

/**
 * 写入 R2 并返回公开 URL
 */
export async function uploadToR2(
  env: Env,
  imageBuffer: ArrayBuffer,
  prompt: string,
  style?: string,
  contentType = 'image/png'
): Promise<string> {
  const path = storagePath(prompt, style);
  await env.R2.put(path, imageBuffer, {
    httpMetadata: {
      contentType,
      cacheControl: `public, max-age=${86400 * 30}`,
      cacheExpiry: new Date(Date.now() + 86400000 * 30),
    },
    customMetadata: {
      prompt: prompt.slice(0, 256),
      style: style || '',
      createdAt: new Date().toISOString(),
    },
  });
  return path;
}

/**
 * 查询 R2 缓存（命中时返回图片数据）
 */
export async function getFromR2(
  env: Env,
  prompt: string,
  style?: string
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const path = storagePath(prompt, style);
  const obj = await env.R2.get(path);
  if (!obj) return null;

  const buffer = await obj.arrayBuffer();
  return {
    buffer,
    contentType: obj.httpMetadata?.contentType || 'image/png',
  };
}

/**
 * 获取 R2 公开访问 URL（通过自定义域名或 workers.dev）
 */
export function getR2PublicUrl(path: string, origin: string): string {
  return `${origin}/api/images/${path}`;
}
