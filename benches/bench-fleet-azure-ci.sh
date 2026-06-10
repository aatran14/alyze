#!/usr/bin/env bash
set -euo pipefail

ALL_MACHINES=(
  Standard_D8ads_v6
  Standard_D8ds_v6
  Standard_D8pds_v6
)

MACHINES=("${@:-${ALL_MACHINES[@]}}")
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER="$SCRIPT_DIR/bench-worker-azure.sh"
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
  REPO_DIR="$REPO_DIR" TIMESTAMP="$TIMESTAMP" COMMIT="$COMMIT" \
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
