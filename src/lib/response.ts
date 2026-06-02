/* ─── HTTP 响应工具 ─── */

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...headers,
    },
  });
}

export function error(message: string, code: string, status = 400, retryAfter?: number): Response {
  const body: Record<string, unknown> = { error: message, code };
  if (retryAfter) body.retryAfter = retryAfter;
  const headers: Record<string, string> = {};
  if (retryAfter) headers['Retry-After'] = String(retryAfter);
  return json(body, status, headers);
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
