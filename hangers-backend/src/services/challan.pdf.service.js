// ── Challan PDF Service ───────────────────────────────────────────────────────
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const LOGO_URL = 'https://wadashboardapi.161apps.com/media-file/406df8a3-4651-46d8-9e0b-9ee9aa3b0173/Hangers%20logo%20unit%20transparent.png';

const generateChallanHTML = (challan) => {
  const orders = challan.challanOrders || [];
  const items  = challan.challanItems  || [];
  const date   = new Date(challan.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // Combine duplicate items by name
  const itemMap = {};
  items.forEach(item => {
    const key = item.serviceName;
    if (itemMap[key]) {
      itemMap[key].quantity += item.quantity;
      itemMap[key].isReceived = itemMap[key].isReceived && item.isReceived;
      if (!itemMap[key].vendorCost && item.vendorCost) itemMap[key].vendorCost = item.vendorCost;
    } else {
      itemMap[key] = { ...item };
    }
  });
  const combined = Object.values(itemMap);
  const totalGarments = combined.reduce((s, i) => s + i.quantity, 0);
  const totalVendorCost = combined.reduce((s, i) => s + (i.vendorCost * i.quantity), 0);

  const itemRows = combined.map(item => `
    <tr>
      <td>${item.serviceName}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">${fmt(item.vendorCost)}</td>
      <td style="text-align:right">${fmt(item.vendorCost * item.quantity)}</td>
      <td style="text-align:center">${
        item.receivedQty >= item.quantity
          ? '&#10003;'
          : item.receivedQty > 0
          ? item.receivedQty + '/' + item.quantity
          : '&mdash;'
      }</td>
    </tr>`).join('');

  const orderSummary = orders.map(co => {
    const garmentCount = (co.order?.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
    return `
    <tr>
      <td style="font-family:'Space Mono',monospace;color:#023c62;font-weight:700">${co.order?.orderNumber || ''}</td>
      <td>${co.order?.customer?.name || ''}</td>
      <td>${co.order?.customer?.phone || ''}</td>
      <td style="text-align:center;font-weight:600">${garmentCount} pcs</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Space+Mono:wght@400;500;600&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; font-size:12px; color:#1a2332; background:#fff; padding:40px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:24px; border-bottom:3px solid #023c62; }
  .brand-logo { width:280px; max-width:100%; height:auto; display:block; }
  .brand-sub { font-size:12px; color:#6b7fa3; margin-top:2px; }
  .brand-addr { font-size:11px; color:#9dafc8; margin-top:4px; line-height:1.6; }
  .doc-info { text-align:right; }
  .doc-type { font-family:'Space Grotesk',sans-serif; font-size:13px; font-weight:700; color:#6b7fa3; text-transform:uppercase; letter-spacing:0.1em; }
  .doc-no { font-family:'Space Grotesk',sans-serif; font-size:26px; font-weight:800; color:#023c62; margin:4px 0; letter-spacing:-0.02em; }
  .status-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:600; background:#dbeafe; color:#1e40af; }
  .meta-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:24px; }
  .meta-card { background:#f8fafc; border-radius:8px; padding:12px 14px; border:1px solid #e8f0f7; }
  .meta-label { font-size:10px; color:#9dafc8; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:4px; }
  .meta-value { font-size:14px; font-weight:600; color:#023c62; }
  .section-title { font-family:'Space Grotesk',sans-serif; font-size:12px; font-weight:700; color:#023c62; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:10px; margin-top:20px; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  th { background:#023c62; color:#fff; padding:8px 10px; text-align:left; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; }
  td { padding:7px 10px; border-bottom:1px solid #f0f4f8; font-size:11px; }
  tr:nth-child(even) td { background:#fafbfd; }
  .totals { background:#023c62; color:#fff; border-radius:10px; padding:20px 28px; margin-top:16px; display:flex; justify-content:space-around; align-items:center; }
  .totals-item { text-align:center; }
  .totals-label { font-size:10px; opacity:0.7; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px; }
  .totals-value { font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:800; letter-spacing:-0.02em; }
  .sign-section { display:grid; grid-template-columns:1fr 1fr; gap:60px; margin-top:48px; }
  .sign-box { border-top:1px solid #1a2332; padding-top:8px; }
  .sign-label { font-size:10px; color:#9dafc8; text-transform:uppercase; letter-spacing:0.06em; }
  .footer { margin-top:32px; padding-top:12px; border-top:1px solid #e8f0f7; display:flex; justify-content:space-between; font-size:10px; color:#9dafc8; }
</style>
</head>
<body>
<div class="header">
  <div>
    <img class="brand-logo" src="${LOGO_URL}" alt="Hangers logo" />
    <div class="brand-sub">Premium Dry Cleaning &amp; Laundry</div>
    <div class="brand-addr">Shop No 8, Roop Pooja Building, Opp Shivas Saloon<br>Sarvodaya Nagar, Mulund West, Mumbai 400080<br>+91 7977417014</div>
  </div>
  <div class="doc-info">
    <div class="doc-type">Delivery Challan</div>
    <div class="doc-no">${challan.challanNo}</div>
    <div style="font-size:11px;color:#6b7fa3">Date: ${date}</div>
    <div style="margin-top:8px"><span class="status-badge">${challan.status}</span></div>
  </div>
</div>

<div class="meta-grid">
  <div class="meta-card"><div class="meta-label">Plant / Vendor</div><div class="meta-value">${challan.plant}</div></div>
  <div class="meta-card"><div class="meta-label">Driver</div><div class="meta-value">${challan.driverName || '&mdash;'}</div></div>
  <div class="meta-card"><div class="meta-label">Vehicle</div><div class="meta-value">${challan.vehicleNo || '&mdash;'}</div></div>
</div>

<div class="section-title">Orders Included (${orders.length})</div>
<table>
  <thead><tr><th>Order #</th><th>Customer</th><th>Phone</th><th style="text-align:center">Garments</th></tr></thead>
  <tbody>${orderSummary}</tbody>
</table>

<div class="section-title">Garment Details</div>
<table>
  <thead><tr><th>Item / Service</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Cost</th><th style="text-align:right">Total Cost</th><th style="text-align:center">Received</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>

<div class="totals">
  <div class="totals-item">
    <div class="totals-label">Total Garments</div>
    <div class="totals-value">${totalGarments} pcs</div>
  </div>
  <div class="totals-item">
    <div class="totals-label">Total Orders</div>
    <div class="totals-value">${orders.length}</div>
  </div>
  <div class="totals-item">
    <div class="totals-label">Vendor Cost (Payable)</div>
    <div class="totals-value">${fmt(totalVendorCost || challan.vendorCost)}</div>
  </div>
</div>

${challan.notes ? `<div style="margin-top:16px;background:#fefce8;border-radius:8px;padding:10px 14px;font-size:11px;color:#854d0e"><strong>Notes:</strong> ${challan.notes}</div>` : ''}

<div class="sign-section">
  <div class="sign-box"><div class="sign-label">Authorised Signature</div></div>
  <div class="sign-box"><div class="sign-label">${challan.plant} &mdash; Received By</div></div>
</div>

<div class="footer">
  <span>Mulund West, Mumbai &nbsp;·&nbsp; +91 7977417014</span>
  <span>Generated: ${new Date().toLocaleString('en-IN')}</span>
</div>
</body>
</html>`;
};

const generateVendorBillHTML = (bill) => {
  const challans = bill.challans || [];
  const date     = new Date(bill.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const challanRows = challans.map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td style="font-family:'Space Mono',monospace;color:#023c62;font-weight:700">${c.challanNo}</td>
      <td>${new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
      <td style="text-align:right;font-weight:700">${fmt(c.vendorCost)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Space+Mono:wght@400;500;600&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; font-size:12px; color:#1a2332; background:#fff; padding:40px; }
  .header { display:flex; justify-content:space-between; margin-bottom:32px; padding-bottom:24px; border-bottom:3px solid #023c62; }
  .brand-logo { width:280px; max-width:100%; height:auto; display:block; }
  .brand-sub { font-size:12px; color:#6b7fa3; margin-top:2px; }
  .brand-addr { font-size:11px; color:#9dafc8; margin-top:4px; line-height:1.6; }
  .doc-info { text-align:right; }
  .doc-type { font-family:'Space Grotesk',sans-serif; font-size:13px; font-weight:700; color:#6b7fa3; text-transform:uppercase; letter-spacing:0.1em; }
  .doc-no { font-family:'Space Grotesk',sans-serif; font-size:26px; font-weight:800; color:#023c62; margin:4px 0; letter-spacing:-0.02em; }
  .to-section { background:#f8fafc; border-radius:10px; padding:16px 20px; margin-bottom:24px; border-left:4px solid #023c62; }
  .to-label { font-size:10px; color:#9dafc8; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
  .to-name { font-family:'Space Grotesk',sans-serif; font-size:18px; font-weight:700; color:#023c62; letter-spacing:-0.02em; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  th { background:#023c62; color:#fff; padding:8px 10px; text-align:left; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; }
  td { padding:8px 10px; border-bottom:1px solid #f0f4f8; font-size:11px; }
  tr:nth-child(even) td { background:#fafbfd; }
  .total-row td { background:#023c62 !important; color:#fff; font-family:'Space Grotesk',sans-serif; font-size:15px; font-weight:800; padding:14px 10px; letter-spacing:-0.02em; }
  .sign-section { display:grid; grid-template-columns:1fr 1fr; gap:60px; margin-top:48px; }
  .sign-box { border-top:1px solid #1a2332; padding-top:8px; }
  .sign-label { font-size:10px; color:#9dafc8; text-transform:uppercase; letter-spacing:0.06em; }
  .footer { margin-top:32px; padding-top:12px; border-top:1px solid #e8f0f7; display:flex; justify-content:space-between; font-size:10px; color:#9dafc8; }
</style>
</head>
<body>
<div class="header">
  <div>
    <img class="brand-logo" src="${LOGO_URL}" alt="Hangers logo" />
    <div class="brand-sub">Premium Dry Cleaning &amp; Laundry</div>
    <div class="brand-addr">Shop No 8, Roop Pooja Building, Opp Shivas Saloon<br>Sarvodaya Nagar, Mulund West, Mumbai 400080<br>+91 7977417014</div>
  </div>
  <div class="doc-info">
    <div class="doc-type">Vendor Bill</div>
    <div class="doc-no">${bill.billNo}</div>
    <div style="font-size:11px;color:#6b7fa3">Date: ${date}</div>
    <div style="margin-top:8px;display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;background:${bill.status === 'PAID' ? '#dcfce7' : '#fef9c3'};color:${bill.status === 'PAID' ? '#166534' : '#854d0e'}">${bill.status}</div>
    ${bill.paidAt ? `<div style="font-size:11px;color:#166534;margin-top:4px">Paid: ${new Date(bill.paidAt).toLocaleDateString('en-IN')}</div>` : ''}
  </div>
</div>

<div class="to-section">
  <div class="to-label">Bill To (Vendor / Plant)</div>
  <div class="to-name">${bill.plant}</div>
  <div style="font-size:11px;color:#6b7fa3;margin-top:4px">Processing Plant &mdash; Outsourced Vendor</div>
</div>

<div style="font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:#023c62;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px">
  Challans Included (${challans.length})
</div>

<table>
  <thead><tr><th>#</th><th>Challan No</th><th>Date</th><th style="text-align:right">Amount Payable</th></tr></thead>
  <tbody>
    ${challanRows}
    <tr class="total-row">
      <td colspan="3">TOTAL PAYABLE TO ${bill.plant}</td>
      <td style="text-align:right">${fmt(bill.totalAmount)}</td>
    </tr>
  </tbody>
</table>

${bill.notes ? `<div style="margin-top:16px;background:#fefce8;border-radius:8px;padding:10px 14px;font-size:11px;color:#854d0e"><strong>Notes:</strong> ${bill.notes}</div>` : ''}

<div style="margin-top:16px;background:#f0fdf4;border-radius:8px;padding:12px 16px;font-size:13px;color:#166534;font-weight:600">
  Payment Due: ${fmt(bill.totalAmount)} payable to ${bill.plant}
</div>

<div class="sign-section">
  <div class="sign-box"><div class="sign-label">Authorised</div></div>
  <div class="sign-box"><div class="sign-label">${bill.plant} &mdash; Acknowledged</div></div>
</div>

<div class="footer">
  <span>Mulund West, Mumbai &nbsp;·&nbsp; +91 7977417014</span>
  <span>Generated: ${new Date().toLocaleString('en-IN')}</span>
</div>
</body>
</html>`;
};

module.exports = { generateChallanHTML, generateVendorBillHTML };
