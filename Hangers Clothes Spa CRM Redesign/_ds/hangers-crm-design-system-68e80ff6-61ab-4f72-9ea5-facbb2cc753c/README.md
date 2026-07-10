# Hangers CRM — Design System Conventions

## No provider needed

Components work standalone — no context, theme, or app shell required. Destructure from `window.HangersCRM`:

```js
const { Button, Badge, StatCard, PageHeader, EmptyState, ErrorState,
        InlineLoader, SkeletonLine, SkeletonCard, TableLoader, PaginationControls } = window.HangersCRM;
```

## Styling idiom

**CRM components are prop-driven.** Style them only through their declared props (`variant`, `status`, `size`, etc.) — do not pass CSS classes to CRM component elements. (Button compiles Tailwind classes internally, but the public API is props only.)

**For your own layout glue** (page shell, wrappers, dividers), write `style={{ ... }}` with CSS custom properties from `tokens/brand.css`. All token names are available in every rendered design via `styles.css`'s import chain:

| Family | Tokens |
|---|---|
| Colors | `var(--color-primary)` #023c62 navy · `var(--color-primary-mid)` · `var(--color-accent)` #E8F0F7 · `var(--color-background)` #F7F9FC · `var(--color-border)` |
| Text | `var(--color-text-dark)` · `var(--color-text-mid)` · `var(--color-text-muted)` |
| Spacing | `var(--spacing-xs)` 4px · `var(--spacing-sm)` 8px · `var(--spacing-md)` 16px · `var(--spacing-lg)` 24px · `var(--spacing-xl)` 32px |
| Radius | `var(--radius-sm)` 8px · `var(--radius-md)` 12px · `var(--radius-lg)` 16px · `var(--radius-full)` 999px |
| Shadow | `var(--shadow-sm)` · `var(--shadow-md)` · `var(--shadow-lg)` |
| Typography | `var(--font-body)` Inter · `var(--font-display)` Space Grotesk · `var(--font-mono)` Space Mono |
| Status | `var(--status-pending)` · `var(--status-processing)` · `var(--status-delivered)` · `var(--status-cancelled)` (11 statuses total, see `tokens/brand.css`) |

Never assume Tailwind utility classes are available for your own layout — use `style={{ ... }}` with token vars.

## Key component APIs

- **Button** — `variant: 'primary'|'secondary'|'danger'|'ghost'`, `size: 'sm'|'md'|'lg'`, `loading?: boolean`, `icon?: ReactNode`, `children` required
- **Badge** — `label: string`, `status?: string` (auto-colors: `PENDING` · `PROCESSING` · `READY_FOR_DELIVERY` · `OUT_FOR_DELIVERY` · `DELIVERED` · `CANCELLED` and more), `color?: string` (custom hex), `size?: 'sm'|'md'`
- **StatCard** — `label: string`, `value: string|number`, `trend?: { direction: 'up'|'down'|'flat'; label: string }`, `sub?: string`, `loading?: boolean`
- **PageHeader** — `title: string`, `subtitle?: string`, `actions?: ReactNode`, `breadcrumb?: string[]`
- **PaginationControls** — `page: number`, `pageSize: number`, `totalItems: number`, `onPageChange: (p: number) => void`, `onPageSizeChange: (ps: number) => void`
- **EmptyState** / **ErrorState** — see `components/general/<Name>/<Name>.prompt.md` for full props
- **Loading states** — `InlineLoader` (spinner inline), `SkeletonLine` (text placeholder), `SkeletonCard` (card placeholder), `TableLoader` (table skeleton)

## Where the truth lives

- `tokens/brand.css` — all `var(--*)` token names and values
- `styles.css` — root import chain (includes `_ds_bundle.css` + tokens)
- `components/general/<Name>/<Name>.prompt.md` — usage guide and prop list per component
- `components/general/<Name>/<Name>.d.ts` — TypeScript interface

## Idiomatic build snippet

```jsx
const { PageHeader, StatCard, Badge, Button } = window.HangersCRM;

function OrdersDashboard() {
  return (
    <div style={{ padding: 'var(--spacing-lg)', background: 'var(--color-background)', fontFamily: 'var(--font-body)' }}>
      <PageHeader
        title="Orders"
        subtitle="Manage pickups and deliveries"
        actions={<Button variant="primary" size="sm">New Order</Button>}
      />
      <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap', marginBottom: 'var(--spacing-lg)' }}>
        <StatCard label="Active Orders" value={24} />
        <StatCard label="Ready" value={7} trend={{ direction: 'up', label: '+3 today' }} />
        <StatCard label="Delivered" value={142} trend={{ direction: 'flat', label: 'vs yesterday' }} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
        <Badge label="Ready for Delivery" status="READY_FOR_DELIVERY" />
        <Button variant="ghost" size="sm">View Details</Button>
        <Button variant="secondary" size="sm">Assign Rider</Button>
      </div>
    </div>
  );
}
```

# HangersCRM (hangers-crm@1.0.0)

This design system is the published hangers-crm React library, bundled as a single
browser global. All 11 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.HangersCRM`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.HangersCRM.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { Badge } = window.HangersCRM;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<Badge />);
```

## Tokens

62 CSS custom properties from hangers-crm. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (8): `--tw-border-spacing-x`, `--tw-border-spacing-y`, `--tw-ring-offset-color`, …
- **spacing** (1): `--tw-ring-inset`
- **typography** (3): `--crm-font-ui`, `--crm-font-display`, `--crm-font-mono`
- **shadow** (6): `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-shadow`, …
- **other** (44): `--tw-translate-x`, `--tw-translate-y`, `--tw-rotate`, …

## Components

### general
- `Badge`
- `Button`
- `EmptyState`
- `ErrorState`
- `InlineLoader`
- `PageHeader`
- `PaginationControls`
- `SkeletonCard`
- `SkeletonLine`
- `StatCard`
- `TableLoader`
