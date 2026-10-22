#!/usr/bin/env bash
# Build the root Dockerfile with the same SOURCE_* build-args as CI
# (.github/workflows/deploy-railway.yml). Runtime (Railway, Fly, GCP, AWS)
# only needs the finished image — it does not supply this metadata.
#
# Usage:
#   ./docker-build.sh                      # docker build -t kernel:local
#   ./docker-build.sh myimage:tag
#   ./docker-build.sh --compose up --build # export args + docker compose …
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

SOURCE_REF="$(git branch --show-current 2>/dev/null || true)"
if [[ -z "${SOURCE_REF}" || "${SOURCE_REF}" == "HEAD" ]]; then
  SOURCE_REF="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
fi
SOURCE_COMMIT="$(git rev-parse HEAD)"
SOURCE_COMMIT_DATE="$(git log -1 --format=%cI)"
if BASE64_MSG="$(git log -1 --format=%B | base64 -w0 2>/dev/null)"; then
  SOURCE_COMMIT_MESSAGE_B64="${BASE64_MSG}"
else
  SOURCE_COMMIT_MESSAGE_B64="$(git log -1 --format=%B | base64 | tr -d '\n')"
fi
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TAG_TS="$(date -u +%Y%m%d-%H%M%S)"
SAFE_REF="$(echo "${SOURCE_REF}" | tr '[:upper:]' '[:lower:]' | sed 's#[^a-z0-9._-]#-#g')"
IMAGE_TAG="${SAFE_REF}-${TAG_TS}"
CACHEBUST="${SOURCE_COMMIT}"

export SOURCE_REF SOURCE_COMMIT SOURCE_COMMIT_DATE SOURCE_COMMIT_MESSAGE_B64
export BUILD_TIME IMAGE_TAG CACHEBUST

BUILD_ARGS=(
  --build-arg "SOURCE_REF=${SOURCE_REF}"
  --build-arg "SOURCE_COMMIT=${SOURCE_COMMIT}"
  --build-arg "SOURCE_COMMIT_MESSAGE_B64=${SOURCE_COMMIT_MESSAGE_B64}"
  --build-arg "SOURCE_COMMIT_DATE=${SOURCE_COMMIT_DATE}"
  --build-arg "BUILD_TIME=${BUILD_TIME}"
  --build-arg "IMAGE_TAG=${IMAGE_TAG}"
  --build-arg "CACHEBUST=${CACHEBUST}"
)

if [[ "${1:-}" == "--compose" ]]; then
  shift
  exec docker compose "$@"
fi

IMAGE_NAME="${1:-kernel:local}"
exec docker build "${BUILD_ARGS[@]}" -t "${IMAGE_NAME}" .
