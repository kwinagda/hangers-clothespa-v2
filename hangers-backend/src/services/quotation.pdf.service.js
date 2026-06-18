const fs = require('fs/promises');
const path = require('path');

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const roundMoney = (value) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

const formatDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const readAssetDataUrl = async (fileName, mimeType) => {
  const filePath = path.join(__dirname, '..', 'assets', fileName);
  const buffer = await fs.readFile(filePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
};

let brandAssetsPromise = null;
const getBrandAssets = async () => {
  if (!brandAssetsPromise) {
    brandAssetsPromise = Promise.all([
      readAssetDataUrl('hangers-logo-blue.png', 'image/png'),
      readAssetDataUrl('hangers-logo-white.png', 'image/png'),
    ]).then(([blueLogo, whiteLogo]) => ({ blueLogo, whiteLogo }));
  }
  return brandAssetsPromise;
};

const getDiscountMath = (item) => {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unitPrice || 0);
  const grossAmount = roundMoney(unitPrice * quantity);
  const discountType = String(item.lineDiscountType || '').trim().toUpperCase();
  const discountValue = Number(item.lineDiscountValue || 0);

  let totalDiscount = Number(item.lineDiscountAmount || 0);
  let discountLabel = '—';

  if (discountType === 'FLAT' && discountValue > 0) {
    totalDiscount = Math.min(grossAmount, roundMoney(discountValue * quantity));
    discountLabel = `${fmt(discountValue)}/qty`;
  } else if (discountType === 'PERCENT' && discountValue > 0) {
    totalDiscount = Math.min(grossAmount, roundMoney((grossAmount * discountValue) / 100));
    discountLabel = `${discountValue}%`;
  } else if (totalDiscount > 0 && quantity > 0) {
    discountLabel = `${fmt(roundMoney(totalDiscount / quantity))}/qty`;
  }

  const finalAmount = roundMoney(Number(item.subtotal ?? Math.max(0, grossAmount - totalDiscount)));

  return {
    quantity,
    unitPrice,
    grossAmount,
    discountLabel,
    totalDiscount,
    finalAmount,
  };
};

const buildItemRows = (items) => items.map((item, index) => {
  const {
    quantity,
    unitPrice,
    grossAmount,
    discountLabel,
    totalDiscount,
    finalAmount,
  } = getDiscountMath(item);
  const serviceMeta = [item.garmentType, item.variant].filter(Boolean).map(escapeHtml).join(' · ');

  return `
    <tr>
      <td class="cell">
        <div class="service-name">${escapeHtml(item.serviceName || 'Service')}</div>
        <div class="service-meta">${serviceMeta || 'General service'}</div>
        ${item.notes ? `<div class="service-note"><span class="service-note-label">Description:</span> ${escapeHtml(item.notes)}</div>` : ''}
      </td>
      <td class="cell cell-num">${quantity}</td>
      <td class="cell cell-num">${fmt(unitPrice)}</td>
      <td class="cell cell-num">${fmt(grossAmount)}</td>
      <td class="cell cell-num">${escapeHtml(discountLabel)}</td>
      <td class="cell cell-num ${totalDiscount > 0 ? 'negative' : ''}">${totalDiscount > 0 ? `-${fmt(totalDiscount)}` : '—'}</td>
      <td class="cell cell-num final-line">${fmt(finalAmount)}</td>
    </tr>
  `;
}).join('');

const buildServiceDescriptionRows = (items) => items
  .filter((item) => String(item?.notes || '').trim())
  .map((item) => `
    <div class="service-description-row">
      <div class="service-description-name">${escapeHtml(item.serviceName || 'Service')}</div>
      <div class="service-description-body">${escapeHtml(item.notes)}</div>
    </div>
  `)
  .join('');

