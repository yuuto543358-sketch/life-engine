/**
 * 水彩の描き方。
 * 形の輪郭を少しずつ崩した半透明の層を何十枚も重ねることで、にじみ・ムラ・縁の濃さを表す。
 * （多角形の辺を再帰的に揺らす方法。層ごとに違う揺らぎを与えると、紙に絵の具が広がったような縁になる）
 */
import { fbm, gauss, makeCanvas, rgba, shade, type Ctx, type RGB, type Rng } from './core';

export interface Pt {
  x: number;
  y: number;
  /** この頂点まわりの揺らぎの強さ */
  v: number;
}

export const P = (x: number, y: number, v = 1): Pt => ({ x, y, v });

/** 辺の中点を、辺の長さに比例した量だけ揺らして増やす（depth 回くり返す） */
export function deform(poly: Pt[], depth: number, variance: number, r: Rng, decay = 0.6): Pt[] {
  let pts = poly;
  let amt = variance;
  for (let d = 0; d < depth; d++) {
    const out: Pt[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      out.push(a);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const v = (a.v + b.v) / 2;
      out.push({ x: (a.x + b.x) / 2 + gauss(r) * len * amt * v * 0.5, y: (a.y + b.y) / 2 + gauss(r) * len * amt * v * 0.5, v: v * (0.85 + r() * 0.3) });
    }
    pts = out;
    amt *= decay;
  }
  return pts;
}

