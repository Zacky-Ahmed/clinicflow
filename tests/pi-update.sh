#!/usr/bin/env bash
set -euo pipefail
source_script=$(cd "$(dirname "$0")/.." && pwd)/scripts/pi-update.sh
sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
mkdir "$sandbox/bin" "$sandbox/app"
export CLINICFLOW_DIR="$sandbox/app" CALL_LOG="$sandbox/calls"
export PATH="$sandbox/bin:$PATH"
export TEST_IMAGE=ghcr.io/zacky-ahmed/clinicflow@sha256:123456
cat > "$sandbox/bin/docker" <<'MOCK'
#!/usr/bin/env bash
echo "$*" >> "$CALL_LOG"
if [[ "$1 $2" == 'image inspect' ]]; then echo "$TEST_IMAGE"; fi
if [[ "$1" == compose && "$*" == *'up -d'* && "${FAIL_NEW:-0}" == 1 ]] && grep -q "$TEST_IMAGE" "$CLINICFLOW_DIR/.release.env"; then exit 1; fi
exit 0
MOCK
cat > "$sandbox/bin/curl" <<'MOCK'
#!/usr/bin/env bash
exit "${FAIL_JOBWIRE:-0}"
MOCK
chmod +x "$sandbox/bin/"*
printf 'CLINICFLOW_IMAGE=clinicflow:previous\n' > "$CLINICFLOW_DIR/.release.env"
bash "$source_script"
grep -qx "CLINICFLOW_IMAGE=$TEST_IMAGE" "$CLINICFLOW_DIR/.release.env"
grep -qx 'clinicflow:previous' "$CLINICFLOW_DIR/.previous-image"
: > "$CALL_LOG"
bash "$source_script"
! grep -q compose "$CALL_LOG"
# Failed update restores the previous image and suppresses repeated attempts.
printf 'CLINICFLOW_IMAGE=clinicflow:previous\n' > "$CLINICFLOW_DIR/.release.env"
if FAIL_NEW=1 bash "$source_script"; then exit 1; fi
grep -qx 'CLINICFLOW_IMAGE=clinicflow:previous' "$CLINICFLOW_DIR/.release.env"
grep -qx "$TEST_IMAGE" "$CLINICFLOW_DIR/.failed-image"
: > "$CALL_LOG"
bash "$source_script"
! grep -q compose "$CALL_LOG"
rm "$CLINICFLOW_DIR/.failed-image"
# An unhealthy JobWire prevents any container replacement.
if FAIL_JOBWIRE=1 bash "$source_script"; then exit 1; fi
grep -qx 'CLINICFLOW_IMAGE=clinicflow:previous' "$CLINICFLOW_DIR/.release.env"
# Initial failure stops only this service and clears the candidate pin.
rm "$CLINICFLOW_DIR/.release.env"
if FAIL_NEW=1 bash "$source_script"; then exit 1; fi
test ! -s "$CLINICFLOW_DIR/.release.env"
grep -q 'stop web' "$CALL_LOG"
# Pause performs no Docker operations.
: > "$CALL_LOG"
touch "$CLINICFLOW_DIR/.deploy-paused"
bash "$source_script"
test ! -s "$CALL_LOG"
echo 'Pi updater tests passed: activation, unchanged release, rollback, failure suppression, JobWire guard, initial failure, pause.'
