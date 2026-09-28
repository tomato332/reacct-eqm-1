#!/bin/bash
# eqm 배포 스크립트: 로컬 빌드 → 업로드 + 의존성 동기화 → 교체/재시작 → 검증
# package.json/pnpm-lock.yaml을 매번 서버로 옮긴 뒤 pnpm install 하므로
# 의존성을 추가/변경해도 별도 작업 없이 ./deploy.sh 한 번으로 배포된다.
set -euo pipefail

HOST="129.225.201.148"
USER="ubuntu"
KEY="$HOME/Documents/111.key"
REMOTE_DIR="/home/ubuntu/eqm"
SSH_OPTS=(-i "$KEY" -o ConnectTimeout=15)

cd "$(dirname "$0")"

[ -f "$KEY" ] || { echo "❌ SSH 키 없음: $KEY"; exit 1; }

echo "==> 1/4 로컬 빌드"
# 타입 에러가 있으면 배포 중단 (esbuild는 타입 에러를 무시하므로 반드시 tsc를 먼저 돌린다)
pnpm lint
pnpm run build
[ -f dist/server.cjs ] || { echo "❌ 빌드 실패: dist/server.cjs 없음"; exit 1; }

echo "==> 2/4 업로드 (dist.new + 의존성 파일)"
ssh "${SSH_OPTS[@]}" "$USER@$HOST" "rm -rf $REMOTE_DIR/dist.new"
scp "${SSH_OPTS[@]}" -r dist "$USER@$HOST:$REMOTE_DIR/dist.new" >/dev/null
scp "${SSH_OPTS[@]}" package.json pnpm-lock.yaml "$USER@$HOST:$REMOTE_DIR/" >/dev/null

echo "==> 3/4 의존성 설치 + 교체 + 서비스 재시작"
ssh "${SSH_OPTS[@]}" "$USER@$HOST" "export NVM_DIR=\"\$HOME/.nvm\"; [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"; cd $REMOTE_DIR && pnpm install && \
  rm -rf dist.old && \
  if [ -d dist ]; then mv dist dist.old; fi && \
  mv dist.new dist && \
  sudo -n systemctl restart eqm" \
  || { echo "❌ 설치/교체/재시작 실패 — 서버에서 'sudo -n true'와 pnpm install 상태 확인"; exit 1; }

echo "==> 4/4 검증"
sleep 4
if ! ssh "${SSH_OPTS[@]}" "$USER@$HOST" "systemctl is-active eqm" | grep -qx "active"; then
  echo "❌ 서비스 비활성! 롤백 명령:"
  echo "   ssh -i $KEY $USER@$HOST 'cd $REMOTE_DIR && rm -rf dist && mv dist.old dist && sudo systemctl restart eqm'"
  exit 1
fi
ssh "${SSH_OPTS[@]}" "$USER@$HOST" "sudo -n journalctl -u eqm -n 5 --no-pager | grep -vE '^--'
curl -sk https://127.0.0.1/api/intensity/latest | head -c 120; echo" \
  || echo "⚠️ API 응답 확인 필요 — journalctl -u eqm 으로 로그 보기"

echo "✅ 배포 완료 (이전 버전은 서버의 $REMOTE_DIR/dist.old 에 보관됨)"
