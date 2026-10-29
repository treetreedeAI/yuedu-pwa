import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'dist/index.html',
  'dist/manifest.webmanifest',
  'dist/sw.js',
  'dist/icons/icon-192.png',
  'dist/icons/icon-512.png',
  'dist/icons/apple-touch-icon.png'
];

await Promise.all(requiredFiles.map((file) => access(file, constants.R_OK)));

const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
if (manifest.name !== '粵讀 Cantonese Reader' || manifest.display !== 'standalone') {
  throw new Error('PWA manifest is missing the expected name or standalone display mode.');
}

const assets = await readdir('dist/assets');
const workerAsset = assets.find((file) => file.includes('pdf.worker') && file.endsWith('.mjs'));
const pdfModule = assets.find((file) => file.startsWith('pdf-') && file.endsWith('.js'));
const jyutpingModule = assets.find((file) => file.startsWith('jyutping-') && file.endsWith('.js'));
if (!workerAsset || !pdfModule || !jyutpingModule) {
  throw new Error('A PDF.js or Jyutping offline asset was not emitted.');
}

const serviceWorker = await readFile('dist/sw.js', 'utf8');
const offlineAssets = [
  workerAsset,
  pdfModule,
  jyutpingModule,
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];
for (const asset of offlineAssets) {
  if (!serviceWorker.includes(asset)) {
    throw new Error(`${asset} is not included in the offline precache.`);
  }
}

console.log('Build check passed: PDF.js, Jyutping, worker, and install icons are precached.');
