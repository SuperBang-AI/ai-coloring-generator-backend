/* ─── Turnstile 验证 ─── */

/**
 * 校验 Cloudflare Turnstile Token
 * 文档：https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function verifyTurnstile(
  token: string,
  secretKey: string,
  remoteIp?: string
): Promise<{ success: boolean; errorCodes?: string[] }> {
  const formData = new URLSearchParams();
  formData.set('secret', secretKey);
  formData.set('response', token);
  if (remoteIp) formData.set('remoteip', remoteIp);

  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const result = (await resp.json()) as { success: boolean; 'error-codes'?: string[] };
  return { success: result.success, errorCodes: result['error-codes'] };
}
