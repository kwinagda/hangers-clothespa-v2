#!/usr/bin/env bash
# Rebuilds the public marketing site snapshot and syncs it to S3, with every
# opengraph-image file force-set to the correct image/png content-type.
#
# `aws s3 sync` guesses content-type from a file's extension. Every OG image
# route (/opengraph-image, /about/opengraph-image, ...) is, by Next.js
# convention, a URL with NO extension - so plain `aws s3 sync` always uploads
# them as application/octet-stream, and social crawlers (WhatsApp included)
# silently refuse to render them as images. Re-running sync without this
# script re-breaks it every time, which is exactly what kept happening.
#
# Usage: PUBLIC_SITE_ORIGIN=https://crm.hangers-cs.com ./scripts/sync-public-site.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PUBLIC_SITE_ORIGIN:?Set PUBLIC_SITE_ORIGIN, e.g. https://crm.hangers-cs.com}"
BUCKET="${PUBLIC_SITE_BUCKET:-hangers-cs-website-977714654070-ap-south-1-v2}"
DISTRIBUTION_ID="${PUBLIC_SITE_DISTRIBUTION_ID:-E16CBIW8FJWI3B}"

echo "==> Building static snapshot from $PUBLIC_SITE_ORIGIN"
node scripts/build-public-static.mjs

echo "==> Syncing dist-public/ to s3://$BUCKET (excluding _next/static/* - that's EC2's own sync)"
aws s3 sync dist-public/ "s3://$BUCKET/" --delete --exclude "_next/static/*"

echo "==> Force-setting image/png content-type on every opengraph-image file"
find dist-public -type f -name "opengraph-image" | while read -r file; do
  key="${file#dist-public/}"
  aws s3 cp "s3://$BUCKET/$key" "s3://$BUCKET/$key" \
    --content-type "image/png" --cache-control "public, max-age=3600" --metadata-directive REPLACE
done

echo "==> Invalidating CloudFront cache"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" --query 'Invalidation.Id' --output text

echo "==> Done. The guarded EC2 deploy publishes .next/static before restarting CRM."
echo "    Old hashed chunks are intentionally retained for already-open browser tabs."
