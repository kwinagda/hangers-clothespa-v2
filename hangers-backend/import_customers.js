// ─────────────────────────────────────────────────────────────────────────────
// HANGERS — Customer Import Script (Full)
// Run: node import_customers.js
// Optional flag: node import_customers.js --reset-balances
// ─────────────────────────────────────────────────────────────────────────────

const { PrismaClient } = require('@prisma/client');
const fs   = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const RESET_BALANCES = process.argv.includes('--reset-balances');

function parseCSV(content) {
  const lines  = content.split('\n').filter(l => l.trim());
  const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const c of line) {
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    vals.push(cur.trim());
    const obj = {};
    header.forEach((h, i) => obj[h] = vals[i] ?? '');
    return obj;
  });
}

function parseDate(str) {
  if (!str || !str.trim()) return null;
  try {
    const d = new Date(str.trim());
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function parseFloat2(str) {
  if (!str || !str.trim()) return 0;
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

async function main() {
  const csvPath = path.join(__dirname, 'exportuserInfos.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows    = parseCSV(content);

  console.log(`\n📋 Total rows in CSV: ${rows.length}`);
  console.log(`💰 Balance mode: ${RESET_BALANCES ? 'RESET TO 0' : 'IMPORT FROM CSV'}\n`);

  let imported = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    const countryCode  = (row['Country Code*'] || '').trim();
    const mobile       = (row['Mobile Number*'] || '').trim();
    const name         = (row['Name*'] || '').trim();
    const dob          = parseDate(row['Dob']);
    const walletAmount = RESET_BALANCES ? 0 : parseFloat2(row['Wallet Amount']);
    const ordersDue    = RESET_BALANCES ? 0 : parseFloat2(row['Orders Due']);

    const addressParts = [
      row['AddressLine'],
      row['Address'],
      row['Area'],
      row['City'],
      row['Zip Code'],
    ].map(s => (s || '').trim()).filter(Boolean);
    const address = addressParts.join(', ') || null;

    if (countryCode !== '+91') { skipped++; continue; }
    if (mobile.length !== 10 || mobile === '0000000000' || mobile === '0000000001') { skipped++; continue; }

    const phone = `+91${mobile}`;

    try {
      const customer = await prisma.customer.upsert({
        where:  { phone },
        update: {
          name:          name || undefined,
          dob:           dob || undefined,
          walletBalance: walletAmount,
          ordersDue:     ordersDue,
        },
        create: {
          phone,
          name:          name || null,
          dob:           dob || null,
          walletBalance: walletAmount,
          ordersDue:     ordersDue,
          isActive:      true,
        },
      });

      if (address) {
        const existing = await prisma.customerAddress.findFirst({
          where: { customerId: customer.id }
        });
        if (!existing) {
          await prisma.customerAddress.create({
            data: {
              customerId: customer.id,
              label:      'Home',
              address,
              isDefault:  true,
            }
          });
        }
      }

      imported++;
      if (imported % 50 === 0) console.log(`  ✅ Imported ${imported} customers...`);

    } catch (err) {
      console.error(`  ❌ Error for ${phone}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`✅ Imported:  ${imported}`);
  console.log(`⏭️  Skipped:   ${skipped}`);
  console.log(`❌ Errors:    ${errors}`);
  console.log(`─────────────────────────────────────\n`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
