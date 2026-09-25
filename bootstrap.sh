#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: missing $1" >&2; exit 1; }; }
need node
need npm
need go

echo "[1/6] WCJC web dependencies"
npm install

echo "[2/6] WCJC web tests"
npm test

echo "[3/6] WCJC web production build"
npm run build

echo "[4/6] WCJC indexer dependencies"
(
  cd services/indexer
  go mod tidy
  go test ./...
  go vet ./...
  go build -o wcjc-indexer .
)

echo "[5/6] Optional local infrastructure"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose -f infra/docker-compose.yml up -d
  echo "Postgres + Kafka started."
else
  echo "Docker not available; skipped Postgres/Kafka launch. Source and compose file are ready."
fi

echo "[6/6] Integrity manifest"
find apps services infra .github -type f -not -path '*/node_modules/*' -not -path '*/.next/*' -print0 \
  | sort -z \
  | xargs -0 sha256sum > MANIFEST.sha256

cat <<REPORT

WCJC BUILD VERIFIED
-------------------
Web:       apps/web
Indexer:   services/indexer/wcjc-indexer
Infra:     Postgres 16 + Apache Kafka 3.7.0
Manifest:  MANIFEST.sha256

Run web:   npm run dev
Run stack: docker compose -f infra/docker-compose.yml up -d
REPORT
