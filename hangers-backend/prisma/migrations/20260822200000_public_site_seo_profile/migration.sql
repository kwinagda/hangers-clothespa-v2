UPDATE "settings"
SET "value" = jsonb_set(
  "value"::jsonb,
  '{seo}',
  '{"siteUrl":"https://hangers-cs.com","address":{"streetAddress":"Shop No. 8A, Roop Pooja Building, Jain Mandir Marg, opposite Shivas Salon, Gavani Pada, Sarvodaya Nagar, Mulund West","addressLocality":"Mumbai","addressRegion":"Maharashtra","postalCode":"400080","addressCountry":"IN"},"openingHoursSpecification":[{"dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],"opens":"09:00","closes":"13:30"},{"dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],"opens":"15:30","closes":"21:00"}]}',
  true
)::text,
"updatedAt" = NOW(),
"updatedBy" = 'migration-20260822200000'
WHERE "key" = 'public_site_profile';
