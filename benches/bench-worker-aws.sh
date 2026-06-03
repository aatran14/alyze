#!/usr/bin/env bash
set -euo pipefail

INSTANCE_TYPE="${1:?Usage: bench-worker-aws.sh <instance-type>}"
REGION="us-east-2"
KEY_FILE="${AWS_KEY_FILE:-$HOME/.ssh/alyze-bench.pem}"
KEY_NAME="alyze-bench"
SG_NAME="alyze-bench-ssh"
REPO_DIR="${REPO_DIR:-.}"
CSV="$REPO_DIR/data/results.csv"
NAME="alyze-${INSTANCE_TYPE//\./-}"

FAMILY="${INSTANCE_TYPE%%.*}"
if [[ "$FAMILY" == *g && "$FAMILY" != *gn ]]; then
  ARCH="arm64"
else
  ARCH="amd64"
fi

AMI_ID=$(aws ec2 describe-images --region "$REGION" \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-${ARCH}-server-*" \
            "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' --output text)

SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --group-names "$SG_NAME" --query 'SecurityGroups[0].GroupId' --output text)

cleanup() {
  if [ -n "${INSTANCE_ID:-}" ]; then
    aws ec2 terminate-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

INSTANCE_ID=$(aws ec2 run-instances --region "$REGION" \
  --instance-type "$INSTANCE_TYPE" \
  --image-id "$AMI_ID" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=50,VolumeType=gp3}' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
  --query 'Instances[0].InstanceId' --output text)

aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(aws ec2 describe-instances --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

SSH="ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ubuntu@$PUBLIC_IP"
SCP="scp -i $KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

for i in $(seq 1 30); do
  $SSH "echo ready" 2>/dev/null && break
  sleep 5
done

tar czf /tmp/${NAME}.tar.gz -C "$REPO_DIR" --exclude=target --exclude=data --exclude=.git .
$SCP /tmp/${NAME}.tar.gz "ubuntu@$PUBLIC_IP:~/alyze.tar.gz"
$SSH "mkdir -p alyze && tar -C alyze -xzf alyze.tar.gz"
rm -f /tmp/${NAME}.tar.gz

$SSH "
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
' MACHINE="aws-$INSTANCE_TYPE" TS="${TIMESTAMP:-}" COMMIT="${COMMIT:-}" >> "$CSV"
