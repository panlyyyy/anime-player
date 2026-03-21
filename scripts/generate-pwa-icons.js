#!/usr/bin/env node
/**
 * Generate PWA icons - logo play seperti di beranda (rounded box + triangle).
 * Run: node scripts/generate-pwa-icons.js
 */
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

async function drawPlayIcon(size) {
  const img = new Jimp({ width: size, height: size });
  const pad = Math.floor(size * 0.1);
  const r = Math.floor(size * 0.15);
  const bg = 0x6366f1ff;

  // Rounded rect background (simplified: fill then draw play triangle)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inRect = x >= pad && x < size - pad && y >= pad && y < size - pad;
      const inCorner =
        (x < pad + r && y < pad + r && (x - pad - r) ** 2 + (y - pad - r) ** 2 > r * r) ||
        (x >= size - pad - r && y < pad + r && (x - (size - pad - r)) ** 2 + (y - pad - r) ** 2 > r * r) ||
        (x < pad + r && y >= size - pad - r && (x - pad - r) ** 2 + (y - (size - pad - r)) ** 2 > r * r) ||
        (x >= size - pad - r && y >= size - pad - r && (x - (size - pad - r)) ** 2 + (y - (size - pad - r)) ** 2 > r * r);
      if (inRect && !inCorner) {
        img.setPixelColor(bg, x, y);
      }
    }
  }

  // Play triangle (center-left to center, pointing right)
  const cx = size / 2;
  const cy = size / 2;
  const w = size * 0.22;
  const h = size * 0.36;
  const x1 = cx - w;
  const x2 = cx + w * 0.3;
  const y1 = cy - h / 2;
  const y2 = cy + h / 2;
  for (let y = Math.floor(y1); y <= Math.ceil(y2); y++) {
    for (let x = Math.floor(x1); x <= Math.ceil(x2); x++) {
      if (x < pad || x >= size - pad || y < pad || y >= size - pad) continue;
      const nx = (x - x1) / (x2 - x1);
      const ny = (y - y1) / h;
      if (ny >= nx * 0.4 && ny >= (1 - nx) * 0.4 && ny <= 1 - nx * 0.4 && ny <= 1 - (1 - nx) * 0.4) {
        img.setPixelColor(0xffffffff, x, y);
      }
    }
  }
  return img;
}

function writeAsync(img, filepath) {
  return new Promise((resolve, reject) => {
    img.write(filepath, (err) => (err ? reject(err) : resolve()));
  });
}

(async () => {
  const i192 = await drawPlayIcon(192);
  const i512 = await drawPlayIcon(512);
  await writeAsync(i192, path.join(OUT, 'icon-192.png'));
  await writeAsync(i512, path.join(OUT, 'icon-512.png'));
  console.log('Icons saved to public/icons/icon-192.png and icon-512.png');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
