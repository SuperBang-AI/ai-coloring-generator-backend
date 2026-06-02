# Deployment Report — AI Coloring Page Generator Backend

> 生成时间：2026-06-02

---

## 部署检查清单

### Phase 0: 前置检查
- [x] Node.js 已安装
- [x] Wrangler CLI 可运行
- [x] Cloudflare 账号就绪

### Phase 1: 项目生成
- [x] 目录结构完成
- [x] 所有源代码文件已创建
- [x] package.json / tsconfig.json / wrangler.toml 就绪

### Phase 2: Cloudflare 资源（待部署时执行）
- [ ] `npx wrangler d1 create coloring-gen-db`
- [ ] `npx wrangler r2 bucket create coloring-gen-assets`
- [ ] 将 D1 database_id 填入 wrangler.toml

### Phase 3: Secrets（待部署时配置）
- [ ] REPLICATE_API_TOKEN — Replicate API Key
- [ ] TURNSTILE_SECRET_KEY — Cloudflare Turnstile Secret Key
- [ ] 更新 wrangler.toml 中的 `APP_ORIGIN` 为实际域名

### Phase 4: D1 Migration
- [ ] `npx wrangler d1 execute coloring-gen-db --remote --file=migrations/0001_init.sql`

### Phase 5: 部署
- [ ] `npm install`
- [ ] `npx tsc --noEmit`
- [ ] `npx wrangler deploy`

### Phase 6: 验收
- [ ] `GET /api/health` → 200
- [ ] `GET /api/usage` → 200（返回额度信息）
- [ ] `POST /api/generate` → 200（返回涂色线稿 PNG）

---

## 架构概览

```
用户请求 → Cloudflare Edge → Workers
                              ├── /api/health     → 健康检查
                              ├── /api/usage      → 查询配额
                              ├── /api/generate   → 生成涂色页
                              │   ├── 第1层：分钟限流 (D1 minute_buckets)
                              │   ├── 第2层：IP硬上限 (D1 ip_daily_usage)
                              │   ├── 第3层：免费额消费 (D1 ip_daily_usage)
                              │   ├── Turnstile验证 (可选)
                              │   ├── R2缓存查询
                              │   ├── Replicate Flux Schnell AI生成
                              │   └── R2缓存存储
                              ├── /api/images/*   → R2图片直出
                              └── 其他            → Static Assets
```

## 成本估算

| 场景 | DAU | 日均生成 | 日成本 | 月成本 |
|------|-----|---------|--------|--------|
| 冷启动 | 50 | 150次 | $0.45 | $13.50 |
| 标准运行 | 200 | 600次 | $1.80 | $54.00 |
| 扩展期 | 500 | 1,500次 | $4.50 | $135.00 |

> 基于 Replicate Flux Schnell $0.003/次 + Cloudflare Free Plan
