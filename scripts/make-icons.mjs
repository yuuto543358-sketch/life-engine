// アイコンの PNG を public/icon.svg から生成する（開発用。Playwright を使用）
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['apple-touch-icon.png', 180, true],
  ['icon-512-maskable.png', 512, true],
];
for (const [name, size, fullBleed] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = fullBleed ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: !fullBleed, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons generated');
