# Hangers CRM — UI/UX Redesign Master Plan

Status: **Mockup phase — nothing in this file has been implemented in `hangers-crm` yet.**
Scope so far: Dashboard, In Process, New Order (3 of the CRM's ~20 screens).
Live mockup: see "Current Artifact" below. Rebuilt several times this session — read the
"Decision Log" before assuming an old artifact link reflects current direction.

This file exists so a future session (human or AI) can pick this up without re-deriving
context, re-making decided calls, or re-introducing mistakes that were already caught and
fixed. Update it whenever a real decision is made or reversed — don't leave it stale.

---

## 1. Why this exists

The CRM's UI/UX was flagged as fundamentally in need of a **rebuild, not a reskin** —
same critique repeated across multiple rounds: changing colors/fonts on the existing
page-per-entity structure doesn't count. The bar is: think through the actual workflow
from first principles, the way a UX lead who has owned this product since day one would,
not the way a generic admin-panel template would.

## 2. Non-negotiable constraints

These came from direct, explicit correction — do not relitigate them without new instruction.

- **Brand colors and logo are preserved.** Navy `#023c62` / `#035a8f` family, the real
  Hangers logo asset, the existing `Inter` / `Space Grotesk` / `Space Mono` font trio from
  `hangers-crm/src/app/globals.css`. Do not invent a new palette. An alternate
  "Maersk-restrained" monochrome direction (Option B) was built and rejected — user could
  not see enough difference from the main direction to justify it; abandoned, not revisited
  unless asked again.
- **No fabricated workflow, statuses, or copy.** Every status, transition, button, and
  label must trace back to real code: `hangers-backend/src/config/master-data.js`
  (`ORDER_STATUSES`, `ORDER_WORKFLOW`), `hangers-crm/src/lib/api.ts`, or an actual component
  in `hangers-crm/src/app/dashboard/**`. A first pass invented a 6-lane Washing/Drying/QC
  board — those three statuses are `crmEditable:false, legacyOnly:true` in the real config
  and must never be shown as CRM-actionable again. See §4 for the verified ground truth.
- **Object model is "Order," not "ticket."** POS terminology in the mockups must match
  `Order` / `orderNumber` / `ordersAPI` from the real codebase. "Ticket" language was
  introduced during a visual exploration phase and explicitly rejected — purged, do not
  reintroduce it as flavor text.
- **No implementation detail exposed as product copy.** UI-facing text should read like a
  real product wrote it for the person using it, not like a dev explaining what they built
  (a "New: this board updates itself... rides sse.service.js" banner was added and then
  explicitly called out as bad — removed). Technical rationale belongs in chat/this doc,
  never baked into the screen.
- **Navigation must be fully visible and self-explanatory to a non-technical new hire.**
  An icon-only rail + ⌘K command-palette-as-primary-nav was tried and rejected on exactly
  this basis — a newbie won't discover a keyboard shortcut. Every real destination must
  be a visible, labeled link. (⌘K survives only as a bonus/secondary accelerator, not the
  primary path to anything.)
- **New Order is its own full page, not an overlay/drawer.** A "pull a ticket from
  anywhere" slide-in drawer concept was designed, built, iterated on (fixed a real z-index
  stacking bug where it fought the topbar), and then explicitly reversed — the drawer felt
  cramped for the real catalog + adjustments + payment flow. Current direction: New Order
  is a normal full-page route with its own two-column layout (catalog left, sticky
  receipt/payment panel right, ~400px), reached via a "New Order" button, left via a
  "← Back to Board" link. Do not reintroduce the drawer without being asked.
- **The pipeline must read as an obvious, ordered sequence a non-technical newbie can
  follow.** Explicit ask: "like stage A to Z... any non-techie newbie can understand."
  Tried literal step numbers (1–8) on every tracker node — **explicitly reverted**: "the
  numbering is not required, earlier one was good without numbering." The connected
  left-to-right line + ordered labels already reads as a sequence; don't re-add numbers
  without being asked again.
