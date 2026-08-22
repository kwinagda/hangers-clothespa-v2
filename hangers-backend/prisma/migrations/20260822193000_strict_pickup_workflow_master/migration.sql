INSERT INTO "settings" ("id", "key", "value", "updatedAt", "updatedBy")
VALUES (
  'master-website-pickup-request-statuses',
  'master.websitePickupRequestStatuses',
  '[{"value":"NEW","label":"New","color":"#023c62","bg":"#e8f0f7","allowedTransitions":["CONTACTED","CONFIRMED","CANCELLED"],"canCreateOrder":false,"initial":true},{"value":"CONTACTED","label":"Contacted","actionLabel":"Log contact","requiresContactMethod":true,"color":"#7a5300","bg":"#fff7d6","allowedTransitions":["CONFIRMED","CANCELLED"],"canCreateOrder":false},{"value":"CONFIRMED","label":"Confirmed","actionLabel":"Confirm pickup","requiresSchedule":true,"color":"#166534","bg":"#dcfce7","allowedTransitions":["CANCELLED"],"canCreateOrder":true},{"value":"ORDER_STARTED","label":"Order started","color":"#075985","bg":"#e0f2fe","allowedTransitions":["CANCELLED"],"canCreateOrder":true,"orderStartTarget":true},{"value":"CONVERTED","label":"Order created","color":"#1d4ed8","bg":"#dbeafe","allowedTransitions":[],"canCreateOrder":false,"conversionTarget":true,"terminal":true},{"value":"CANCELLED","label":"Cancelled","color":"#991b1b","bg":"#fee2e2","allowedTransitions":[],"canCreateOrder":false,"terminal":true}]',
  NOW(),
  'migration-20260822193000'
)
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value", "updatedAt" = NOW(), "updatedBy" = EXCLUDED."updatedBy";

INSERT INTO "settings" ("id", "key", "value", "updatedAt", "updatedBy")
VALUES (
  'master-website-pickup-contact-methods',
  'master.websitePickupContactMethods',
  '[{"value":"CALL","label":"Phone call"},{"value":"WHATSAPP","label":"WhatsApp"},{"value":"IN_PERSON","label":"In person"}]',
  NOW(),
  'migration-20260822193000'
)
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value", "updatedAt" = NOW(), "updatedBy" = EXCLUDED."updatedBy";
