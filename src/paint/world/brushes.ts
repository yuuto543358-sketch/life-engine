/**
 * 風景を描くための小さな筆づかい（安く何百回も使えるもの）。
 * 大きな面は watercolor.ts の wash（何十層も重ねる塗り）を使い、細かな質感はここの筆で足す。
 */
import { gauss, mix, rgba, type Ctx, type RGB, type Rng } from '../core';
import { deform, ellipse, fillPoly, P, type Pt } from '../watercolor';

/** 一度だけ置く、縁の揺らいだ絵の具の点（葉・花・草の固まり） */
export function dab(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: RGB, alpha: number, r: Rng, wobble = 0.5) {
  ctx.fillStyle = rgba(color, alpha);
  fillPoly(ctx, deform(ellipse(x, y, rx, ry, 7, r), 2, wobble, r));
}

/** 尾根の線（x0 から x1 まで、高さを関数で与える） */
export function ridge(x0: number, x1: number, step: number, f: (x: number) => number, v = 1): Pt[] {
  const out: Pt[] = [];
  for (let x = x0; x <= x1 + 0.01; x += step) out.push(P(x, f(x), v));
  return out;
}

/** 尾根の線の下を、指定した高さまで閉じた形にする */
export function closeDown(line: Pt[], bottom: number): Pt[] {
  const a = line[0];
  const b = line[line.length - 1];
  return [...line, P(b.x, bottom, 0.2), P(a.x, bottom, 0.2)];
}

/** 草の葉（細い筆の払い）。base から上へ、少し曲がりながら細くなる */
export function blade(ctx: Ctx, x: number, y: number, h: number, lean: number, color: RGB, alpha: number, width = 1) {
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h);
  ctx.stroke();
}

/** 紙の目（描いた部分にだけ、細かな濃淡を乗せる） */
export function paperGrain(ctx: Ctx, x0: number, y0: number, w: number, h: number, r: Rng, density = 1, strength = 1) {
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'source-atop';
  const n = Math.floor(((w * h) / 140) * density);
  for (let i = 0; i < n; i++) {
    const dark = r() < 0.5;
    ctx.fillStyle = dark ? `rgba(40,30,20,${(0.02 + r() * 0.04) * strength})` : `rgba(255,250,235,${(0.03 + r() * 0.05) * strength})`;
    const s = 0.5 + r() * 1.4;
    ctx.fillRect(x0 + r() * w, y0 + r() * h, s, s * (0.6 + r() * 0.8));
  }
  // 紙の繊維（ごく薄い短い線）
  ctx.lineWidth = 0.5;
  for (let i = 0; i < n / 30; i++) {
    const x = x0 + r() * w;
    const y = y0 + r() * h;
    const a = r() * Math.PI;
    const l = 2 + r() * 6;
    ctx.strokeStyle = `rgba(60,45,30,${0.04 * strength})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = prev;
}

/**
 * 夜や夕方の光を絵に焼き込む（乗算）。透明な部分には色を付けない。
 * amount 0 なら何もしない。
 */
export function multiplyTint(ctx: Ctx, canvas: { width: number; height: number }, tint: RGB, amount: number, copy: () => CanvasImageSource) {
  if (amount <= 0.001) return;
  const keep = copy();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = rgba(mix([255, 255, 255], tint, amount), 1);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 夜は色味そのものを月明かりの青へ寄せる（明るさは保つ）
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = rgba(tint, Math.min(0.6, amount * 0.7));
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(keep, 0, 0);
  ctx.restore();
}

/** 線をなぞりながら、点を一定の間隔で返す */
export function along(pts: { x: number; y: number }[], spacing: number): { x: number; y: number; nx: number; ny: number; t: number }[] {
  const out: { x: number; y: number; nx: number; ny: number; t: number }[] = [];
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    lens.push(l);
    total += l;
  }
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = lens[i] || 1;
    const dx = (b.x - a.x) / l;
    const dy = (b.y - a.y) / l;
    for (let d = (spacing - (acc % spacing)) % spacing; d < l; d += spacing) {
      out.push({ x: a.x + dx * d, y: a.y + dy * d, nx: -dy, ny: dx, t: (acc + d) / (total || 1) });
    }
    acc += l;
  }
  return out;
}

/** ばらつきのある正の値 */
export const vary = (r: Rng, base: number, spread: number) => Math.max(0, base + gauss(r) * spread);
