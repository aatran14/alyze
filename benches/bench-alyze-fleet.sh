#!/usr/bin/env bash
set -euo pipefail

ALL_MACHINES=(
  c4-standard-8-lssd
  c4d-standard-8-lssd
  c4a-standard-8-lssd
  c4-standard-16-lssd
  c4d-standard-16-lssd
  c4a-standard-16-lssd
)

MACHINES=("${@:-${ALL_MACHINES[@]}}")
ZONE="${NAPKIN_GCP_ZONE:-us-east1-b}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="alyze-fleet"
WORKER="$REPO_DIR/benches/bench-worker.sh"
CSV="$REPO_DIR/data/results.csv"

mkdir -p "$REPO_DIR/data"
COMMIT="$(git -C "$REPO_DIR" ls-remote https://github.com/turbopuffer/alyze.git trunk | cut -c1-7)"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[[ -f "$CSV" ]] || echo "benchmark,machine,throughput_mibs,timestamp,commit" > "$CSV"

tmux kill-session -t "$SESSION" 2>/dev/null || true

FIRST="${MACHINES[0]}"
tmux new-session -d -s "$SESSION" -n "${FIRST%%-standard*}" \
  "ZONE=$ZONE REPO_DIR=$REPO_DIR TIMESTAMP=$TIMESTAMP COMMIT=$COMMIT $WORKER $FIRST; read"

for machine in "${MACHINES[@]:1}"; do
  tmux split-window -t "$SESSION" \
    "ZONE=$ZONE REPO_DIR=$REPO_DIR TIMESTAMP=$TIMESTAMP COMMIT=$COMMIT $WORKER $machine; read"
  tmux select-layout -t "$SESSION" tiled
done

tmux attach -t "$SESSION"
