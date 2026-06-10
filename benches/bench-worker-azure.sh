#!/usr/bin/env bash
set -euo pipefail

SIZE="${1:?Usage: bench-worker-azure.sh <vm-size>}"
REGION="${AZURE_REGION:-centralus}"
REPO_DIR="${REPO_DIR:-.}"
CSV="$REPO_DIR/data/results.csv"
NAME="alyze-${SIZE//_/-}"
RG="$NAME-rg"

# Ampere/Arm sizes carry a 'p' in their feature letters (e.g. D8ps_v6).
if [[ "$SIZE" =~ ^Standard_[A-Z]+[0-9]+[a-z]*p[a-z]*_ ]]; then
  IMAGE="Canonical:ubuntu-24_04-lts:server-arm64:latest"
else
  IMAGE="Canonical:ubuntu-24_04-lts:server:latest"
fi

cleanup() { az group delete --name "$RG" --yes --no-wait 2>/dev/null || true; }
trap cleanup EXIT

az group create --name "$RG" --location "$REGION" >/dev/null

PUBLIC_IP=$(az vm create \
  --resource-group "$RG" \
  --name "$NAME" \
  --image "$IMAGE" \
  --size "$SIZE" \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --os-disk-size-gb 50 \
  --query publicIpAddress --output tsv)

SSH="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR azureuser@$PUBLIC_IP"
SCP="scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

for i in $(seq 1 30); do
  $SSH "echo ready" 2>/dev/null && break
  sleep 5
done

tar --no-xattrs -czf /tmp/${NAME}.tar.gz -C "$REPO_DIR" --exclude=target --exclude=data --exclude=.git .
$SCP /tmp/${NAME}.tar.gz "azureuser@$PUBLIC_IP:~/alyze.tar.gz"
$SSH "mkdir -p alyze && tar -C alyze -xzf alyze.tar.gz"
rm -f /tmp/${NAME}.tar.gz

$SSH "
  # Provisioning is noisy (apt/rustup). Send it to a log so ONLY the bench
  # output reaches the parser pipe — no broken-pipe spam, reliable CSV capture.
  # The log is surfaced only if setup actually fails.
  {
    sudo apt-get update -qq
    sudo apt-get install -y -qq build-essential pkg-config libssl-dev
    echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor || true
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  } >/tmp/setup.log 2>&1 || { echo '--- SETUP FAILED ---'; cat /tmp/setup.log; exit 1; }
  source ~/.cargo/env
  cd alyze
  # target-cpu=native: build for this VM's own CPU (matches what Apple Silicon does by default).
  # taskset -c 0: pin the single-threaded bench to one core for stable numbers.
  RUSTFLAGS='-C target-cpu=native' taskset -c 0 cargo bench --bench wikipedia 2>&1
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
' MACHINE="azure-$SIZE" TS="${TIMESTAMP:-}" COMMIT="${COMMIT:-}" >> "$CSV"
