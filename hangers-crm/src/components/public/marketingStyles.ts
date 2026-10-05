export const MARKETING_PAGE_CSS = `
.hg-home{width:min(100% - 48px,1320px);margin:0 auto}
.hg-section{padding:clamp(48px,9vw,110px) 0}
.hg-pagetop{max-width:1320px;margin:0 auto;padding:clamp(28px,6vw,72px) clamp(16px,4vw,28px) 24px}
.hg-crumb{font-size:13px;color:#3f6a88;font-weight:500}
.hg-crumb a{color:#3f6a88}
.hg-h1{margin:16px 0 0;color:#023c62;font-size:clamp(36px,8.4vw,104px);line-height:.98;letter-spacing:-.045em;font-weight:700;max-width:1100px;text-wrap:balance}
.hg-lede{max-width:640px;margin:22px 0 0;color:#3d5668;font-size:clamp(16px,2.2vw,20px);line-height:1.5}
.hg-kicker{margin:0 0 14px;color:#3f6a88;font-size:14px;font-weight:600}
.hg-h2{margin:0;color:#023c62;font-size:clamp(34px,5.4vw,80px);line-height:1;letter-spacing:-.04em;font-weight:700;text-wrap:balance}
.hg-h2-sm{margin:0;color:#023c62;font-size:clamp(26px,4vw,40px);line-height:1.1;letter-spacing:-.035em;font-weight:700}
.hg-body{max-width:1100px;margin:0 auto;padding:0 clamp(16px,4vw,28px)}
.hg-btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:16px 30px;border:1.5px solid #023c62;border-radius:999px;color:#023c62;font-size:16px;font-weight:600;transition:background .3s,color .3s,border-color .3s}
.hg-btn.solid{background:#023c62;color:#fff}
.hg-btn:hover{background:#0a5a8f;border-color:#0a5a8f;color:#fff}
.hg-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.hg-card{background:#fff;border:1px solid #d6e2ec;border-radius:24px;padding:clamp(20px,4vw,32px)}
.hg-card h2,.hg-card h3{margin:0 0 8px;color:#023c62}
.hg-card p{margin:0;color:#3d5668;font-size:17px;line-height:1.6}
.hg-pill-note{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;background:#E8F0F7;border-radius:28px;padding:clamp(24px,5vw,44px)}
.hg-stat{background:#023c62;color:#fff;border-radius:22px;padding:22px}
.hg-stat strong{display:block;font-size:clamp(30px,5vw,44px);font-weight:700;letter-spacing:-.04em}
.hg-stat span{opacity:.8;font-size:15px}
.hg-grid-auto{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px}
.hg-divider{max-width:1320px;margin:0 auto;border-top:1px solid #d6e2ec}
@media(max-width:760px){.hg-home{width:min(100% - 36px,1320px)}.hg-body{padding:0 18px}}
.hg-faq{border-top:1px solid #d6e2ec}
.hg-faq details{border-bottom:1px solid #d6e2ec}
.hg-faq summary{display:flex;justify-content:space-between;gap:20px;padding:22px 4px;color:#023c62;font-size:19px;font-weight:600;cursor:pointer;list-style:none}
.hg-faq summary::-webkit-details-marker{display:none}
.hg-faq summary:after{content:'+';color:#5b7486;font-size:24px;line-height:1}
.hg-faq details[open] summary:after{content:'−'}
.hg-faq p{max-width:72ch;margin:-4px 0 0;padding:0 4px 24px;color:#3d5668;font-size:17px;line-height:1.6}
`
