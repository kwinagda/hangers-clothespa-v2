# Design Sync Notes

## Re-sync checklist (run after component or brand changes)

```bash
# 1. Recompile Tailwind CSS (if globals.css changed)
cd hangers-crm && npx tailwindcss -i src/app/globals.css -o ds-compiled-styles.css && cd ..

# 2. Rebuild CRM component bundle
node .ds-sync/package-build.mjs \
  --config .design-sync/config.json \
  --node-modules ./hangers-crm/node_modules \
  --entry ./hangers-crm/src/components/ui/index.ts \
  --out ./ds-bundle

# 3. Validate
node .ds-sync/package-validate.mjs ./ds-bundle --no-render-check

# 4. Copy logos into build output (they don't rebuild automatically)
mkdir -p ds-bundle/brand
cp hangers-backend/src/assets/hangers-logo-blue.png ds-bundle/brand/
cp hangers-backend/src/assets/hangers-logo-white.png ds-bundle/brand/

# 5. Regenerate tokens and guidelines if theme.ts or screens changed
# - tokens/brand.css  →  manually regenerate from hangers-app/src/utils/theme.ts
# - guidelines/*.md   →  manually update from screen files
# Place updated files into ds-bundle/ then upload via DesignSync tool in Claude Code
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

## Sync config decisions recorded

- `componentSrcMap` required: CRM is a Next.js app with no `dist/`, no self-installed package in node_modules, and only `next-env.d.ts` for types. The converter can't auto-discover exports via DTS scanning.
- `cssEntry: "ds-compiled-styles.css"`: Tailwind CSS must be pre-compiled; `globals.css` has `@tailwind` directives that esbuild can't process.
- `[FONT_REMOTE]` warning: Manrope, Outfit, IBM Plex Mono, DM Mono are CSS fallback references, not loaded fonts. Non-blocking.
- React Native apps (customer + staff): Cannot be bundled for browser. Covered via `guidelines/` documentation instead.
