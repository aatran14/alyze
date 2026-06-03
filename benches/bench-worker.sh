#!/usr/bin/env bash
set -euo pipefail

MACHINE_TYPE="$1"
NAME="alyze-${MACHINE_TYPE%%-standard*}"
ZONE="${ZONE:-us-east1-b}"
REPO_DIR="${REPO_DIR:-.}"
CSV="$REPO_DIR/data/results.csv"

if [[ "$MACHINE_TYPE" == *c4a* ]]; then
  IMAGE_FAMILY="ubuntu-2404-lts-arm64"
else
  IMAGE_FAMILY="ubuntu-2404-lts-amd64"
fi

cleanup() { gcloud compute instances delete "$NAME" --zone="$ZONE" --quiet 2>/dev/null || true; }
trap cleanup EXIT

gcloud compute instances create "$NAME" \
  --zone="$ZONE" \
  --machine-type="$MACHINE_TYPE" \
  --image-family="$IMAGE_FAMILY" \
  --image-project=ubuntu-os-cloud

for i in $(seq 1 30); do
  gcloud compute ssh "$NAME" --zone="$ZONE" --command="echo ready" 2>/dev/null && break
  sleep 5
done

tar czf /tmp/${NAME}.tar.gz -C "$REPO_DIR" --exclude=target --exclude=data --exclude=.git .
gcloud compute scp --zone="$ZONE" /tmp/${NAME}.tar.gz "$NAME":~/alyze.tar.gz
gcloud compute ssh "$NAME" --zone="$ZONE" --command="mkdir -p alyze && tar -C alyze -xzf alyze.tar.gz"
rm -f /tmp/${NAME}.tar.gz

gcloud compute ssh "$NAME" --zone="$ZONE" --command="
  sudo apt-get update -qq
  sudo apt-get install -y -qq build-essential pkg-config libssl-dev
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source ~/.cargo/env
  cd alyze
  cargo bench --bench wikipedia 2>&1
" | tee /dev/stderr | awk '
  /^Benchmarking .+: Warming/ {
    sub(/^Benchmarking /, ""); sub(/: Warming.*/, ""); bench=$0
  }
  /thrpt:/ && bench {
    n=split($0, a, " "); count=0
    for (i=1; i<=n; i++) if (a[i] == "MiB/s" && ++count == 2) { median=a[i-1]; break }
    print bench","MACHINE","median","TS","COMMIT
    bench=""
  }
' MACHINE="$MACHINE_TYPE" TS="${TIMESTAMP:-}" COMMIT="${COMMIT:-}" >> "$CSV"
