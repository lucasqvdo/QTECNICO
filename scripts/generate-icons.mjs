import sharp from 'sharp';
import { existsSync } from 'fs';

const src = 'src/imports/ChatGPT_Image_8_de_jun._de_2026__11_15_09.png';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Ícones quadrados padrão
for (const size of sizes) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 26, g: 43, b: 78, alpha: 1 } })
    .png()
    .toFile(`public/icons/icon-${size}x${size}.png`);
  console.log(`✅ icon-${size}x${size}.png`);
}

// Apple touch icon (180×180)
await sharp(src)
  .resize(180, 180, { fit: 'contain', background: { r: 26, g: 43, b: 78, alpha: 1 } })
  .png()
  .toFile('public/icons/apple-touch-icon.png');
console.log('✅ apple-touch-icon.png');

// favicon 32×32
await sharp(src)
  .resize(32, 32, { fit: 'contain', background: { r: 26, g: 43, b: 78, alpha: 1 } })
  .png()
  .toFile('public/favicon-32x32.png');
console.log('✅ favicon-32x32.png');

// favicon 16×16
await sharp(src)
  .resize(16, 16, { fit: 'contain', background: { r: 26, g: 43, b: 78, alpha: 1 } })
  .png()
  .toFile('public/favicon-16x16.png');
console.log('✅ favicon-16x16.png');

// maskable icon 512×512 (com padding para área segura)
await sharp(src)
  .resize(410, 410, { fit: 'contain', background: { r: 26, g: 43, b: 78, alpha: 1 } })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 26, g: 43, b: 78, alpha: 1 } })
  .resize(512, 512)
  .png()
  .toFile('public/icons/icon-maskable-512x512.png');
console.log('✅ icon-maskable-512x512.png');

console.log('\n🎉 Todos os ícones gerados em public/icons/');
