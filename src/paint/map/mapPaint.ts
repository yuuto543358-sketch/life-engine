/**
 * 世界地図の下絵（上から見た水彩の古地図）。羊皮紙・海・島・山脈・森・川・湖を描く。
 * 座標は 400 × 420 の地図の単位。場所の印や名前は、この上に別に重ねる。
 */
import { fbm, hex, mix, noise2, rgba, rng, shade, type Ctx, type RGB } from '../core';
import type { PaintJob } from '../scheduler';
import { brush, deform, ellipse, glow, P, spline, wash, type Pt } from '../watercolor';
import { dab, paperGrain } from '../world/brushes';

export const MAP_W = 400;
export const MAP_H = 420;

/** 島の輪郭（ゆるやかな形。描くときに揺らして海岸線にする） */
const ISLAND: [number, number][] = [
  [40, 120], [70, 86], [140, 72], [200, 80], [270, 70], [350, 88], [374, 140], [388, 200], [380, 250], [386, 300], [370, 360], [330, 390], [282, 390], [220, 394], [170, 398], [120, 386], [60, 376], [26, 340], [24, 280], [30, 230], [16, 170],
];

export const MAP_RIVER: { x: number; y: number }[] = [
  { x: 210, y: 96 },
  { x: 206, y: 130 },
  { x: 230, y: 168 },
  { x: 222, y: 210 },
  { x: 196, y: 246 },
  { x: 178, y: 290 },
  { x: 186, y: 330 },
  { x: 206, y: 372 },
  { x: 204, y: 402 },
];

export const MAP_LAKE = { x: 112, y: 300, rx: 26, ry: 12 };

const PARCHMENT: RGB = hex('#efe4cb');
const INK: RGB = hex('#5a4a36');

function* paintParchment(ctx: Ctx): PaintJob {
  const r = rng(11);
  ctx.fillStyle = rgba(PARCHMENT);
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  // 紙のしみと焼け（縁ほど濃い）
  const g = ctx.createRadialGradient(MAP_W / 2, MAP_H / 2, 80, MAP_W / 2, MAP_H / 2, 300);
  g.addColorStop(0, 'rgba(255,250,235,0.35)');
  g.addColorStop(1, 'rgba(150,110,60,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  for (let i = 0; i < 14; i++) {
    wash(ctx, ellipse(r() * MAP_W, r() * MAP_H, 20 + r() * 60, 14 + r() * 40, 9, r), hex('#c9a874'), r, { layers: 8, alpha: 0.025, variance: 0.9 });
  }
  yield;
}

