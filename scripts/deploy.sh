#!/bin/bash
# ====================================================
# AI Coloring Generator — 一键部署脚本
# ====================================================
set -euo pipefail

SITE_SLUG="coloring-generator"
DOMAIN="${DOMAIN:-aicoloringmaker.com}"

echo "==> 1/7: 安装依赖"
npm install

echo "==> 2/7: TypeScript 类型检查"
npx tsc --noEmit

echo "==> 3/7: 创建 Cloudflare 资源（如果尚未创建）"
# D1
npx wrangler d1 create coloring-gen-db 2>/dev/null || echo "  D1 database already exists"

# R2
npx wrangler r2 bucket create coloring-gen-assets 2>/dev/null || echo "  R2 bucket already exists"

echo "==> 4/7: 写入 Secrets"
# 通过 .env 文件或环境变量提供
if [ -n "${REPLICATE_API_TOKEN:-}" ]; then
  printf '%s' "$REPLICATE_API_TOKEN" | npx wrangler secret put REPLICATE_API_TOKEN
  echo "  ✓ REPLICATE_API_TOKEN"
fi

if [ -n "${TURNSTILE_SECRET_KEY:-}" ]; then
  printf '%s' "$TURNSTILE_SECRET_KEY" | npx wrangler secret put TURNSTILE_SECRET_KEY
  echo "  ✓ TURNSTILE_SECRET_KEY"
fi

echo "==> 5/7: D1 远程迁移"
npx wrangler d1 execute coloring-gen-db --remote --file=migrations/0001_init.sql

echo "==> 6/7: 部署 Worker"
npx wrangler deploy

echo "==> 7/7: 验收"
WORKER_URL=$(npx wrangler whoami 2>/dev/null | head -1 || echo "")
echo ""

echo "Health Check:"
curl -s "https://${DOMAIN}/api/health" || echo "  (domain not yet configured)"
echo ""

echo "Usage Check:"
curl -s "https://${DOMAIN}/api/usage" || echo "  (domain not yet configured)"
echo ""

echo "=== 部署完成 ==="
echo "请确保以下环境变量已配置："
echo "  - REPLICATE_API_TOKEN"
echo "  - TURNSTILE_SECRET_KEY (可选，用于Turnstile验证)"
echo "  - 修改 wrangler.toml 中的 APP_ORIGIN 为实际域名"
echo "  - 在 Cloudflare Dashboard 绑定自定义域名"
