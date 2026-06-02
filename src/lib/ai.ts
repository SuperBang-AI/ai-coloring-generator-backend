/* ─── AI 生成：智谱 CogView-4 API ─── */

import type { Env } from '../types';

interface ZhipuImageResponse {
  created: number;
  data: Array<{
    url: string;
    revised_prompt?: string;
  }>;
}

/**
 * 构建涂色线稿 prompt
 * CogView-4 支持中英文 prompt，追加风格指令确保生成黑白线稿
 */
function buildColoringPrompt(userPrompt: string, style?: string): string {
  const styleInstructions: Record<string, string> = {
    simple: 'simple bold outlines, large shapes, minimal details, suitable for young children ages 3-6',
    medium: 'clear outlines, moderate details, suitable for children ages 6-12',
    complex: 'intricate detailed outlines, mandala-like patterns, suitable for teens and adults',
  };

  const difficulty = styleInstructions[style || 'medium'] || styleInstructions.medium;

  return `coloring page for kids, black and white line art, simple outlines, no colors, no shading: ${userPrompt}, ${difficulty}`;
}

/**
 * 调用智谱 CogView-4 API 生成图片
 */
async function callZhipuAPI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      size: '1024x1024',
      n: 1,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Zhipu API error (${resp.status}): ${errBody.slice(0, 500)}`);
  }

  const result = (await resp.json()) as ZhipuImageResponse;

  if (!result.data || result.data.length === 0 || !result.data[0].url) {
    throw new Error(`Zhipu API returned no image URL: ${JSON.stringify(result)}`);
  }

  return result.data[0].url;
}

/**
 * 下载生成的图片
 */
async function downloadImage(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download image: ${resp.status}`);
  }
  return resp.arrayBuffer();
}

/**
 * 完整生成流程：prompt → 智谱 CogView-4 → 图片 buffer
 */
export async function generateImage(
  env: Env,
  prompt: string,
  style?: string
): Promise<ArrayBuffer> {
  const apiKey = env.ZHIPU_API_KEY;
  const model = env.AI_MODEL || 'cogview-4';
  const maxRetries = parseInt(env.MAX_RETRIES, 10) || 2;

  const fullPrompt = buildColoringPrompt(prompt, style);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Step 1: 调用智谱 API 生成图片，获取 URL
      const imageUrl = await callZhipuAPI(apiKey, model, fullPrompt);

      // Step 2: 下载图片二进制数据
      return await downloadImage(imageUrl);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        // 指数退避
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error('All generation attempts failed');
}
