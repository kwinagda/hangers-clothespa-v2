UPDATE settings
SET
  value = jsonb_set(
    jsonb_set(
      value::jsonb,
      '{allowedForward,SCHEDULED}',
      '["ASSIGNED","CANCELLED"]'::jsonb,
      true
    ),
    '{actions,SCHEDULED}',
    '[{"action":"ASSIGNED","label":"Assign Staff","tone":"primary"},{"action":"CANCELLED","label":"Cancel","tone":"danger"}]'::jsonb,
    true
  )::text,
  "updatedBy" = 'field-service-assignment-workflow',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE key = 'master.fieldServiceWorkflow';
