#!/usr/bin/env bash
# Run this AFTER generating new live keys in the Razorpay dashboard. It updates the two
# AWS Secrets Manager secrets that scripts/deploy/load-live-razorpay-secrets.js reads on
# every deploy/restart - rotating in the Razorpay dashboard alone does NOT remove the old
# key from the running server; this is the other half of that rotation.
#
# Prompts interactively (not as command-line arguments) so the new secret values never
# land in your shell history or appear in `ps`.
set -Eeuo pipefail

REGION="${AWS_REGION:-ap-south-1}"
API_SECRET_ID="hangers/production/razorpay/live-api"
WEBHOOK_SECRET_ID="hangers/production/razorpay/live-webhook"
INSTANCE_ID="i-05c749925b8391b99"

command -v aws >/dev/null 2>&1 || { echo "AWS CLI is required." >&2; exit 1; }

read -rp "New live Key ID (starts with rzp_live_): " key_id
read -rsp "New live Key Secret: " key_secret; echo
read -rsp "New live Webhook Secret: " webhook_secret; echo

if [[ ! "$key_id" =~ ^rzp_live_ ]]; then
  echo "That doesn't look like a live key ID (expected rzp_live_...). Aborting." >&2
  exit 1
fi
if [[ -z "$key_secret" || -z "$webhook_secret" ]]; then
  echo "Key secret and webhook secret cannot be empty. Aborting." >&2
  exit 1
fi

api_json="$(printf '{"key_id":"%s","key_secret":"%s"}' "$key_id" "$key_secret")"

echo "Updating $API_SECRET_ID..."
aws secretsmanager put-secret-value --region "$REGION" --secret-id "$API_SECRET_ID" \
  --secret-string "$api_json" >/dev/null

echo "Updating $WEBHOOK_SECRET_ID..."
aws secretsmanager put-secret-value --region "$REGION" --secret-id "$WEBHOOK_SECRET_ID" \
  --secret-string "$webhook_secret" >/dev/null

unset key_secret webhook_secret api_json

echo "Secrets updated. Reloading them into the live backend/worker processes via SSM..."
command_id="$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters commands='["sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 AWS_REGION='"$REGION"' node /opt/hangers/scripts/deploy/load-live-razorpay-secrets.js"]' \
  --query 'Command.CommandId' --output text)"

for _ in $(seq 1 15); do
  sleep 2
  status="$(aws ssm get-command-invocation --region "$REGION" --command-id "$command_id" \
    --instance-id "$INSTANCE_ID" --query Status --output text 2>/dev/null || true)"
  case "$status" in Success|Failed|Cancelled|TimedOut) break ;; esac
done

if [[ "${status:-}" == "Success" ]]; then
  echo "Done. The live backend and worker are now running on the new credentials."
  echo "Verify in the Razorpay dashboard that the old key is revoked/disabled."
else
  echo "Reload did not report success (status: ${status:-unknown}). Check manually:" >&2
  aws ssm get-command-invocation --region "$REGION" --command-id "$command_id" \
    --instance-id "$INSTANCE_ID" --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}'
  exit 1
fi
