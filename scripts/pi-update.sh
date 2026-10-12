#!/usr/bin/env bash
# Installed on the Pi; polls only the CI-published main image.
set -euo pipefail
cd "${CLINICFLOW_DIR:-$HOME/clinicflow}"
[[ ! -f .deploy-paused ]] || exit 0
exec 9>.deploy.lock
flock -n 9 || exit 0
umask 077
image=ghcr.io/zacky-ahmed/clinicflow:main
docker pull "$image" >/dev/null
candidate=$(docker image inspect "$image" --format '{{index .RepoDigests 0}}')
[[ "$candidate" == ghcr.io/zacky-ahmed/clinicflow@sha256:* ]] || exit 1
current=$(sed -n 's/^CLINICFLOW_IMAGE=//p' .release.env 2>/dev/null || true)
failed=$(cat .failed-image 2>/dev/null || true)
[[ "$candidate" != "$current" && "$candidate" != "$failed" ]] || exit 0
# Skip a deployment if JobWire is already unhealthy.
curl -fsS --max-time 10 http://127.0.0.1:3000/healthz >/dev/null
printf 'CLINICFLOW_IMAGE=%s\n' "$candidate" > .release.env.next
mv .release.env.next .release.env
if docker compose --env-file .env --env-file .release.env up -d --no-build --wait --wait-timeout 120; then
  printf '%s\n' "$current" > .previous-image
  curl -fsS --max-time 10 http://127.0.0.1:3000/healthz >/dev/null
  printf 'Deployed %s at %s\n' "$candidate" "$(date -Is)"
else
  printf '%s\n' "$candidate" > .failed-image
  if [[ -n "$current" ]]; then
    printf 'CLINICFLOW_IMAGE=%s\n' "$current" > .release.env
    docker compose --env-file .env --env-file .release.env up -d --no-build --wait --wait-timeout 120
    echo 'Unhealthy release rolled back.' >&2
  else
    docker compose --env-file .env --env-file .release.env stop web
    : > .release.env
    echo 'Unhealthy initial release stopped.' >&2
  fi
  exit 1
fi
