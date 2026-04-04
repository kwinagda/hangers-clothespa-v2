# Master Data Audit

Date: 2026-04-04

Scope reviewed:
- `hangers-crm`
- `hangers-app`
- `hangers-staff-app`
- `hangers-backend`

## Current State

The repo is not fully CRM-mastered yet. Multiple frontend and backend surfaces still define business master data locally in code instead of loading it from a central API.

## Highest Priority Findings

### Customer App

- Hardcoded home service tiles and labels:
  - [hangers-app/src/screens/HomeScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/HomeScreen.tsx)
- Hardcoded promotional banner data and offer copy:
  - [hangers-app/src/screens/HomeScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/HomeScreen.tsx)
- Hardcoded order status labels and icon maps:
  - [hangers-app/src/screens/HomeScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/HomeScreen.tsx)
  - [hangers-app/src/screens/MyOrdersScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/MyOrdersScreen.tsx)
  - [hangers-app/src/screens/OrderTrackingScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/OrderTrackingScreen.tsx)
- Hardcoded address labels:
  - [hangers-app/src/screens/SavedAddressesScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/SavedAddressesScreen.tsx)
- Hardcoded payment/status display maps:
  - [hangers-app/src/screens/PaymentHistoryScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/PaymentHistoryScreen.tsx)
  - [hangers-app/src/screens/WalletScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/WalletScreen.tsx)
- Hardcoded profile languages and menu structure:
  - [hangers-app/src/screens/ProfileScreen.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-app/src/screens/ProfileScreen.tsx)

### CRM

- Hardcoded order statuses, plant statuses, editable statuses:
  - [hangers-crm/src/app/dashboard/orders/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/orders/page.tsx)
- Hardcoded staff roles, role colors, role labels, PIN-eligible roles:
  - [hangers-crm/src/app/dashboard/staff/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/staff/page.tsx)
- Hardcoded marketing triggers and audiences:
  - [hangers-crm/src/app/dashboard/marketing/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/marketing/page.tsx)
- Hardcoded report types:
  - [hangers-crm/src/app/dashboard/reports/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/reports/page.tsx)
- Hardcoded return reasons:
  - [hangers-crm/src/app/dashboard/orders/return/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/orders/return/page.tsx)
- Hardcoded payment methods, customer tags, Daily Iron status maps, address defaults:
  - [hangers-crm/src/app/dashboard/customers/[id]/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/customers/[id]/page.tsx)
  - [hangers-crm/src/app/dashboard/orders/new/page.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-crm/src/app/dashboard/orders/new/page.tsx)

### Staff App

- Hardcoded plant status filters, colors, labels:
  - [hangers-staff-app/src/screens/plant/PlantOrdersList.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-staff-app/src/screens/plant/PlantOrdersList.tsx)
- Hardcoded plant dashboard stage cards:
  - [hangers-staff-app/src/screens/plant/PlantDashboard.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-staff-app/src/screens/plant/PlantDashboard.tsx)
- Hardcoded plant order detail stages and issue types:
  - [hangers-staff-app/src/screens/plant/PlantOrderDetail.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-staff-app/src/screens/plant/PlantOrderDetail.tsx)
- Hardcoded delivery dashboard status mapping:
  - [hangers-staff-app/src/screens/delivery/DeliveryDashboard.tsx](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-staff-app/src/screens/delivery/DeliveryDashboard.tsx)

### Backend

- Entire service catalog still seeded in code:
  - [hangers-backend/prisma/seed.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/prisma/seed.js)
- Hardcoded delivery status labels and failure reasons:
  - [hangers-backend/src/controllers/delivery.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/delivery.controller.js)
- Hardcoded plant statuses, labels, issue types:
  - [hangers-backend/src/controllers/plant.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/plant.controller.js)
- Hardcoded RBAC role-permission map:
  - [hangers-backend/src/middleware/rbac.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/middleware/rbac.js)
- Hardcoded language lists and message/template maps:
  - [hangers-backend/src/controllers/auth.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/auth.controller.js)
  - [hangers-backend/src/services/whatsapp-notifications.service.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/services/whatsapp-notifications.service.js)
  - [hangers-backend/src/controllers/iron.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/iron.controller.js)
- Hardcoded default address label:
  - [hangers-backend/src/controllers/addresses.controller.js](/Users/kevin/Documents/Hangers%20App%20Daily%20Iron/hangers-backend/src/controllers/addresses.controller.js)

## Remediation Strategy

### Phase 1

Create a centralized metadata API in backend and migrate first-order consumers:
- order statuses
- staff roles
- marketing triggers
- marketing audiences
- payment methods
- address labels
- customer tags
- languages

### Phase 2

Move all list-like master data in frontend screens to metadata calls:
- CRM orders/staff/marketing/customers/new-order
- customer app home/profile/saved-addresses/orders/tracking
- staff app plant/delivery screens

### Phase 3

Move backend business-rule constants into metadata/settings tables where operationally appropriate, while keeping code-level enums only where required for correctness.

## Changes Started In This Pass

This pass begins centralizing metadata with a backend metadata API and migrates the highest-impact consumers first.
