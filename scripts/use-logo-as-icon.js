#!/usr/bin/env node
/**
 * Resize PANLYYY logo to PWA icon sizes (192x192, 512x512).
 * Run: node scripts/use-logo-as-icon.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const LOGO = path.join(__dirname, '..', 'assets', 'panlyyy-logo.png');
const OUT = path.join(__dirname, '..', 'public', 'icons');

async function main() {
  if (!fs.existsSync(LOGO)) {
    console.error('Logo not found at:', LOGO);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const meta = await sharp(LOGO).metadata();
  const sz = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - sz) / 2);
  const top = Math.floor((meta.height - sz) / 2);

  const pipeline = sharp(LOGO)
    .extract({ left, top, width: sz, height: sz });

  await pipeline.clone().resize(192, 192).toFile(path.join(OUT, 'icon-192.png'));
  await pipeline.clone().resize(512, 512).toFile(path.join(OUT, 'icon-512.png'));
  console.log('Icons saved to public/icons/');
}

main().catch(e => { console.error(e); process.exit(1); });
