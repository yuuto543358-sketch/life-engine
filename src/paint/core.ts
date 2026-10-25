/**
 * 絵を描くための基本道具（乱数の種・ノイズ・色）。
 * 乱数は必ず「種」から作る。同じ種なら同じ絵になる（世界の状態と同じく、絵も決まった結果になる）。
 */

export type Rng = () => number;

export function rng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 文字列から種を作る（FNV-1a） */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 正規分布に近い乱数（平均0・標準偏差1） */
export function gauss(r: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (t: number) => t * t * (3 - 2 * t);

// ---------- 値ノイズ（なめらかな揺らぎ。風や質感に使う） ----------
const PERM = (() => {
  const r = rng(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return [...p, ...p];
})();
const GRAD = Array.from({ length: 256 }, (_, i) => {
  const a = (PERM[i] / 256) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
});

/** 2次元のパーリンノイズ（-1〜1 程度） */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const v = GRAD[PERM[ix + PERM[iy]] & 255];
    return v[0] * dx + v[1] * dy;
  };
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const n00 = g(xi, yi, xf, yf);
  const n10 = g(xi + 1, yi, xf - 1, yf);
  const n01 = g(xi, yi + 1, xf, yf - 1);
  const n11 = g(xi + 1, yi + 1, xf - 1, yf - 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.4;
}

/** 重ね合わせたノイズ（細かい揺らぎを含む） */
export function fbm(x: number, y: number, oct = 4): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    f *= 2;
    a *= 0.5;
  }
  return s;
}

// ---------- 色 ----------
export type RGB = [number, number, number];

export function hex(h: string): RGB {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function rgba(c: RGB, a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

/** 明るさを変える（t > 0 で白へ、t < 0 で黒へ） */
export function shade(c: RGB, t: number): RGB {
  return t >= 0 ? mix(c, [255, 255, 255], t) : mix(c, [0, 0, 0], -t);
}

/** 色を少しずらす（同じ色でも筆ごとにわずかに違う） */
export function jitter(c: RGB, r: Rng, amount = 10): RGB {
  return [c[0] + (r() - 0.5) * amount, c[1] + (r() - 0.5) * amount, c[2] + (r() - 0.5) * amount];
}

// ---------- キャンバス ----------
export type Canvas2D = HTMLCanvasElement | OffscreenCanvas;
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { canvas: Canvas2D; ctx: Ctx } {
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  if (typeof OffscreenCanvas !== 'undefined') {
    const off = new OffscreenCanvas(W, H);
    const c = off.getContext('2d') as Ctx | null;
    if (c) return { canvas: off, ctx: c };
  }
  // OffscreenCanvas で絵が描けない古い環境では、ふつうのキャンバスを使う
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as Ctx;
  return { canvas, ctx };
}