const generateQuotationHTML = async (quotation) => {
  const { blueLogo, whiteLogo } = await getBrandAssets();
  const items = Array.isArray(quotation?.items) ? quotation.items : [];
  const noteText = String(quotation?.notes || '').trim();
  const serviceDescriptionMarkup = buildServiceDescriptionRows(items);
  const compactLayout = items.length > 5 || noteText.length > 140;

  const serviceDiscount = items.reduce((sum, item) => sum + Number(item.lineDiscountAmount || 0), 0);
  const grossServiceValue = roundMoney(items.reduce((sum, item) => {
    const { grossAmount } = getDiscountMath(item);
    return sum + grossAmount;
  }, 0));
  const adjustedSubtotal = Number(quotation.subtotal || 0);
  const billDiscount = Number(quotation.discount || 0);
  const finalTotal = Number(quotation.totalAmount || 0);
  const totalPieces = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Space+Mono:wght@400;500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', sans-serif;
          color: #152132;
          background: #ffffff;
          padding: 10px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sheet {
          border: 1px solid #d7e4ee;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 42px rgba(2, 60, 98, 0.08);
          background: #fff;
        }
        .hero, .top-grid, .panel, .section-head, .summary-wrap, .summary-card, .notes, .footer {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .hero {
          background: linear-gradient(135deg, #022d4d 0%, #023c62 58%, #2a6b97 100%);
          color: #fff;
          padding: 16px 18px 14px;
          position: relative;
        }
        .hero:before {
          content: '';
          position: absolute;
          right: -38px;
          top: -30px;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          background: rgba(255,255,255,0.06);
        }
        .hero:after {
          content: '';
          position: absolute;
          right: 86px;
          top: 92px;
          width: 84px;
          height: 84px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
        }
        .hero-row {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }
        .logo-white {
          width: 148px;
          height: 42px;
          object-fit: contain;
          object-position: left center;
          display: block;
          margin-bottom: 6px;
        }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
          color: #dcecf9;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .hero-copy {
          margin-top: 7px;
          font-size: 11px;
          line-height: 1.45;
          color: #e8f5ff;
          max-width: 440px;
        }
        .total-card {
          min-width: 220px;
          border-radius: 14px;
          padding: 12px 14px;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.16);
        }
        .total-label {
          font-size: 10px;
          color: #c9deef;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 5px;
        }
        .total-value {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 27px;
          line-height: 1;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.03em;
        }
        .total-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        .total-meta-label {
          font-size: 10px;
          color: #b9d2e5;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 3px;
        }
        .total-meta-value {
          font-size: 12px;
          font-weight: 700;
          color: #fff;
        }
        .content {
          padding: 14px 16px 16px;
        }
        .top-grid {
          display: grid;
          grid-template-columns: 1.45fr 0.95fr;
          gap: 10px;
          margin-bottom: 10px;
        }
        .panel {
          border: 1px solid #dce8f0;
          border-radius: 14px;
          padding: 12px 14px;
          background: #fff;
        }
        .panel-soft {
          background: linear-gradient(180deg, #fbfdff 0%, #f4f9fd 100%);
        }
        .panel-label {
          font-size: 10px;
          color: #6f87a1;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 6px;
        }
        .customer-name {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: #023c62;
          margin-bottom: 2px;
        }
        .customer-phone {
          font-size: 12px;
          font-weight: 600;
          color: #53657d;
          margin-bottom: 8px;
        }
        .chip-row { display: flex; flex-wrap: wrap; gap: 10px; }
        .chip {
          padding: 6px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
        }
        .chip-blue { background: #e9f3fb; color: #023c62; }
        .chip-green { background: #e8f7ee; color: #166534; }
        .meta-stack { display: grid; gap: 10px; }
        .meta-title { font-size: 10px; color: #8ca0b5; margin-bottom: 3px; }
        .meta-value { font-size: 14px; color: #182538; font-weight: 700; }
        .section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 6px;
        }
        .section-title {
          font-size: 12px;
          font-weight: 800;
          color: #023c62;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .section-note {
          font-size: 10px;
          color: #6b7fa3;
          font-weight: 600;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #e4edf5;
          border-radius: 14px;
          overflow: hidden;
        }
        thead tr { background: #edf5fb; }
        th {
          padding: 8px 10px;
          border-bottom: 1px solid #dce8f0;
          text-align: left;
          font-size: 10px;
          color: #476581;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .cell {
          padding: 8px 10px;
          border-bottom: 1px solid #eef3f8;
          font-size: 10px;
          vertical-align: top;
        }
        tbody tr:nth-child(even) .cell { background: #fbfdff; }
        .cell-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .service-name { font-size: 12px; font-weight: 700; color: #182538; margin-bottom: 2px; line-height: 1.3; }
        .service-meta { font-size: 10px; color: #8194a8; }
        .service-note {
          font-size: 10px;
          color: #3b536b;
          margin-top: 6px;
          line-height: 1.5;
          white-space: pre-wrap;
          padding: 6px 8px;
          border-radius: 8px;
          background: #f6fafd;
          border: 1px solid #dce8f0;
        }
        .service-note-label { font-weight: 700; color: #35516d; }
        .negative { color: #166534; font-weight: 700; }
        .final-line { color: #023c62; font-weight: 800; }
        .summary-wrap {
          display: grid;
          grid-template-columns: 1fr 304px;
          gap: 10px;
          margin-top: 10px;
          align-items: start;
        }
        .summary-card {
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 26px rgba(2, 60, 98, 0.08);
        }
        .summary-top {
          background: linear-gradient(135deg, #023c62 0%, #0d537e 100%);
          color: #fff;
          padding: 12px 14px;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .summary-body {
          border: 1px solid #dce8f0;
          border-top: none;
          background: #fbfdff;
          padding: 12px 14px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 6px;
          font-size: 11px;
          color: #53657d;
        }
        .summary-value {
          color: #182538;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .summary-total {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding-top: 10px;
          border-top: 1px solid #dce8f0;
          font-size: 16px;
          font-weight: 800;
          color: #023c62;
          font-variant-numeric: tabular-nums;
        }
        .notes {
          margin-top: 10px;
          border: 1px solid #dce8f0;
          border-radius: 14px;
          padding: 12px 14px;
          background: linear-gradient(180deg, #fbfdff 0%, #f6fafc 100%);
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .notes-title {
          font-size: 10px;
          color: #7d91a7;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 5px;
        }
        .notes-body {
          font-size: 12px;
          color: #1f2c3c;
          line-height: 1.45;
          white-space: pre-wrap;
        }
        .service-description-row + .service-description-row {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #dce8f0;
        }
        .service-description-name {
          font-size: 11px;
          color: #35516d;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 4px;
        }
        .service-description-body {
          font-size: 12px;
          color: #1f2c3c;
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .footer {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px dashed #d2dce6;
          text-align: center;
          color: #8194a8;
          font-size: 10px;
        }
        .logo-blue {
          width: 92px;
          height: 22px;
          object-fit: contain;
          display: block;
          margin: 0 auto 8px;
        }
        .layout-compact .hero-copy {
          max-width: 390px;
        }
        .layout-compact .summary-wrap {
          grid-template-columns: 1fr 292px;
        }
        @page {
          size: A4;
          margin: 0;
        }
      </style>
    </head>
    <body class="${compactLayout ? 'layout-compact' : ''}">
      <div class="sheet">
        <div class="hero">
          <div class="hero-row">
            <div>
              <img class="logo-white" src="${whiteLogo}" alt="Hangers logo" />
              <div class="eyebrow">Customer Quotation</div>
              <div class="hero-copy">
                A premium service estimate prepared through the Hangers CRM workflow. Final charges may change only if dimensions, item count, fabric condition, or requested service complexity differs at inspection.
              </div>
            </div>
            <div class="total-card">
              <div class="total-label">Estimated Total</div>
              <div class="total-value">${fmt(finalTotal)}</div>
              <div class="total-meta">
                <div>
                  <div class="total-meta-label">Quote No.</div>
                  <div class="total-meta-value">${escapeHtml(quotation.orderNumber || '—')}</div>
                </div>
                <div>
                  <div class="total-meta-label">Valid Until</div>
                  <div class="total-meta-value">${formatDate(quotation.validUntil)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="content">
          <div class="top-grid">
            <div class="panel panel-soft">
              <div class="panel-label">Customer</div>
              <div class="customer-name">${escapeHtml(quotation.customer?.name || 'Customer')}</div>
              <div class="customer-phone">${escapeHtml(quotation.customer?.phone || '—')}</div>
              <div class="chip-row">
                <div class="chip chip-blue">${totalPieces} item${totalPieces === 1 ? '' : 's'}</div>
                <div class="chip chip-green">Service Discount ${serviceDiscount ? fmt(serviceDiscount) : '—'}</div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-label">Validity</div>
              <div class="meta-stack">
                <div>
                  <div class="meta-title">Created On</div>
                  <div class="meta-value">${formatDate(quotation.createdAt)}</div>
                </div>
                <div>
                  <div class="meta-title">Valid Until</div>
                  <div class="meta-value">${formatDate(quotation.validUntil)}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section-head">
            <div class="section-title">Quoted Services</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th style="text-align:right">Qty</th>
                <th style="text-align:right">Rate</th>
                <th style="text-align:right">Gross</th>
                <th style="text-align:right">Disc/Qty</th>
                <th style="text-align:right">Disc Total</th>
                <th style="text-align:right">Final</th>
              </tr>
            </thead>
            <tbody>
              ${buildItemRows(items)}
            </tbody>
          </table>

          <div class="summary-wrap">
            <div></div>
            <div class="summary-card">
              <div class="summary-top">Estimate Summary</div>
              <div class="summary-body">
                <div class="summary-row"><span>Gross Service Value</span><span class="summary-value">${fmt(grossServiceValue)}</span></div>
                <div class="summary-row"><span>Included Service Discount</span><span class="summary-value ${serviceDiscount ? 'negative' : ''}">${serviceDiscount ? `-${fmt(serviceDiscount)}` : '—'}</span></div>
                <div class="summary-row"><span>Net After Service Discount</span><span class="summary-value">${fmt(adjustedSubtotal)}</span></div>
                <div class="summary-row"><span>Bill-Level Discount</span><span class="summary-value ${billDiscount ? 'negative' : ''}">${billDiscount ? `-${fmt(billDiscount)}` : '—'}</span></div>
                <div class="summary-total"><span>Final Quoted Total</span><span>${fmt(finalTotal)}</span></div>
              </div>
          </div>
        </div>

          ${noteText ? `
            <div class="notes">
              <div class="notes-title">Service Notes</div>
              <div class="notes-body">${escapeHtml(noteText)}</div>
            </div>
          ` : ''}

          <div class="footer">
            <img class="logo-blue" src="${blueLogo}" alt="Hangers logo" />
            This quotation is an estimate and may change if garment count, dimensions, fabric condition, or service requirements differ at inspection.
          </div>
        </div>
      </div>
    </body>
  </html>`;
};

module.exports = {
  generateQuotationHTML,
};
