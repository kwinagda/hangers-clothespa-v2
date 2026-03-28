// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP OTP DIAGNOSTIC TEST
// Run from your hangers-backend folder:
//   node test-whatsapp.js 9876543210
//
// This tests your WhatsApp API directly and shows the exact error if any
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const axios = require('axios');

const phone = process.argv[2];
if (!phone) {
  console.log('\n❌  Usage: node test-whatsapp.js <10-digit-phone>\n');
  console.log('   Example: node test-whatsapp.js 9876543210\n');
  process.exit(1);
}

console.log('\n════════════════════════════════════════════');
console.log('   HANGERS — WhatsApp OTP Diagnostic');
console.log('════════════════════════════════════════════\n');

// ── Step 1: Check .env values ─────────────────────────────────────────────────
console.log('📋 STEP 1 — Checking .env variables...\n');

const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
const accessToken   = process.env.META_WA_ACCESS_TOKEN;
const templateName  = process.env.META_WA_OTP_TEMPLATE || 'hangers_otp';

const checks = [
  { key: 'META_WA_PHONE_NUMBER_ID', val: phoneNumberId },
  { key: 'META_WA_ACCESS_TOKEN',    val: accessToken   },
  { key: 'META_WA_OTP_TEMPLATE',    val: templateName  },
];

let envOk = true;
for (const c of checks) {
  if (!c.val || c.val.startsWith('YOUR_')) {
    console.log(`   ❌  ${c.key} = NOT SET or placeholder`);
    envOk = false;
  } else {
    const display = c.key === 'META_WA_ACCESS_TOKEN'
      ? c.val.slice(0, 10) + '...' + c.val.slice(-6)
      : c.val;
    console.log(`   ✅  ${c.key} = ${display}`);
  }
}

if (!envOk) {
  console.log('\n❌  Fix your .env file first, then re-run this test.\n');
  process.exit(1);
}

// ── Step 2: Format phone ──────────────────────────────────────────────────────
const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
const waPhone = cleaned.length === 10 ? `91${cleaned}` : cleaned;
console.log(`\n📱 STEP 2 — Phone number formatting`);
console.log(`   Input:    ${phone}`);
console.log(`   For WA:   ${waPhone} (should be 91XXXXXXXXXX, 12 digits)`);
if (waPhone.length !== 12) {
  console.log(`   ⚠️  Warning: expected 12-digit number, got ${waPhone.length} digits`);
}

// ── Step 3: Attempt to send OTP ───────────────────────────────────────────────
console.log(`\n🚀 STEP 3 — Sending test OTP to ${waPhone}...\n`);

const testOtp = '123456';

// Try both language codes — en_US is more commonly correct for approved templates
const langCodesToTry = ['en_US', 'en'];

async function tryPayload(langCode) {
  const payload = {
    messaging_product: 'whatsapp',
    to:   waPhone,
    type: 'template',
    template: {
      name:     templateName,
      language: { code: langCode },
      components: [
        {
          type:       'body',
          parameters: [{ type: 'text', text: testOtp }],
        },
      ],
    },
  };

  console.log(`   Trying language code: "${langCode}"...`);
  console.log(`   Payload:\n${JSON.stringify(payload, null, 4)}\n`);

  const response = await axios.post(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    payload,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
    }
  );

  return response.data;
}

(async () => {
  let lastError = null;

  for (const lang of langCodesToTry) {
    try {
      const result = await tryPayload(lang);
      console.log('\n════════════════════════════════════════════');
      console.log('   ✅  SUCCESS! OTP sent via WhatsApp');
      console.log('════════════════════════════════════════════');
      console.log(`\n   Message ID: ${result.messages?.[0]?.id}`);
      console.log(`   Language code that worked: "${lang}"`);
      console.log(`\n💡 ACTION: Open whatsapp-otp.service.js and change`);
      console.log(`   language: { code: 'en' }  →  language: { code: '${lang}' }\n`);
      return;
    } catch (err) {
      lastError = err;
      const errData = err.response?.data?.error;
      if (errData) {
        console.log(`   ❌  Error with "${lang}":`);
        console.log(`       Code:    ${errData.code}`);
        console.log(`       Message: ${errData.message}`);
        console.log(`       FBTrace: ${errData.fbtrace_id || 'N/A'}`);
        console.log('');
      } else {
        console.log(`   ❌  Network/other error: ${err.message}\n`);
      }
    }
  }

  // Both failed — analyse the error
  console.log('\n════════════════════════════════════════════');
  console.log('   ❌  FAILED — Here\'s what the error means:');
  console.log('════════════════════════════════════════════\n');

  const errData = lastError?.response?.data?.error;
  const errCode = errData?.code;
  const errMsg  = errData?.message || lastError?.message || 'Unknown';

  console.log(`   Error: ${errMsg}\n`);

  // Common error codes explained
  const explanations = {
    131030: '📵  Recipient phone number is not on WhatsApp, or cannot receive messages.',
    131047: '📵  Re-engagement window expired. Customer must message you first on WA Business.',
    131049: '🚫  Message blocked — this number has opted out.',
    132000: '📋  Template name or language code is wrong. Check your template name in Meta.',
    132001: '📋  Template does not exist or is not APPROVED yet.',
    132007: '📋  Template parameters mismatch. Wrong number of {{variables}}.',
    190:    '🔑  Access token is invalid, expired, or doesn\'t have permission.',
    100:    '❓  Invalid parameter — check your Phone Number ID.',
    4:      '⏱️   Rate limit hit. Wait a few minutes and try again.',
    368:    '🚫  Account temporarily blocked by Meta for policy violation.',
  };

  if (explanations[errCode]) {
    console.log(`   Cause: ${explanations[errCode]}\n`);
  }

  // Suggested fix
  console.log('   💡 SUGGESTED FIXES based on this error:');
  if (errCode === 132001 || errMsg.includes('template')) {
    console.log('   1. Go to business.facebook.com → WhatsApp Manager → Message Templates');
    console.log('   2. Find "hangers_otp" — check its STATUS is "APPROVED" (green)');
    console.log('   3. Note the exact LANGUAGE shown — use that code in the service');
    console.log('   4. If not approved, wait or re-submit the template\n');
  } else if (errCode === 190) {
    console.log('   1. Your access token has expired or is invalid');
    console.log('   2. Go to business.facebook.com → Settings → System Users');
    console.log('   3. Click your system user → Generate New Token');
    console.log('   4. Replace META_WA_ACCESS_TOKEN in your .env with the new token');
    console.log('   5. Restart backend: Ctrl+C then npm run dev\n');
  } else if (errCode === 131030 || errCode === 131047) {
    console.log('   1. The phone number you tested may not have WhatsApp');
    console.log('   2. Or: In test mode, Meta only sends to VERIFIED TEST NUMBERS');
    console.log('   3. Go to: developers.facebook.com → Your App → WhatsApp → API Setup');
    console.log('   4. Under "To", add your number as a verified test recipient\n');
  } else if (errCode === 100) {
    console.log('   1. Your META_WA_PHONE_NUMBER_ID is likely wrong');
    console.log('   2. Go to: developers.facebook.com → Your App → WhatsApp → API Setup');
    console.log('   3. Copy the "Phone Number ID" (not the phone number itself!)');
    console.log('   4. It\'s a 15+ digit number like: 123456789012345\n');
  } else {
    console.log('   1. Check your .env META_WA_* values are correct');
    console.log('   2. Share the error message above with Claude for more help\n');
  }

})();
