// Generates PWA icons from an inline antler SVG. Re-run any time the mark changes:
//   node scripts/generate-pwa-icons.mjs
// NOTE: intentionally does NOT import './env.mjs' — pure asset generation must
// not require DB/API secrets (would needlessly fail CI/local runs).
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// Real palette tokens from app/globals.css (NOT the stale CLAUDE.md quick-ref):
const BG = '#1C2321' // deep-forest = app --background
const GOLD = '#D4B76D' // brass-light = the gold used for Score numerals
const OUT_DIR = path.join(process.cwd(), 'public', 'icons')

// Stylized symmetric buck antlers in a 100x100 space, drawn as strokes.
// Left side only; mirrored at render time across x=50.
const ANTLER_LEFT = [
  'M50 82 C 45 64, 40 52, 33 40 C 30 35, 26 29, 21 24', // main beam -> tip
  'M47 72 C 45 66, 43 63, 39 59', // brow tine
  'M43 57 C 45 51, 47 47, 48 41', // inner tine
  'M36 45 C 35 38, 33 33, 30 27', // mid tine
].join(' ')

function svg({ size, markScale, radius }) {
  const offset = (100 * (1 - markScale)) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect x="0" y="0" width="100" height="100" rx="${radius}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${markScale})" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="${ANTLER_LEFT}"/>
    <g transform="translate(100 0) scale(-1 1)"><path d="${ANTLER_LEFT}"/></g>
  </g>
</svg>`
}

async function render(name, opts) {
  const buf = Buffer.from(svg(opts))
  const out = path.join(OUT_DIR, name)
  await sharp(buf).png().toFile(out)
  console.log('wrote', out)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  // `any` icons: rounded bg, generous mark
  await render('icon-192.png', { size: 192, markScale: 0.92, radius: 22 })
  await render('icon-512.png', { size: 512, markScale: 0.92, radius: 22 })
  // maskable: full-bleed square (OS applies the mask), mark inside the safe zone
  await render('icon-512-maskable.png', { size: 512, markScale: 0.62, radius: 0 })
  // apple-touch: opaque square, iOS rounds it; mark generous
  await render('apple-touch-icon-180.png', { size: 180, markScale: 0.86, radius: 0 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
