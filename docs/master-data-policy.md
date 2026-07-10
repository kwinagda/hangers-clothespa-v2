# Master Data Policy

Runtime business data must be database-backed.

Do not hardcode production behavior for:
- order statuses, workflow transitions, workflow views, and action targets
- payment methods and report types
- plant/vendor lists and vendor rates
- role permission bindings and service access defaults
- pricing, discounts, adjustments, and accounting rules

Allowed code constants:
- database enum identifiers required by Prisma
- bootstrap defaults used only to create missing database settings
- UI-only presentation details such as spacing, icons, and colors

Runtime code should read master data from:
- `settings` rows via `masterData.service`
- domain tables such as `Service`, `VendorPriceList`, `PermissionCatalog`, and `StaffRolePermission`

If a new configurable workflow/rate/report/permission value is needed, add it to the database-backed source first, then consume it through an API or service. Do not add fallback business values in frontend pages or controllers.
