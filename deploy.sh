#!/bin/bash
# eqm 배포 스크립트: 로컬 빌드 → dist 전체 업로드 → 서비스 재시작
set -euo pipefail

HOST="129.225.201.148"
USER="ubuntu"
KEY="$HOME/Documents/111.key"
REMOTE_DIR="/home/ubuntu/eqm"
SSH_OPTS=(-i "$KEY" -o ConnectTimeout=15)

cd "$(dirname "$0")"

[ -f "$KEY" ] || { echo "❌ SSH 키 없음: $KEY"; exit 1; }

echo "==> 1/3 로컬 빌드"
pnpm run build
[ -d dist ] || { echo "❌ 빌드 실패: dist 없음"; exit 1; }

echo "==> 2/3 dist 업로드"
ssh "${SSH_OPTS[@]}" "$USER@$HOST" "rm -rf $REMOTE_DIR/dist.new"
scp "${SSH_OPTS[@]}" -r dist "$USER@$HOST:$REMOTE_DIR/dist.new" >/dev/null

echo "==> 3/3 교체 + 서비스 재시작"
ssh "${SSH_OPTS[@]}" "$USER@$HOST" "cd $REMOTE_DIR && \
  rm -rf dist.old && \
  if [ -d dist ]; then mv dist dist.old; fi && \
  mv dist.new dist && \
  sudo -n systemctl restart eqm" \
  || { echo "❌ 교체/재시작 실패 — 서버에서 'sudo -n true' 확인"; exit 1; }

echo "✅ 배포 완료"
