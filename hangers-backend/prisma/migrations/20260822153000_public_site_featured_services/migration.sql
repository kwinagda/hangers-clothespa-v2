UPDATE "settings"
SET "value" = jsonb_set(
  "value"::jsonb,
  '{featuredServices}',
  '[{"key":"dry_cleaning","name":"Dry Cleaning","description":"Care for everyday garments and special pieces."},{"key":"ironing","name":"Daily & Normal Ironing","description":"Dependable finishing for everyday wear."},{"key":"curtain_cleaning","name":"Curtain Cleaning","description":"Cleaning with free removal and reinstallation."},{"key":"sofa_cleaning","name":"Sofa Cleaning","description":"Scheduled care for home furnishings."}]'::jsonb
)::text,
"updatedAt" = NOW()
WHERE "key" = 'public_site_profile'
  AND NOT ("value"::jsonb ? 'featuredServices');
