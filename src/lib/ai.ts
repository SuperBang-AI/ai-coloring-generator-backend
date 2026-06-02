/* ─── AI 生成：Replicate API 代理 ─── */

import type { Env } from '../types';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

/**
 * 构建涂色线稿 prompt
 * Flux Schnell 需要英文 prompt，追加风格指令确保生成黑白线稿
 */
function buildColoringPrompt(userPrompt: string, style?: string): string {
  const styleInstructions: Record<string, string> = {
    simple: 'simple bold outlines, large shapes, minimal details, suitable for young children ages 3-6',
    medium: 'clear outlines, moderate details, suitable for children ages 6-12',
    complex: 'intricate detailed outlines, mandala-like patterns, suitable for teens and adults',
  };

  const difficulty = styleInstructions[style || 'medium'] || styleInstructions.medium;

  return `coloring book page, black and white line art, clean outlines, no shading, no colors, no grayscale, white background, ${difficulty}: ${userPrompt}`;
}

/**
 * 调用 Replicate API 创建预测
 */
async function createPrediction(
  apiToken: string,
  apiBase: string,
  model: string,
  prompt: string
): Promise<ReplicatePrediction> {
  const resp = await fetch(`${apiBase}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      Prefer: 'wait', // 同步等待完成（Flux Schnell 通常 <3s）
    },
    body: JSON.stringify({
      version: model, // 或用 model string
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: '1:1',
        output_format: 'png',
        output_quality: 90,
        disable_safety_checker: true, // 涂色页不需要安全检查
      },
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Replicate API error (${resp.status}): ${errBody.slice(0, 500)}`);
  }

  return (await resp.json()) as ReplicatePrediction;
}

/**
 * 轮询直到预测完成
 */
async function waitForPrediction(
  apiToken: string,
  apiBase: string,
  predictionId: string,
  maxRetries: number
): Promise<ReplicatePrediction> {
  for (let i = 0; i < maxRetries; i++) {
    const resp = await fetch(`${apiBase}/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Replicate poll error (${resp.status}): ${errBody.slice(0, 300)}`);
    }

    const pred = (await resp.json()) as ReplicatePrediction;

    if (pred.status === 'succeeded' || pred.status === 'failed' || pred.status === 'canceled') {
      return pred;
    }

    // Flux Schnell 通常 <3s，等待 1s 重试
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error('Prediction timed out');
}

/**
 * 下载预测结果图片
 */
async function downloadImage(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download image: ${resp.status}`);
  }
  return resp.arrayBuffer();
}

/**
 * 完整生成流程：prompt → Replicate → 图片 buffer
 */
export async function generateImage(
  env: Env,
  prompt: string,
  style?: string
): Promise<ArrayBuffer> {
  const apiToken = env.REPLICATE_API_TOKEN;
  const apiBase = env.REPLICATE_API_BASE || 'https://api.replicate.com/v1';
  const model = env.AI_MODEL || 'black-forest-labs/flux-schnell';
  const maxRetries = parseInt(env.MAX_RETRIES, 10) || 2;

  const fullPrompt = buildColoringPrompt(prompt, style);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Step 1: 创建预测（使用 Prefer: wait 可以同步等待）
      const prediction = await createPrediction(apiToken, apiBase, model, fullPrompt);

      // Step 2: 如果没立即完成，轮询
      let finalPrediction = prediction;
      if (prediction.status === 'starting' || prediction.status === 'processing') {
        finalPrediction = await waitForPrediction(apiToken, apiBase, prediction.id, 10);
      }

      if (finalPrediction.status === 'failed') {
        throw new Error(`AI generation failed: ${finalPrediction.error || 'unknown error'}`);
      }

      if (finalPrediction.status === 'canceled') {
        throw new Error('AI generation was canceled');
      }

      // Step 3: 下载结果
      const outputUrl = Array.isArray(finalPrediction.output)
        ? finalPrediction.output[0]
        : finalPrediction.output;

      if (!outputUrl) {
        throw new Error('No output URL in prediction result');
      }

      return await downloadImage(outputUrl);
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
