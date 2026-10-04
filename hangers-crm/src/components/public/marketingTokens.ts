export const MARKETING_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap'

export const MARKETING_TOKENS_CSS = `
.dw-root{
  --hg-navy:#023c62;--hg-navy-hover:#0a5a8f;--hg-ink:#0b2536;--hg-text:#3d5668;--hg-eyebrow:#3f6a88;
  --hg-muted:#5b7486;--hg-placeholder:#7b92a3;--hg-pale:#E8F0F7;--hg-field:#F1F6FA;--hg-accent:#9cc0dc;
  --hg-on-navy:#d3e4f1;--hg-page:#F7F9FC;--hg-border-input:#c9d9e6;--hg-divider:#d6e2ec;--hg-divider-inner:#e3ecf3;
  --hg-error:#b3261e;--hg-error-tint:#fff1f0;--hg-error-on-navy:#ffb4ab;
  --hg-shadow-card:0 20px 50px rgba(2,60,98,.12);--hg-shadow-modal:0 30px 80px rgba(2,60,98,.35);
  --hg-shadow-header:0 6px 24px rgba(2,60,98,.08);--hg-shadow-bar:0 10px 30px rgba(2,60,98,.35);
  --hg-scrim:rgba(2,36,58,.45);
  --hg-radius-card:24px;--hg-radius-form:28px;--hg-radius-small:20px;--hg-radius-pill:999px;
  --hg-container:1320px;--hg-container-form:1100px;
  --hg-section-gap:clamp(48px,9vw,110px);
  --hg-ease:cubic-bezier(.2,.7,.2,1);
}
.dw-root,.dw-root *{font-family:'Space Grotesk',sans-serif}
.dw-root input,.dw-root button,.dw-root select,.dw-root textarea,.dw-root option{font-family:'Space Grotesk',sans-serif}
.dw-root a{color:var(--hg-navy)}
.dw-root a:hover{color:var(--hg-navy-hover)}
.dw-root :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 5px var(--hg-navy);border-radius:4px}
@media (prefers-reduced-motion: reduce){.dw-root *{transition-duration:.01ms !important;animation-duration:.01ms !important;animation-iteration-count:1 !important}}
`
