// Génération ponctuelle des icônes PWA depuis public/logo.svg.
// Usage (depuis la racine du projet) : node scripts/gen-icons.mjs
// sharp = devDependency (non requis au runtime). Les PNG produits sont commités ;
// relancer seulement si le logo change.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/logo.svg');
const paper = { r: 0xfb, g: 0xf7, b: 0xef, alpha: 1 }; // --color-paper

/** Icône carrée : logo centré sur fond papier, avec marge (zone de sécurité). */
async function gen(size, padRatio, name) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const logo = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: paper } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`public/${name}`);
  console.log('  ✓', name);
}

console.log('Génération des icônes PWA…');
await gen(192, 0.14, 'icon-192.png');
await gen(512, 0.14, 'icon-512.png');
await gen(512, 0.2, 'icon-maskable-512.png'); // marge plus large pour le format « maskable »
console.log('Terminé.');
