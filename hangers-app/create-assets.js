#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// CREATE PLACEHOLDER ASSETS — Run this once to generate required image files
// Usage: node create-assets.js
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'src', 'assets');

// Create src/assets if it doesn't exist
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Minimal valid 1x1 blue PNG (base64 encoded)
// This is a tiny but 100% valid PNG file — Expo just needs SOMETHING there
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const files = {
  'icon.png':          TINY_PNG_BASE64,
  'splash.png':        TINY_PNG_BASE64,
  'adaptive-icon.png': TINY_PNG_BASE64,
};

let created = 0;
for (const [filename, b64] of Object.entries(files)) {
  const fullPath = path.join(assetsDir, filename);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, Buffer.from(b64, 'base64'));
    console.log(`✅ Created: src/assets/${filename}`);
    created++;
  } else {
    console.log(`⏭  Already exists: src/assets/${filename}`);
  }
}

console.log(`\n🎉 Done! ${created} file(s) created in src/assets/`);
console.log('\nNext step: run "npm start" to launch the app.');