- **Polish is expected, not optional**: real pagination (not just "view all" links), real
  entrance motion (page fade-up, staggered tracker reveal), a real loading state (boot
  skeleton that resolves into content, not just a spinner mentioned in passing), themed
  scrollbars that are actually visible against dark surfaces (a bug: the sidebar's
  scrollbar thumb inherited the light-theme color and was nearly invisible against the navy
  rail — fixed with a dedicated dark-surface override).

## 3. Design system tokens actually in use (mockup)

Pulled from the real `globals.css` / `Button.tsx` / dashboard pages — not invented:

| Token | Value | Source |
|---|---|---|
| Primary navy | `#023c62` | `Button.tsx` primary variant, sidebar bg |
| Navy hover | `#035a8f` | existing hover states |
| Page background | `#f4f7fb` | `globals.css body{background}` |
| Borders (blue-tinted) | `#e3edf6` / `#dce8f0` | `globals.css .crm-panel`, `.crm-surface` |
| Text ink | `#1a2332` / `#142033` | `globals.css body{color}` |
| Muted text | `#6b7fa3` / `#9dafc8` | table headers, captions throughout |
| Font — UI | Inter | `globals.css` `--crm-font-ui` |
| Font — display/headings | Space Grotesk | `globals.css` `--crm-font-display` |
| Font — mono (money, order #, timestamps) | Space Mono | `globals.css` `--crm-font-mono` |
| Status colors (all 10 statuses) | exact hex per status | `globals.css .status-PENDING` etc. |
| Payment status tones (PAID/PARTIAL/UNPAID) | green/amber/red | `orders/page.tsx paymentTone()` |

Fonts and the real logo PNG are embedded as base64 in the mockup artifact so it renders
pixel-faithfully without needing the live app running.

## 4. Verified real order workflow (do not deviate from this)

Source: `hangers-backend/src/config/master-data.js`, `ORDER_STATUSES` and `ORDER_WORKFLOW`.

**Live/current statuses** (in workflow order), with the exact display label to use:

1. `PENDING` — "Pending"
2. `PICKED_UP` — **"Received"** (not "Picked Up" — that's the real `label` field now)
3. `PROCESSING` — **"In Process"**
4. `SENT_TO_PLANT` — "Sent to Plant" — `plantManaged:true`, `crmEditable:false`. Fully
   locked from the CRM side. Returns automatically to `IRONING` when the plant marks the
   challan received (`plantReceivedTarget: 'IRONING'`) — there is no manual CRM action for
   what happens while an order is at the plant.
5. `IRONING` — **"Pending Ironing"**
6. `READY_FOR_DELIVERY` — "Ready"
7. `OUT_FOR_DELIVERY` — "Out for Delivery"
8. `DELIVERED` — "Delivered"

Exception/terminal statuses (not part of the main flow line — shown separately):
`CANCELLED`, `RETURNED`.

**Legacy — must never be shown as CRM-actionable stages:** `WASHING`, `DRYING`, `QC`. All
three are `crmEditable:false, legacyOnly:true` in the real config. An earlier mockup pass
invented a 6-lane board including these — that was wrong and was corrected.

**Key workflow rules** (`ORDER_WORKFLOW` object):
- `challanSendableStatuses: ['PICKED_UP', 'PROCESSING']` — this is *why* both "Received"
  and "In Process" legitimately show the same "Send to Plant" action. Not a UI bug. The
  mockup now has an explicit inline note explaining this so it doesn't read as a mistake.
- `directReadyAllowedStatuses: ['PROCESSING', 'IRONING']` → `directReadyTarget:
  'READY_FOR_DELIVERY'` — a "skip ahead" shortcut exists from these two stages straight to
  Ready. Represented in the mockup as a secondary "Mark Ready — skip Ironing" link with a
  reason-required confirmation modal (backward/skip corrections always require a reason
  per `allowedBackward` + correction-authority rules in the real orders controller).
- `crmEditableStatuses`: `PENDING, PICKED_UP, PROCESSING, IRONING, READY_FOR_DELIVERY,
  OUT_FOR_DELIVERY, DELIVERED, CANCELLED` — confirms only these are manually settable from
  the CRM; everything else is system/plant-driven.
- `customerBucket`: `active` vs `completed` — used to decide what belongs in the live
  pipeline tracker (active bucket) vs. a separate "completed today" cluster (Delivered,
  Cancelled, Returned) rather than flattening all 11 statuses into one strip.

**Payment methods** (real canonical values, `orders/new/page.tsx`): `CASH`, `UPI`, `CARD`,
`Pay Later` (plus `RAZORPAY`, `ONLINE`, `COD`, `OTHER`, `WALLET`, `SPLIT` exist in the
broader system but aren't part of the counter-collection UI).

**Service categories** (real `CATEGORY_ORDER`, `orders/new/page.tsx`): Daily Iron, Normal
Ironing, Dry Clean — Men/Women/Kids/House Hold/Accessories, Steam Ironing, Roll Press, Sofa
Cleaning, Shoe Cleaning. All 11 must be present — an early pass dropped a couple, caught
and restored.

## 5. Information architecture decisions

- **Full labeled sidebar restored** (not the icon-only rail that was tried and rejected).
  Groups, matching the real `NAV_SECTIONS` in `dashboard/layout.tsx` for parity ("doesn't
  show all buttons from the existing one" was the direct complaint that caused this
  reversal): Overview (Dashboard, Reports) · Orders (All Orders, In Process, Ready For
  Delivery, Delivered) · Workflow (Quotations, Plant Challans, Recurring Pickups) ·
  Customers & Growth (Customer Directory, Referrals, Promotions, Campaigns) · Daily Iron
  (Iron Logs, Applications) · Finance (Pricing, Finance, Cash Book, Expenses) · Team
  (Staff, Attendance). Only Dashboard/In Process/New Order have designed screens behind
  them right now — the rest are real, correctly-labeled links with no destination screen
  built yet (see §7 gaps).
- **The "Spine" (pipeline tracker) is one shared component**, used identically on
  Dashboard (unfiltered) and In Process (processing stages emphasized, others dimmed) —
  not two independently-designed widgets that happen to look similar. This is the concrete
  proof that Dashboard and In Process are one system, not two reskinned pages.
- **Command palette (⌘K)** is a secondary accelerator only, reachable from the topbar
  search or the keyboard shortcut — never the only way to reach a destination.
- **New Order is a full page**, not a drawer (see §2). Two-column: catalog/customer left,
  sticky receipt + payment panel right (~400px, was 360px in the rejected drawer version —
  widened along with going full-page).

## 6. Screen specs (current mockup state)

### Dashboard
- Topbar: real logo, global search (opens ⌘K palette), "Live" indicator, staff identity.
- Sidebar: full nav, "Dashboard" active.
- Pagehead: date, greeting, primary "New Order" button.
- Spine: unfiltered 8-step tracker + today's order count/collections (no step numbers —
  tried and reverted, see Decision Log).
- Today's Register (delivered/queue/collections) + Needs Action (ready-for-dispatch,
  Daily Iron bills pending, applications pending) — both using real dashboard-controller
  fields, not invented metrics.
- Quick Launch tiles (New Order, Ready For Dispatch, Customer Directory, Review Finance).
- Recent Activity: mixed event feed (status moves, payments, new orders, challans sent),
  restructured so each row has a distinct order/challan ID line separate from the
  description (an earlier version ran ID + verb + destination into one prose sentence
  inside a too-narrow column — fixed with explicit `<colgroup>` widths and right-aligned
  numeric columns).
- **Pagination** on Recent Activity (page/row-count controls, matching the real
  `PaginationControls` component's shape).
- **Boot loading state**: on first load, a skeleton (shimmer) placeholder for the whole
  page resolves into real content after ~850ms — demonstrates the loading treatment
  concretely rather than just describing it. Respects `prefers-reduced-motion` (skips
  straight to content, no artificial delay).

### In Process
- Same Spine, filtered emphasis on the 4 real CRM-actionable "in process" stages.
- Inline note explaining why "Received" and "In Process" both show "Send to Plant" (see
  §4 — this is correct, not a duplicate-bug).
- 4 lanes only: **Received → In Process → Sent to Plant (locked, no action) → Pending
  Ironing.** (An earlier 6-lane version with fake Washing/Drying/QC actions was wrong —
  see §4.)
- Order cards: bulk-select checkbox, record-payment icon, WhatsApp icon, action menu
  (View / Print A4 / Print Thermal / Print Garment Tags — matching real print routes),
  advance action, and on eligible cards a secondary "skip ahead" link.
- Bulk action bar (appears when ≥1 selected): "Create Challan & Send to Plant."
- Correction-reason modal demo (required reason for backward/skip moves, matching real
  backend correction-authority rules).
- "Sent to Plant" lane shows challan reference + plant partner name per card, no action
  buttons (fully locked, per real config).

### New Order — "The Slip"
Full page (see §2/§5), reached via "New Order," left via "← Back to Board." **Structurally
rebuilt once already** — an earlier version used the standard catalog-grid-left /
cart-sidebar-right POS split (even after going full-page). That was correctly called out as
still a reskin of the generic pattern every POS uses, not a rethink. Current design:

**Current structure (third iteration — see decision log #14/#15 for the two rejected
attempts before this):**

- **No permanent catalog grid, but no hide-behind-a-picker either.** A sticky
  "quick-add" strip (`position:sticky; top:105px`) sits right below the customer bar:
  category chips + a compact wrapping row of item pills, always visible, zero clicks to
  reach an item. Tried hiding the catalog behind a search-triggered reveal first — wrong
  call, correctly rejected as not ergonomic: reopening a picker for every single item add
  is slower than a visible grid when staff are routinely adding 6+ garments per order.
- Below the quick-add strip: a two-column grid — the **slip** (item rows, adjustments,
  totals, payment, "Create Order," ~fills remaining width) on the left, and a **customer
  snapshot rail** (320px, also sticky) on the right.
- The snapshot rail exists because a narrow centered single column left real dead space on
  a normal desktop monitor — correctly called out ("empty spaces... not utilised every
  space"). Widening the slip itself to fill that space was the lazy fix; instead the extra
  width carries genuinely useful, real content: order count / total spend / average order
  value, preferred payment method, outstanding dues, Daily Iron status, and the last 3
  orders (id, items, date, amount, status) with a link to the full customer profile. This
  is customer intelligence, not a second item catalog — deliberately different content so
  it doesn't reintroduce the picker/grid mistake in a new location. **Not wired to real
  customer stats/order-history endpoints — presentational only in the mockup.**
- Each slip row: name, unit price, a real +/− quantity stepper (wired, not decorative),
  line total, edit (price/discount override), remove.
- Daily Iron shows as a compact inline stamp/note on the slip (date field inline), not a
  large banner — still communicates the real behavior (Daily Iron items log separately,
  billed monthly, `ironAPI.createLogsBatch`) without dominating the layout.
- Discount/coupon/loyalty/wallet-split/write-off/notes are **collapsed by default** behind
  a single "Discount, coupon, loyalty & notes" toggle — most orders don't need them.
- Totals + payment method chips (Cash/UPI/Card/Pay Later — real canonical values) +
  "Create Order & Print Receipt" sit at the natural end of the slip.
- "Draft auto-saved" indicator (real behavior — the live app persists a draft to
  `localStorage`).
- Collapses to a single column below 1180px (quick-add strip, slip, then snapshot rail
  stacked, snapshot no longer sticky).

Real bug found and fixed while building an earlier (two-column cart/catalog, pinned
footer) version, worth keeping in mind for the real implementation regardless of layout: a
`flex:1` scrolling child without `min-height:0` will refuse to shrink below its own
content's natural height inside a fixed-height flex column — it silently pushed the
payment methods and "Create Order" button completely off-screen, below the visible
viewport, in what was supposed to be an always-visible pinned footer. Classic,
easy-to-miss flexbox trap. Verify any constrained-height + flex:1 + overflow:auto
combination in the real implementation by actually scrolling it, not by reading the CSS.

## 7. Known gaps / explicitly out of scope so far

- Only 3 of ~20 real CRM screens have a designed mockup. Every other sidebar link
  (Reports, All Orders, Ready For Delivery, Delivered, Quotations, Plant Challans,
  Recurring Pickups, Customer Directory, Referrals, Promotions, Campaigns, Iron Logs,
  Applications, Pricing, Finance, Cash Book, Expenses, Staff, Attendance) is a real,
  correctly-labeled nav entry with **no destination screen built** — do not assume they
  exist just because the link does.
- Return-order (`RETURNED`) flow, delivery OTP/rider flows, and staff-role-gated actions
  (e.g. write-off requiring admin authority) are represented as static notes/badges in the
  mockup, not fully modeled interactions.
- The mockup is a static HTML artifact with light demo JS (tab switching, checkbox counts,
  a modal, a command palette) — **none of it is wired to real data or the real API.** Do
  not treat anything in it as functionally tested.
- Typography was not custom-embedded beyond Inter/Space Grotesk/Space Mono (already the
  real brand fonts) — no further font exploration was done.

## 8. Decision log (chronological, so reversed ideas aren't retried)

1. Full teardown requested — not a reskin. "Think like the UX lead who designed this from
   day one," not like an engineer skinning existing pages.
2. First mockup pass: new ink/amber/brutalist palette, invented workflow lanes. **Rejected**
   — too dark, wrong colors, and the flow underneath was unchanged from the existing app
   (just re-themed) — the real ask was IA-level rework, not visual-only.
3. Second pass: reverted to real brand navy/logo/fonts (fetched and embedded for fidelity),
   introduced a unified "Spine" pipeline component shared by Dashboard/In Process, and a
   "pull a ticket" drawer concept for New Order to avoid full-page navigation. Pushed
   further toward a bolder, more considered interaction model per "demolishing a 100-year
   building, building a Burj Khalifa" framing.
4. Checked Maersk's real site for reference (two `WebFetch` attempts timed out; direct
   browser navigation worked). Findings: near-monochrome palette, solid black CTAs, hairline
   borders, no shadows, one accent color used sparingly. Could not verify their actual
   shipment-tracking timeline UI (needs a real tracking number).
5. Cross-checked `master-data.js` directly and found the mockup's 6-lane Washing/Drying/QC
   board was wrong — those statuses are legacy/non-CRM-editable. Rebuilt In Process around
   the real 4-stage flow, converted the Spine into a connected Maersk-style step tracker,
   pulled Delivered/Cancelled/Returned out of the main flow line per the real
   `customerBucket` split.
6. Caught and fixed a real bug mid-review: the artifact was stuck permanently on "Loading"
   because the logo PNG was embedded 3× (once per screen) inflating the file to ~444KB —
   deduplicated to a single CSS-embedded reference, cut to ~237KB.
7. "Ticket" language flagged as wrong for an order-based POS — purged everywhere in favor
   of "Order," matching the real object model.
8. A self-referential "this board updates itself, backed by sse.service.js" banner was
   flagged as bad product copy (implementation detail shown to the end user) — removed.
9. Restructured the Recent Activity table: was collapsing into what read as one run-on line
   per row (long prose "Event" cell next to short columns) — fixed with explicit column
   widths, right-aligned numerics, and a two-line ID/description split per row.
10. Built a Maersk-restrained "Option B" (monochrome, black CTAs, 4-hue semantic status
    system) as an explicit second direction for comparison. **User could not perceive
    enough difference to justify keeping two directions — dropped, keep the main direction
    only.**
11. Large batch of corrections in one pass, all pointing the same direction (toward
    explicitness and completeness over cleverness):
    - Icon-only rail + ⌘K-as-primary-nav didn't show all real destinations and wasn't
      newbie-discoverable → reverted to a full labeled sidebar with real nav parity.
    - "Received" and "In Process" both showing "Send to Plant" looked like a bug → verified
      against real `challanSendableStatuses` (it's correct) and added an inline explanation
      instead of removing either action.
    - New Order drawer felt cramped → converted to a full page.
    - Asked for the pipeline to read as an unambiguous A-to-Z sequence for a total newbie →
      added absolute step numbers (1–8) to every tracker node, consistent across screens.
    - Asked for real pagination, motion, and loading states, "like a CEO of a UI/UX
      company" → added pagination to Recent Activity, page-enter + staggered-tracker
      motion, and a real boot-loading skeleton sequence.
12. User caught a real layout bug from #11's step numbers: adding the number badge above
    each node required extra top padding on `.tstep`, but the connector `.line`'s vertical
    offset wasn't updated to match — the line cut across the top of the circle instead of
    through its center. Fixed the math once (`top:28.75px` to hit the new node center), then
    immediately after, **the numbering itself was rejected outright** ("the numbering is not
    required earlier one was good without numbering") — reverted step numbers entirely,
    which also removed the padding/line-offset complexity that caused the bug. Net state:
    plain connected tracker, no numbers, original line/padding math restored. Do not
    reintroduce step numbers without a fresh explicit ask.
    - Caught a real animation bug while implementing the above: the generic page-enter
      animation would have auto-revealed the boot-loader's hidden content early (animation
      `fill-mode: both` locks in `opacity:1` after ~360ms regardless of the 850ms reveal
      timer) — fixed with a more specific override.
    - Asked for "proper scrolling bars" → found the sidebar's scrollbar thumb inherited the
      light-theme color and was nearly invisible against the navy rail; added a themed
      dark-surface override, thickened the global scrollbar slightly, and wrapped the
      activity table and In Process board in explicit `overflow-x:auto` containers.
    - Asked to "mix and match, rearrange at your own thinking level, humanize the attention
      to detail" — treated as authorization to make the calls above decisively rather than
      re-asking for each one individually.
13. User reported the tracker's connecting line was visibly interfering with the circle
    numbers, correctly rejecting an earlier unverified claim that it was fixed. Root-caused
    properly this time (DOM/computed-style inspection, live font-swapping, large-scale glyph
    rendering, not just eyeballing a screenshot): there was no transform/RTL/mirroring bug —
    that theory was disproven directly. Two real, separate issues, both fixed:
    - The connecting line's endpoints reached all the way to each node's *center*, relying
      purely on the node's opaque background + z-index stacking to visually mask the segment
      "inside" the circle — fragile, and the likely real source of the "interfering" look.
      Fixed structurally: line endpoints are now inset by the node's radius (`calc(-50% +
      16px)` / `calc(100% - 32px)`), so the line only ever occupies the gap between circles
      and can never geometrically overlap one, regardless of stacking behavior.
    - Independently, Space Mono's small-size digit shapes (6/9 especially) are hard to scan
      at the 12.5px this badge rendered at — switched the in-circle counts to bold Inter
      with `font-variant-numeric: tabular-nums`, which is more legible at tiny sizes than a
      stylized monospace face.
    - Process lesson, stated directly by the user: verify visually before claiming something
      is fixed — don't ship CSS-math reasoning as a delivered fix. Found a working
      verification path this session: serve the local mockup file over `python3 -m
      http.server` and drive the browser tool to `http://localhost:<port>/...`, since the
      hosted `claude.ai/code/artifact/...` viewer was blank in this browser-automation
      session all session (title loads, canvas never paints) despite the user seeing real
      content there — a tooling/session quirk on the automation side, not a file problem,
      but it meant screenshots of the hosted artifact were never actually verifying
      anything. Local-server verification is the reliable path until that's understood.
    - Also fixed in the same pass: the file had no `<meta charset="utf-8">`, so local
      (non-artifact-hosted) serving rendered every em dash/curly quote/₹ as mojibake
      (`â€"` etc.). Added explicitly rather than relying on a host to set the right
      Content-Type header — trivial, but the kind of thing that silently breaks with a
      different index/CDN in front of the eventual real deploy.
14. User called New Order "too crunched" on the right side, specifically. First response
    was a same-structure fix (widen the panel, collapse adjustments, fix the flex bug) —
    correctly rejected: "still seems to be a reskin from old one... rebirth a new ui ux...
    with your own thinking." The two-column catalog-grid-left/cart-right split itself was
    the problem, not its spacing. Rebuilt as a single-column order slip with a
    summon-on-demand item picker in a sticky bottom bar instead of a permanent catalog grid.
15. That summon-on-demand picker was then correctly called out as "not ergonomic" —
    real problem, not just taste: hiding the catalog behind an open/close reveal costs an
    extra round-trip on *every single item add*, which is actively worse for a task that
    routinely adds 6+ garments per order. The lesson: novelty (not looking like a generic
    POS) had been prioritized over the actual job (fast, high-item-count entry). Fixed by
    keeping the catalog permanently visible but changing where it lives and how much room
    it takes — a compact sticky strip (category chips + wrapping item pills, ~180px) above
    the slip instead of either a permanent half-screen grid or a hide/reveal picker.
16. Widening the slip immediately surfaced the next real issue: on a normal desktop
    monitor, a single centered ~760px column left substantial dead space on both sides
    ("empty spaces in left and right... not utilised every space"). Widened the page and,
    instead of just stretching the slip to fill it (lazy, adds no value), used the freed
    width for a real customer-context rail — order history, spend stats, preferred payment,
    outstanding dues — deliberately different content from the catalog so the same
    hide-vs-permanent-grid mistake couldn't reappear in a new spot. This is the current
    design; the single-column and sticky-bottom-picker versions are both superseded, not
    alternate options. Verified visually via the local-server method (§ decision #13) at
    each step before publishing — sticky quick-add strip pinned through full-page scroll,
    snapshot rail sticky and non-overlapping, footer/CTA fully reachable.

## 9. Current artifact

Live mockup (Dashboard / In Process / New Order, tab-switchable):
`https://claude.ai/code/artifact/81f1d36d-059d-43f3-bc3b-bae997992cc4`

This link is stable — republishing under the same file path updates it in place rather than
minting a new URL. If a future session republishes it, this section should be updated only
if the URL itself changes (it shouldn't, under normal republish flow).

## 10. Next steps (not yet decided/started)

- Get explicit sign-off on the current mockup direction before writing any real
  `hangers-crm` code.
- Once approved: decide whether to implement Dashboard/In Process/New Order first as real
  Next.js pages, or continue mocking additional screens (Orders list, Customers, Finance,
  Daily Iron) before touching real code.
- Real data wiring plan: every mocked number/status in these 3 screens has a named real
  source (see §4 and screen specs above) — implementation should bind to those, not
  reintroduce placeholder/fallback values.
- Decide on the "skip ahead" and correction-modal interaction pattern's exact copy/rules
  by reading the full correction-authority logic in `orders.controller.js` (only partially
  reviewed so far — enough to model the UI affordance, not enough to guarantee every edge
  case is represented).
