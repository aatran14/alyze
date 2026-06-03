#!/usr/bin/env bash
set -euo pipefail

ALL_MACHINES=(
  c4-standard-8-lssd
  c4d-standard-8-lssd
  c4a-standard-8-lssd
)

MACHINES=("${@:-${ALL_MACHINES[@]}}")
ZONE="${NAPKIN_GCP_ZONE:-us-east1-b}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER="$SCRIPT_DIR/bench-worker.sh"
CSV="$REPO_DIR/data/results.csv"

mkdir -p "$REPO_DIR/data"
COMMIT="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[[ -f "$CSV" ]] || echo "benchmark,machine,throughput_mibs,timestamp,commit" > "$CSV"

PIDS=()
LOGS=()

for machine in "${MACHINES[@]}"; do
  LOG="/tmp/bench-${machine}.log"
  LOGS+=("$LOG")
  ZONE="$ZONE" REPO_DIR="$REPO_DIR" TIMESTAMP="$TIMESTAMP" COMMIT="$COMMIT" \
    "$WORKER" "$machine" > "$LOG" 2>&1 &
  PIDS+=($!)
  echo "Started $machine (pid $!)"
done

FAILED=0
for i in "${!PIDS[@]}"; do
  pid="${PIDS[$i]}"
  machine="${MACHINES[$i]}"
  log="${LOGS[$i]}"
  if wait "$pid"; then
    echo "OK: $machine"
  else
    echo "FAIL: $machine (see $log)"
    cat "$log" >&2
    FAILED=1
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  echo "Some benchmarks failed"
  exit 1
fi

echo "All benchmarks complete"
