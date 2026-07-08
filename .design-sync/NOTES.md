# Design Sync Notes

## Re-sync checklist (run after component or brand changes)

**CRITICAL:** `resync.mjs` rebuilds ds-bundle from scratch, wiping `tokens/`, `guidelines/`, and `brand/`. Steps 3–5 below MUST run after every resync.mjs invocation.

```bash
# 0. Re-stage scripts from skill base dir (prevents running a stale converter)
SKILL_BASE="/private/tmp/claude-501/bundled-skills/2.1.198/0a99c18310553e5236d6e85395224591/design-sync"
cp -r "$SKILL_BASE/package-build.mjs" "$SKILL_BASE/package-validate.mjs" "$SKILL_BASE/package-capture.mjs" "$SKILL_BASE/resync.mjs" "$SKILL_BASE/lib" "$SKILL_BASE/storybook" .ds-sync/

# 1. Recompile Tailwind CSS (if globals.css changed)
cd hangers-crm && npx tailwindcss -i src/app/globals.css -o ds-compiled-styles.css && cd ..

# 2. Fetch remote anchor + run driver (replaces separate build + validate steps)
mkdir -p .design-sync/.cache
# fetch _ds_sync.json from remote into .design-sync/.cache/remote-sync.json first (via DesignSync get_file)
node .ds-sync/resync.mjs \
  --config .design-sync/config.json \
  --node-modules ./hangers-crm/node_modules \
  --entry ./hangers-crm/src/components/ui/index.ts \
  --out ./ds-bundle \
  --remote .design-sync/.cache/remote-sync.json \
  --no-render-check

# 3. Restore logos (wiped by resync)
mkdir -p ds-bundle/brand
cp hangers-backend/src/assets/hangers-logo-blue.png ds-bundle/brand/
cp hangers-backend/src/assets/hangers-logo-white.png ds-bundle/brand/

# 4. Restore tokens (wiped by resync)
# Copy ds-bundle/tokens/brand.css from source: hangers-app/src/utils/theme.ts
# (see existing tokens/brand.css in git for format — regenerate if theme.ts changed)

# 5. Restore guidelines (wiped by resync)
# Copy ds-bundle/guidelines/customer-app.md and staff-app.md
# (see .design-sync/NOTES.md "What's in the design project" for source files)

# 6. Upload via DesignSync finalize_plan + write_files
```

## What's in the design project

| Path | Source | Auto-rebuilds? |
|---|---|---|
| `components/general/**` | `hangers-crm/src/components/ui/` | Yes (step 2 above) |
| `_ds_bundle.js` | Same | Yes |
| `styles.css` | `hangers-crm/ds-compiled-styles.css` | Yes (step 1+2) |
| `_preview/*.js` | `.design-sync/previews/*.tsx` | Yes (step 2) |
| `brand/hangers-logo-blue.png` | `hangers-backend/src/assets/` | No — copy manually |
| `brand/hangers-logo-white.png` | `hangers-backend/src/assets/` | No — copy manually |
| `tokens/brand.css` | `hangers-app/src/utils/theme.ts` | No — regenerate manually |
| `guidelines/customer-app.md` | `hangers-app/src/screens/` | No — update manually |
| `guidelines/staff-app.md` | `hangers-staff-app/src/screens/` | No — update manually |

## Re-sync risks

- **globals.css CSS additions** — new utility classes require Tailwind recompile before resync.mjs. The driver won't catch this; it only sees the compiled `ds-compiled-styles.css`.
- **tokens/brand.css, guidelines/*.md, brand/ logos** — wiped by every resync.mjs run. Must be manually restored (steps 3–5 above). If `theme.ts` changes, regenerate `tokens/brand.css` too.
- **conventions.md prop names** — validated against source at authoring time. Re-check if a component API changes (e.g. StatCard's `trend.label` vs a future `trend.value`).
- **resync.mjs skill scripts** — `.ds-sync/` is gitignored and not auto-updated. Always re-copy from the skill base dir (step 0) before running.

## Sync config decisions recorded

- `componentSrcMap` required: CRM is a Next.js app with no `dist/`, no self-installed package in node_modules, and only `next-env.d.ts` for types. The converter can't auto-discover exports via DTS scanning.
- `cssEntry: "ds-compiled-styles.css"`: Tailwind CSS must be pre-compiled; `globals.css` has `@tailwind` directives that esbuild can't process.
- `[FONT_REMOTE]` warning: Manrope, Outfit, IBM Plex Mono, DM Mono are CSS fallback references, not loaded fonts. Non-blocking.
- React Native apps (customer + staff): Cannot be bundled for browser. Covered via `guidelines/` documentation instead.