export function fillPoly(ctx: Ctx, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

export interface WashOptions {
  /** 重ねる層の数（多いほどなめらかで深い） */
  layers?: number;
  /** 1層の不透明度 */
  alpha?: number;
  /** 輪郭の揺らぎ */
  variance?: number;
  /** 縁にたまる絵の具（濃い線）の強さ 0〜1 */
  edge?: number;
  /** 紙の目に残る粒状のムラ 0〜1 */
  granulation?: number;
  /** 上下で色を変える（上 → 下） */
  gradientTo?: RGB;
  /** 塗りの合成方法 */
  blend?: GlobalCompositeOperation;
  /** 先に、もとの形を下塗りする（0〜1）。後ろの層が透けないようにするため */
  opaque?: number;
  /** 面の中の顔料のムラ（大きな濃淡）0〜1 */
  texture?: number;
  /** ムラの細かさ（大きいほど細かい） */
  textureScale?: number;
}

function bbox(pts: Pt[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/**
 * 水彩のひと塗り。形（多角形）を、揺らいだ半透明の層の重なりとして描く。
 * 一度別のキャンバスに描いてから重ねるので、粒状のムラが下の絵を削らない。
 */
export function wash(ctx: Ctx, shape: Pt[], color: RGB, r: Rng, o: WashOptions = {}) {
  const layers = o.layers ?? 36;
  const alpha = o.alpha ?? 0.045;
  const variance = o.variance ?? 0.9;
  const base = deform(shape, 4, variance, r);
  const bb = bbox(base);
  const pad = (Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) || 10) * 0.18 + 6;
  const ox = bb.x0 - pad;
  const oy = bb.y0 - pad;
  const w = bb.x1 - bb.x0 + pad * 2;
  const h = bb.y1 - bb.y0 + pad * 2;
  // 描き先の拡大率に合わせて下書き用キャンバスの解像度を決める（ぼやけないように）
  const k = scaleOf(ctx);
  const { canvas, ctx: c } = makeCanvas(w * k, h * k);
  c.scale(k, k);
  c.translate(-ox, -oy);
  if (o.gradientTo) {
    const g = c.createLinearGradient(0, bb.y0, 0, bb.y1);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(o.gradientTo, alpha));
    c.fillStyle = g;
  } else c.fillStyle = rgba(color, alpha);
  if (o.opaque) {
    const fill = c.fillStyle;
    if (o.gradientTo) {
      const g = c.createLinearGradient(0, bb.y0, 0, bb.y1);
      g.addColorStop(0, rgba(color, o.opaque));
      g.addColorStop(1, rgba(o.gradientTo, o.opaque));
      c.fillStyle = g;
    } else c.fillStyle = rgba(color, o.opaque);
    fillPoly(c, deform(base, 1, variance * 0.2, r));
    c.fillStyle = fill;
  }
  for (let i = 0; i < layers; i++) {
    fillPoly(c, deform(base, 3, variance * 0.55, r));
  }
  // 面の中のムラ（ゆっくり変わる濃淡を、低い解像度のノイズで乗せる）
  if (o.texture) {
    const step = 6;
    const nw = Math.max(2, Math.ceil((w * k) / step));
    const nh = Math.max(2, Math.ceil((h * k) / step));
    const { canvas: tc, ctx: tx } = makeCanvas(nw, nh);
    const img = tx.createImageData(nw, nh);
    const fx = r() * 100;
    const fy = r() * 100;
    const sc = (o.textureScale ?? 1) * 0.011;
    const dark = shade(o.gradientTo ?? color, -0.35);
    const light = shade(color, 0.3);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const wx = ox + ((x * step) / k);
        const wy = oy + ((y * step) / k);
        const v = fbm(wx * sc + fx, wy * sc * 1.6 + fy, 4);
        const col = v > 0 ? dark : light;
        const a = Math.min(1, Math.abs(v) * 1.6) * o.texture * 0.55;
        const i = (y * nw + x) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = a * 255;
      }
    }
    tx.putImageData(img, 0, 0);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.imageSmoothingEnabled = true;
    c.drawImage(tc, 0, 0, nw * step, nh * step);
    c.restore();
  }
  // 縁にたまる絵の具
  if (o.edge) {
    c.strokeStyle = rgba(o.gradientTo ?? color, 0.05 * o.edge);
    c.lineWidth = 1.1;
    for (let i = 0; i < 6; i++) {
      const p = deform(base, 2, variance * 0.3, r);
      c.beginPath();
      c.moveTo(p[0].x, p[0].y);
      for (const q of p) c.lineTo(q.x, q.y);
      c.closePath();
      c.stroke();
    }
  }
  // 紙の目に残る粒状のムラ（少しだけ色を抜く）
  if (o.granulation) {
    c.globalCompositeOperation = 'destination-out';
    const area = (bb.x1 - bb.x0) * (bb.y1 - bb.y0);
    const n = Math.min(6000, Math.floor(area / 18) * o.granulation);
    for (let i = 0; i < n; i++) {
      c.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`;
      const s = (0.6 + r() * 1.6) / Math.max(1, k * 0.7);
      c.fillRect(bb.x0 + r() * (bb.x1 - bb.x0), bb.y0 + r() * (bb.y1 - bb.y0), s, s);
    }
    c.globalCompositeOperation = 'source-over';
  }
  const prev = ctx.globalCompositeOperation;
  if (o.blend) ctx.globalCompositeOperation = o.blend;
  ctx.drawImage(canvas, ox, oy, w, h);
  ctx.globalCompositeOperation = prev;
}

/** 描き先の拡大率（変換行列の大きさ） */
export function scaleOf(ctx: Ctx): number {
  if (typeof ctx.getTransform !== 'function') return 1;
  const m = ctx.getTransform();
  return Math.max(0.05, Math.hypot(m.a, m.b));
}

/** 楕円を多角形にする（水彩の元の形として使う） */
export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 12, r?: Rng, v = 1): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = r ? 0.85 + r() * 0.3 : 1;
    return P(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, v);
  });
}

/**
 * 筆の線。筆先の毛（細い線）を何本も重ねて、かすれと太さの変化を出す。
 * width は太さ、taper は終わりに向けて細くする割合。
 */
export function brush(ctx: Ctx, pts: { x: number; y: number }[], width: number, color: RGB, r: Rng, opts: { alpha?: number; bristles?: number; taper?: number } = {}) {
  const bristles = opts.bristles ?? Math.max(3, Math.round(width * 1.4));
  const alpha = opts.alpha ?? 0.5;
  const taper = opts.taper ?? 0.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let b = 0; b < bristles; b++) {
    const off = (b / Math.max(1, bristles - 1) - 0.5) * width;
    const jitter = (r() - 0.5) * width * 0.3;
    ctx.strokeStyle = rgba(color, alpha * (0.35 + r() * 0.65));
    ctx.lineWidth = Math.max(0.4, (width / bristles) * (1 + r()));
    ctx.beginPath();
    const len = pts.length;
    for (let i = 0; i < len; i++) {
      const p = pts[i];
      const q = pts[Math.min(len - 1, i + 1)];
      const pp = pts[Math.max(0, i - 1)];
      const dx = q.x - pp.x;
      const dy = q.y - pp.y;
      const d = Math.hypot(dx, dy) || 1;
      const t = i / Math.max(1, len - 1);
      const k = 1 - taper * t;
      const x = p.x + (-dy / d) * (off * k + jitter);
      const y = p.y + (dx / d) * (off * k + jitter);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // かすれ: ときどき毛を途中で止める
    if (r() < 0.85) ctx.stroke();
  }
}

/** 点の列をなめらかな曲線にする（Catmull-Rom） */
export function spline(points: { x: number; y: number }[], steps = 8): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** 柔らかい光や影（にじんだ円） */
export function glow(ctx: Ctx, x: number, y: number, radius: number, color: RGB, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
