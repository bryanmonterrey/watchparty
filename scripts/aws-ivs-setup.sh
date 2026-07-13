#!/usr/bin/env bash
# One-shot: finishes AWS IVS setup in account 657727739058 (profile `lila`).
#  1. IAM user `watchparty-server` (scoped: ivs, ivschat, recordings bucket) + access key,
#     written into .env / .env.local / .env.production
#  2. EventBridge rule -> API destination -> https://watchparty.xyz/api/webhooks/ivs
#     (auth header x-ivs-signature = IVS_WEBHOOK_SECRET from .env)
#  3. Verifies the new key can list IVS channels
# Bucket + recording configuration + env scaffolding were already provisioned.
# If it fails partway, rerunning is safe-ish (a duplicate-resource error on a later
# step just means that step was already done) — or ask Claude to finish the rest.
set -euo pipefail

PROFILE=lila
REGION=us-east-1
ACCOUNT=657727739058
BUCKET=watchparty-ivs-recordings-$ACCOUNT
WEBHOOK_URL=https://watchparty.xyz/api/webhooks/ivs
cd "$(dirname "$0")/.."

echo "== 1/3 IAM user + access key =="
POLICY=$(mktemp)
cat > "$POLICY" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "Ivs", "Effect": "Allow", "Action": ["ivs:*"], "Resource": "*" },
    { "Sid": "IvsChat", "Effect": "Allow", "Action": ["ivschat:*"], "Resource": "*" },
    { "Sid": "Recordings", "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": ["arn:aws:s3:::$BUCKET", "arn:aws:s3:::$BUCKET/*"] },
    { "Sid": "IvsServiceLinkedRole", "Effect": "Allow",
      "Action": "iam:CreateServiceLinkedRole", "Resource": "*",
      "Condition": { "StringLike": { "iam:AWSServiceName": "*ivs*.amazonaws.com" } } }
  ]
}
EOF
aws iam create-user --user-name watchparty-server --profile $PROFILE >/dev/null 2>&1 || echo "  (user already exists)"
aws iam put-user-policy --user-name watchparty-server --policy-name watchparty-server-ivs \
  --policy-document "file://$POLICY" --profile $PROFILE

KEY_JSON=$(aws iam create-access-key --user-name watchparty-server --profile $PROFILE)
AKID=$(echo "$KEY_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['AccessKey']['AccessKeyId'])")
SK=$(echo "$KEY_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['AccessKey']['SecretAccessKey'])")

python3 - "$AKID" "$SK" <<'PY'
import sys, pathlib, re
akid, sk = sys.argv[1], sys.argv[2]
for f in [".env", ".env.local", ".env.production"]:
    p = pathlib.Path(f)
    t = p.read_text()
    t = re.sub(r"(?m)^AWS_ACCESS_KEY_ID=.*$", f"AWS_ACCESS_KEY_ID={akid}", t)
    t = re.sub(r"(?m)^AWS_SECRET_ACCESS_KEY=.*$", f"AWS_SECRET_ACCESS_KEY={sk}", t)
    p.write_text(t)
print("  key written to .env / .env.local / .env.production")
PY

echo "== 2/3 EventBridge -> $WEBHOOK_URL =="
WEBHOOK_SECRET=$(grep '^IVS_WEBHOOK_SECRET=' .env | cut -d= -f2 | tr -d '[:space:]')
[ -n "$WEBHOOK_SECRET" ] || { echo "IVS_WEBHOOK_SECRET missing from .env"; exit 1; }

CONN_ARN=$(aws events create-connection --name watchparty-ivs-webhook \
  --authorization-type API_KEY \
  --auth-parameters "ApiKeyAuthParameters={ApiKeyName=x-ivs-signature,ApiKeyValue=$WEBHOOK_SECRET}" \
  --region $REGION --profile $PROFILE --query ConnectionArn --output text)
DEST_ARN=$(aws events create-api-destination --name watchparty-ivs-webhook \
  --connection-arn "$CONN_ARN" --invocation-endpoint "$WEBHOOK_URL" \
  --http-method POST --invocation-rate-limit-per-second 50 \
  --region $REGION --profile $PROFILE --query ApiDestinationArn --output text)

TRUST=$(mktemp)
echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"events.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > "$TRUST"
ROLE_ARN=$(aws iam create-role --role-name watchparty-eventbridge-ivs \
  --assume-role-policy-document "file://$TRUST" --profile $PROFILE --query Role.Arn --output text)
aws iam put-role-policy --role-name watchparty-eventbridge-ivs --policy-name invoke-api-destination \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"events:InvokeApiDestination\",\"Resource\":\"$DEST_ARN\"}]}" \
  --profile $PROFILE

aws events put-rule --name watchparty-ivs-stream-state \
  --event-pattern '{"source":["aws.ivs"],"detail-type":["IVS Stream State Change"]}' \
  --region $REGION --profile $PROFILE >/dev/null
echo "  waiting 10s for IAM role to propagate..."
sleep 10
aws events put-targets --rule watchparty-ivs-stream-state \
  --targets "Id=watchparty-webhook,Arn=$DEST_ARN,RoleArn=$ROLE_ARN" \
  --region $REGION --profile $PROFILE >/dev/null
echo "  rule -> api destination wired"

echo "== 3/3 verify new key =="
echo "  waiting 10s for access key to propagate..."
sleep 10
AWS_ACCESS_KEY_ID=$AKID AWS_SECRET_ACCESS_KEY=$SK AWS_SESSION_TOKEN= \
  aws ivs list-channels --region $REGION --query 'channels' --output text >/dev/null \
  && echo "  scoped key works against IVS"

echo
echo "ALL DONE. The app now uses IAM user watchparty-server."
echo "You can deactivate today's ROOT access key in the console (account menu ->"
echo "Security credentials -> Access keys) — note that also kills the CLI 'lila'"
echo "profile, which is fine for day-to-day; keep it if you want Claude to run"
echo "more account admin later."
