#!/usr/bin/env bash
# 服务器端一键启动。用法： cd /opt/yingtu && bash deploy/install.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "未安装 Docker。先执行： curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if [ ! -f deploy/.env ]; then
  cp deploy/.env.example deploy/.env
  echo "已生成 deploy/.env，请填好 DOMAIN / PANSOU_DOMAIN / 密码 / BASIC_AUTH_HASH 后再执行本脚本。"
  exit 1
fi

if ! grep -qE '^BASIC_AUTH_HASH=\$\$2' deploy/.env; then
  echo "BASIC_AUTH_HASH 未填写，或没有把 \$ 写成 \$\$。"
  echo "生成： docker run --rm caddy:2-alpine caddy hash-password --plaintext '你的密码'"
  exit 1
fi

if grep -qE '^(DOMAIN|PANSOU_DOMAIN)=.*example\.com' deploy/.env; then
  echo "deploy/.env 里还是 example.com 占位域名，请改成你自己的域名。"
  exit 1
fi

if [ ! -f deploy/pansou-linux ]; then
  echo "缺少 deploy/pansou-linux，请先在本地执行 deploy.ps1 完成交叉编译。"
  exit 1
fi

mkdir -p data

docker compose --env-file deploy/.env up -d --build
docker compose --env-file deploy/.env ps
echo
echo "看日志： docker compose --env-file deploy/.env logs -f"
echo "验证：   curl -I https://\$你的前台域名（应 401）"
