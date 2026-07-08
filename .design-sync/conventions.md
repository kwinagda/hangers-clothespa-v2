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
