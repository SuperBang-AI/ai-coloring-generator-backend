# API Contract — AI Coloring Page Generator

> 版本：v1.0 | 基础URL：`https://aicoloringmaker.com`

---

## 端点清单

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| `GET` | `/api/health` | 健康检查 | 无 |
| `GET` | `/api/usage` | 查询当前 IP 剩余额度 | 无（IP维度） |
| `POST` | `/api/generate` | 生成涂色线稿 | 无（IP限流） |
| `GET` | `/api/images/*` | 获取 R2 缓存的图片 | 无 |

---

## 1. GET /api/health

**响应 200：**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600,
  "aiProvider": "replicate",
  "model": "black-forest-labs/flux-schnell",
  "timestamp": "2026-06-02T09:00:00.000Z"
}
```

---

## 2. GET /api/usage

**响应 200：**

```json
{
  "ip_hash": "203.0.113...",
  "usedToday": 2,
  "remaining": 3,
  "dailyLimit": 5,
  "resetAt": "2026-06-03T00:00:00.000Z"
}
```

---

## 3. POST /api/generate

**请求：**

```json
{
  "prompt": "a cute cat playing with yarn",
  "style": "medium",
  "turnstileToken": "XXXX.DUMMY.TOKEN.XXXX"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | ✅ | 文字描述（最多500字符） |
| `style` | string | ❌ | `simple` / `medium` / `complex`（默认 medium） |
| `turnstileToken` | string | ❌ | Turnstile 验证 token（可选） |

**响应 200（图片二进制）：**

```http
Content-Type: image/png
X-Cache: HIT | MISS
X-Image-Url: https://aicoloringmaker.com/api/images/generated/abc123/cache:....png
X-Remaining: 2
```

**错误响应：**

```json
// 400 — 参数错误
{ "error": "Missing required field: prompt", "code": "MISSING_PROMPT" }

// 429 — 超出限流
{ "error": "Daily free limit (5) reached. Try again tomorrow.", "code": "DAILY_QUOTA_EXCEEDED" }
{ "error": "Too many requests. Please wait.", "code": "RATE_LIMITED_MINUTE", "retryAfter": 45 }

// 502 — AI 生成失败
{ "error": "AI generation failed. Please try again with a different prompt.", "code": "AI_GENERATION_FAILED" }
```

**限流规则：**

| 层级 | 限制 | 说明 |
|------|------|------|
| 每分钟 | 3次/IP | 超过后冷却60秒 |
| 每日IP硬上限 | 30次/IP | 防滥用 |
| 每日免费额度 | 5次/IP（免登）| 可通过注册提升至10次 |

---

## 4. GET /api/images/{path}

直接返回 R2 存储的图片二进制，带 `Cache-Control: public, max-age=86400`。

---

## CORS

所有 API 端点支持 CORS `*`，允许 `GET, POST, OPTIONS`。

---

## 技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| 运行时 | Cloudflare Workers | Serverless，全球边缘节点 |
| 数据库 | Cloudflare D1 | SQLite，记录每日IP用量 |
| 对象存储 | Cloudflare R2 | 缓存生成结果，10GB免费层 |
| AI 模型 | Replicate Flux Schnell | $0.003/次，2-5秒出图 |
| 验证码 | Cloudflare Turnstile | 免费，高频用户触发 |
| 前端部署 | Workers Static Assets | 单页应用 |