function* paintSea(ctx: Ctx): PaintJob {
  const r = rng(12);
  const sea = hex('#9fb9b2');
  // 島のまわりの浅瀬 → 外の海（縁に向かって薄く）
  const coast = deform(ISLAND.map(([x, y]) => P(x, y, 0.6)), 3, 0.18, r);
  const outer = coast.map((p) => P(MAP_W / 2 + (p.x - MAP_W / 2) * 1.12, MAP_H / 2 + (p.y - MAP_H / 2) * 1.1, 1));
  wash(ctx, outer, sea, r, { layers: 22, alpha: 0.05, variance: 0.25, edge: 0.4, texture: 0.4, textureScale: 6 });
  yield;
  // 海岸に沿った波の線（古地図の描き方）
  ctx.lineWidth = 0.5;
  for (let k = 1; k <= 4; k++) {
    const f = 1 + k * 0.026;
    ctx.strokeStyle = rgba(shade(sea, -0.3), 0.32 - k * 0.06);
    ctx.beginPath();
    coast.forEach((p, i) => {
      const x = MAP_W / 2 + (p.x - MAP_W / 2) * f + (r() - 0.5) * 0.6;
      const y = MAP_H / 2 + (p.y - MAP_H / 2) * f + (r() - 0.5) * 0.6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  yield;
  // 島
  wash(ctx, coast, hex('#d3d3ae'), r, { layers: 20, alpha: 0.08, variance: 0.06, opaque: 0.85, gradientTo: hex('#bfc69a'), edge: 0.9, texture: 0.6, textureScale: 5 });
  // 海岸線のペン
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  coast.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  yield;
}

/** 上から見た山（古地図の山の印を水彩で） */
function mountain(ctx: Ctx, x: number, y: number, s: number, r: () => number) {
  const peak = { x: x + (r() - 0.5) * 3, y: y - 22 * s };
  const left = { x: x - 20 * s, y: y };
  const right = { x: x + 20 * s, y: y };
  const shadowSide: Pt[] = [P(peak.x, peak.y, 0.1), P(right.x, right.y, 0.3), P(x + 2 * s, y, 0.3)];
  const litSide: Pt[] = [P(peak.x, peak.y, 0.1), P(x + 2 * s, y, 0.3), P(left.x, left.y, 0.3)];
  wash(ctx, litSide, hex('#cbc4a4'), r, { layers: 6, alpha: 0.16, variance: 0.08, opaque: 0.7 });
  wash(ctx, shadowSide, hex('#958c6c'), r, { layers: 6, alpha: 0.16, variance: 0.08, opaque: 0.7 });
  // 雪
  wash(ctx, [P(peak.x, peak.y - 0.5, 0.1), P(peak.x + 5 * s, peak.y + 6 * s, 0.4), P(peak.x - 4 * s, peak.y + 7 * s, 0.4)], hex('#f6f2e6'), r, { layers: 5, alpha: 0.2, variance: 0.2 });
  // 稜線と陰影の線（ハッチング）
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(peak.x, peak.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = rgba(INK, 0.35);
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const ax = peak.x + (right.x - peak.x) * t;
    const ay = peak.y + (right.y - peak.y) * t;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 4 * s * (1 - t * 0.4), ay + 3 * s);
    ctx.stroke();
  }
}

/** 上から見た木の印 */
function treeMark(ctx: Ctx, x: number, y: number, s: number, kind: number, color: RGB, r: () => number) {
  if (kind === 1) {
    ctx.fillStyle = rgba(shade(color, -0.15), 0.9);
    ctx.beginPath();
    ctx.moveTo(x, y - 8 * s);
    ctx.lineTo(x + 3.6 * s, y);
    ctx.lineTo(x - 3.6 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.4;
    ctx.stroke();
  } else {
    dab(ctx, x, y - 4 * s, 3.6 * s, 3.4 * s, color, 0.9, r, 0.3);
    dab(ctx, x - 1 * s, y - 5 * s, 1.8 * s, 1.6 * s, mix(color, [255, 245, 210], 0.3), 0.7, r, 0.3);
    ctx.strokeStyle = rgba(INK, 0.45);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.arc(x, y - 4 * s, 3.4 * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 1.6 * s);
  ctx.stroke();
}

export interface MapEnv {
  trees: number;
  leaves: string[];
}

export function* paintMap(ctx: Ctx, env: MapEnv): PaintJob {
  yield* paintParchment(ctx);
  yield* paintSea(ctx);
  const r = rng(13);
  // 平野の色むら（草地と畑）
  for (let i = 0; i < 9; i++) {
    const x = 60 + r() * 290;
    const y = 150 + r() * 220;
    wash(ctx, ellipse(x, y, 20 + r() * 34, 12 + r() * 20, 9, r), r() < 0.5 ? hex('#b9c28c') : hex('#d9cf9e'), r, { layers: 8, alpha: 0.05, variance: 0.6 });
  }
  yield;
  // 原生域の山脈
  const ridge: [number, number, number][] = [];
  for (let x = 66; x < 360; x += 17 + r() * 8) ridge.push([x, 116 + Math.sin(x * 0.05) * 6 + r() * 6, 0.85 + r() * 0.35]);
  for (let x = 80; x < 340; x += 26 + r() * 10) ridge.push([x + 8, 100 + r() * 6, 0.65 + r() * 0.25]);
  ridge.sort((a, b) => a[1] - b[1]);
  for (const [x, y, s] of ridge) mountain(ctx, x, y, s, r);
  yield;
  // 川と湖
  const line = spline(MAP_RIVER, 10);
  brush(ctx, line.map((p) => P(p.x, p.y)), 5.5, hex('#8fb1ad'), r, { alpha: 0.75, bristles: 7, taper: -0.6 });
  brush(ctx, line.map((p) => P(p.x - 0.6, p.y)), 1.2, hex('#e6efe9'), r, { alpha: 0.4, bristles: 2, taper: 0 });
  ctx.strokeStyle = rgba(INK, 0.45);
  ctx.lineWidth = 0.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    line.forEach((p, i) => {
      const w = 2.4 + (i / line.length) * 2.6;
      i === 0 ? ctx.moveTo(p.x + side * w, p.y) : ctx.lineTo(p.x + side * w, p.y);
    });
    ctx.stroke();
  }
  const { x: lx, y: ly, rx, ry } = MAP_LAKE;
  wash(ctx, ellipse(lx, ly, rx, ry, 16, r, 0.3), hex('#9fbfba'), r, { layers: 12, alpha: 0.12, variance: 0.08, opaque: 0.7, edge: 0.8 });
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.beginPath();
  ctx.ellipse(lx, ly, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  yield;
  // 自然域の森（木の印の集まり。暮らしの記録が増えるほど広がる）
  const tr = rng(31);
  const count = Math.min(60, 18 + env.trees);
  const marks: [number, number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = tr() * Math.PI * 2;
    const d = Math.sqrt(tr());
    const x = 92 + Math.cos(a) * d * 62 + fbm(i * 0.3, 1, 2) * 8;
    const y = 206 + Math.sin(a) * d * 34;
    marks.push([x, y, tr() < 0.45 ? 1 : 0, 0.8 + tr() * 0.4]);
  }
  marks.sort((a, b) => a[1] - b[1]);
  const leaf = env.leaves.map(hex);
  for (const [i, [x, y, k, s]] of marks.entries()) treeMark(ctx, x, y, s, k, k === 1 ? hex('#3f5a46') : leaf[i % leaf.length], tr);
  yield;
  // 経線・緯線（ごく薄く）
  ctx.strokeStyle = rgba(INK, 0.08);
  ctx.lineWidth = 0.4;
  for (let x = 40; x < MAP_W; x += 60) {
    ctx.beginPath();
    for (let y = 20; y <= MAP_H - 20; y += 10) ctx.lineTo(x + noise2(x, y * 0.02) * 1.2, y);
    ctx.stroke();
  }
  for (let y = 40; y < MAP_H; y += 60) {
    ctx.beginPath();
    for (let x = 20; x <= MAP_W - 20; x += 10) ctx.lineTo(x, y + noise2(x * 0.02, y) * 1.2);
    ctx.stroke();
  }
  // 縁の飾り罫
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 1.1;
  ctx.strokeRect(9, 9, MAP_W - 18, MAP_H - 18);
  ctx.lineWidth = 0.4;
  ctx.strokeRect(13, 13, MAP_W - 26, MAP_H - 26);
  // 方位の飾り（羅針図）
  compass(ctx, 352, 58);
  glow(ctx, MAP_W / 2, MAP_H / 2, 260, hex('#fff8e6'), 0.06);
  paperGrain(ctx, 0, 0, MAP_W, MAP_H, r, 0.8, 1.2);
}

function compass(ctx: Ctx, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const l = i % 4 === 0 ? 20 : i % 2 === 0 ? 14 : 10;
    const w = i % 4 === 0 ? 3 : 1.6;
    const tip = [Math.cos(a - Math.PI / 2) * l, Math.sin(a - Math.PI / 2) * l];
    const l1 = [Math.cos(a - Math.PI / 2 + Math.PI / 2) * w, Math.sin(a - Math.PI / 2 + Math.PI / 2) * w];
    ctx.fillStyle = i % 2 === 0 ? rgba(hex('#b08a3e'), 0.85) : rgba(INK, 0.55);
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(l1[0], l1[1]);
    ctx.lineTo(-l1[0], -l1[1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = rgba(PARCHMENT);
  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
