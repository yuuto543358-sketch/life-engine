/**
 * 世界の中に立つもの（木・拠点の建物・記念碑・灯籠・橋・雲・霧）を、1つずつ別のキャンバスに水彩で描く。
 * 描いた絵は「種類・段階・季節・光」ごとに使い回す。
 *
 * 座標: 各スプライトは「地面に接する点」を原点 (0, 0) とし、上をマイナスの y で描く（世界の単位）。
 */
import type { StructureKind } from '../../engine/world';
import { hex, makeCanvas, mix, rgba, rng, shade, type Ctx, type RGB, type Rng } from '../core';
import type { Flora, Light } from '../light';
import { brush, ellipse, glow, P, wash, type Pt } from '../watercolor';
import { blade, dab, multiplyTint } from './brushes';
import type { Img } from '../cache';
import { sunSide } from './backdrop';

export interface Sprite {
  canvas: Img;
  /** 世界の単位での大きさと、原点（地面の点）の位置 */
  w: number;
  h: number;
  ax: number;
  ay: number;
  /** 夜に灯る窓（原点からの位置、世界の単位） */
  lights: { x: number; y: number; r: number }[];
  /** 煙の出る煙突の先（spray は噴水・湧き水のしぶき） */
  smoke: { x: number; y: number; kind?: 'smoke' | 'spray' }[];
  /** 揺れる高さ（木の幹の割合など。0 なら揺れない） */
  sway: number;
}

export interface SpriteEnv {
  L: Light;
  F: Flora;
  /** 1 世界単位あたりの画素数 */
  px: number;
}

function makeSprite(w: number, h: number, ax: number, ay: number, env: SpriteEnv, draw: (ctx: Ctx, out: Sprite) => void, sway = 0): Sprite {
  const { canvas, ctx } = makeCanvas(w * env.px, h * env.px);
  const sprite: Sprite = { canvas, w, h, ax, ay, lights: [], smoke: [], sway };
  ctx.scale(env.px, env.px);
  ctx.translate(ax, ay);
  draw(ctx, sprite);
  // 時刻の光（夕方・夜の色）を焼き込む
  multiplyTint(ctx, canvas, env.L.ambient, env.L.ambientAmount, () => {
    const { canvas: copy, ctx: c2 } = makeCanvas(canvas.width, canvas.height);
    c2.drawImage(canvas, 0, 0);
    return copy;
  });
  return sprite;
}

/** 手描きのペンの線（少し揺れる線を2回なぞる） */
function ink(ctx: Ctx, pts: { x: number; y: number }[], r: Rng, color: RGB, alpha = 0.55, width = 0.7, closed = false) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = rgba(color, alpha * (pass ? 0.5 : 1));
    ctx.lineWidth = width * (pass ? 0.7 : 1);
    ctx.beginPath();
    const list = closed ? [...pts, pts[0]] : pts;
    list.forEach((p, i) => {
      const jx = (r() - 0.5) * 0.5;
      const jy = (r() - 0.5) * 0.5;
      if (i === 0) ctx.moveTo(p.x + jx, p.y + jy);
      else {
        const prev = list[i - 1];
        // 長い辺は途中に少し揺れを入れる
        const mx = (prev.x + p.x) / 2 + (r() - 0.5) * 0.6;
        const my = (prev.y + p.y) / 2 + (r() - 0.5) * 0.6;
        ctx.quadraticCurveTo(mx, my, p.x + jx, p.y + jy);
      }
    });
    ctx.stroke();
  }
}

/** 形の塗り（建物用: 揺らぎを小さく、しっかり塗る） */
function fill(ctx: Ctx, pts: Pt[], color: RGB, r: Rng, o: { to?: RGB; texture?: number; edge?: number } = {}) {
  wash(ctx, pts, color, r, { layers: 8, alpha: 0.1, variance: 0.035, opaque: 0.92, gradientTo: o.to, texture: o.texture ?? 0.35, textureScale: 6, edge: o.edge ?? 0.5 });
}

/** 地面に落ちる影 */
function groundShadow(ctx: Ctx, env: SpriteEnv, r: Rng, w: number, h: number, dx = 0) {
  const side = sunSide(env.L);
  const len = env.L.sunVisible > 0 ? 0.6 + (1 - Math.min(1, env.L.sunVisible)) * 0.8 : 0.4;
  wash(ctx, ellipse(dx - side * w * 0.22 * len, 1, w * (0.55 + len * 0.25), h, 12, r, 0.4), env.L.shadow, r, { layers: 10, alpha: 0.045, variance: 0.35 });
}

// ------------------------------------------------------------------
// 木
// ------------------------------------------------------------------
export function paintTree(kind: 0 | 1, seed: number, env: SpriteEnv, season: 'spring' | 'summer' | 'autumn' | 'winter'): Sprite {
  return kind === 1 ? conifer(seed, env, season) : deciduous(seed, env, season);
}

function deciduous(seed: number, env: SpriteEnv, season: string): Sprite {
  const r = rng(seed);
  const { L, F } = env;
  const side = sunSide(L);
  const th = 20 + r() * 10;
  const cr = 20 + r() * 8;
  const leaf = hex(F.leaves[Math.floor(r() * F.leaves.length)]);
  const bark = mix(hex('#5b4634'), L.shadow, 0.2);
  const bare = season === 'winter';
  return makeSprite(cr * 3, th + cr * 2.6, cr * 1.5, th + cr * 2.3, env, (ctx) => {
    groundShadow(ctx, env, r, cr * 1.1, cr * 0.22);
    // 幹と枝
    const lean = (r() - 0.5) * 4;
    brush(ctx, [P(0, 1), P(lean * 0.4, -th * 0.5), P(lean, -th)], 3.6, bark, r, { alpha: 0.85, bristles: 6, taper: 0.45 });
    if (bare) {
      const grow = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
        const x2 = x + Math.cos(ang) * len;
        const y2 = y + Math.sin(ang) * len;
        brush(ctx, [P(x, y), P((x + x2) / 2 + (r() - 0.5) * 2, (y + y2) / 2), P(x2, y2)], w, bark, r, { alpha: 0.8, bristles: Math.max(2, Math.round(w * 1.5)), taper: 0.6 });
        if (depth <= 0) {
          if (r() < 0.5) dab(ctx, x2, y2 - 0.4, 1.8, 0.6, mix(hex('#f7f6f1'), L.sunlight, 0.2), 0.85, r, 0.2);
          return;
        }
        const n = 2 + (r() < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) grow(x2, y2, ang + (i - (n - 1) / 2) * 0.55 + (r() - 0.5) * 0.3, len * (0.62 + r() * 0.15), w * 0.62, depth - 1);
      };
      grow(lean, -th, -Math.PI / 2 - 0.35, cr * 0.55, 2, 3);
      grow(lean, -th, -Math.PI / 2 + 0.35, cr * 0.55, 2, 3);
      grow(lean, -th * 1.05, -Math.PI / 2, cr * 0.6, 2.2, 3);
      return;
    }
    const branches = 4;
    for (let i = 0; i < branches; i++) {
      const y0 = -th * (0.55 + r() * 0.45);
      const dir = i % 2 === 0 ? -1 : 1;
      const len = cr * (0.5 + r() * 0.6);
      const x1 = dir * len * 0.7;
      const y1 = y0 - len * (0.6 + r() * 0.4);
      brush(ctx, [P(lean * 0.6, y0), P(x1 * 0.5, (y0 + y1) / 2 - 3), P(x1, y1)], 1.8, bark, r, { alpha: 0.8, bristles: 3, taper: 0.8 });
    }
    const cy = -th - cr * 0.55;
    // 樹冠: 影の塊 → 中間 → 日の当たる側 → 明るい葉 → 暗い葉の固まり
    const blobs: [number, number, number][] = [];
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r();
      const d = cr * (0.35 + r() * 0.3);
      blobs.push([Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, cr * (0.5 + r() * 0.25)]);
    }
    blobs.push([0, cy, cr * 0.7]);
    const dark = mix(leaf, L.shadow, 0.45);
    const mid = leaf;
    const lite = mix(leaf, L.sunlight, 0.4);
    for (const [x, y, s] of blobs) wash(ctx, ellipse(x, y + s * 0.12, s, s * 0.88, 9, r), dark, r, { layers: 9, alpha: 0.11, variance: 0.55, opaque: 0.55, edge: 0.6 });
    for (const [x, y, s] of blobs) wash(ctx, ellipse(x + side * s * 0.18, y - s * 0.1, s * 0.78, s * 0.7, 9, r), mid, r, { layers: 7, alpha: 0.1, variance: 0.6 });
    for (const [x, y, s] of blobs) {
      if ((x - 0) * side < -cr * 0.2) continue;
      wash(ctx, ellipse(x + side * s * 0.32, y - s * 0.3, s * 0.48, s * 0.4, 8, r), lite, r, { layers: 6, alpha: 0.12, variance: 0.7 });
    }
    // 葉のきらめき（小さな点）
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * cr * 0.95;
      const x = Math.cos(a) * d;
      const y = cy + Math.sin(a) * d * 0.8;
      const sunny = (x * side > -2 && y < cy + 4) || r() < 0.2;
      dab(ctx, x, y, 1.6 + r() * 2.2, 1.3 + r() * 1.6, sunny ? mix(lite, L.sunlight, 0.3) : mix(dark, L.shadow, 0.3), sunny ? 0.55 : 0.5, r);
    }
    // 春: 花
    if (season === 'spring') {
      const bloom = hex(F.blossoms[Math.floor(r() * F.blossoms.length)]);
      for (let i = 0; i < 18; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * cr * 0.9;
        dab(ctx, Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 1.2, 1, bloom, 0.8, r, 0.2);
      }
    }
    // 樹冠のすきまから見える枝
    for (let i = 0; i < 3; i++) {
      const x = (r() - 0.5) * cr;
      brush(ctx, [P(x * 0.3, cy + cr * 0.5), P(x, cy + cr * 0.1)], 0.8, bark, r, { alpha: 0.5, bristles: 2, taper: 0.8 });
    }
  }, (th + cr) / 60);
}

function conifer(seed: number, env: SpriteEnv, season: string): Sprite {
  const r = rng(seed);
  const { L, F } = env;
  const side = sunSide(L);
  const H = 56 + r() * 26;
  const W = 17 + r() * 6;
  const col = hex(F.conifer);
  const dark = mix(col, L.shadow, 0.35);
  const lite = mix(mix(col, hex(F.grassLight), 0.35), L.sunlight, 0.25);
  const snow = season === 'winter' || F.snow > 0.3;
  return makeSprite(W * 3, H + 20, W * 1.5, H + 10, env, (ctx) => {
    groundShadow(ctx, env, r, W * 1.1, W * 0.3);
    brush(ctx, [P(0, 1), P(0, -H * 0.25)], 3, mix(hex('#4d3a2b'), L.shadow, 0.2), r, { alpha: 0.85, bristles: 5, taper: 0.3 });
    const tiers = 7;
    for (let t = 0; t < tiers; t++) {
      const k = t / (tiers - 1);
      const yb = -H * 0.14 - k * H * 0.74;
      const half = W * (1 - k * 0.82) * (0.92 + r() * 0.16);
      const top = yb - H * 0.26;
      const pts: Pt[] = [P(0, top, 0.2)];
      const steps = 7;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = -half + u * half * 2;
        const droop = Math.sin(u * Math.PI) * -3 + (u === 0 || u === 1 ? 4 : 0) + r() * 3;
        pts.push(P(x, yb + droop, 1.2));
      }
      wash(ctx, pts, mix(dark, col, k * 0.5), r, { layers: 7, alpha: 0.13, variance: 0.25, opaque: 0.7, edge: 0.7 });
      // 日の当たる側の枝葉（外に向かう短い筆）
      for (let i = 0; i < 5; i++) {
        const u = 0.15 + r() * 0.7;
        const x0 = side * half * u * 0.8;
        const y0 = top + (yb - top) * (0.35 + u * 0.55);
        brush(ctx, [P(x0 * 0.4, y0 - 2), P(x0, y0 + 2 + r() * 2)], 1.6, lite, r, { alpha: 0.55, bristles: 3, taper: 0.7 });
      }
      if (snow) {
        for (let i = 0; i < 4; i++) {
          const u = r();
          const x = (u - 0.5) * half * 1.4;
          dab(ctx, x, top + (yb - top) * (0.45 + Math.abs(u - 0.5)), 3 + r() * 2, 1.1, mix(hex('#f7f6f1'), L.sunlight, 0.2), 0.85, r, 0.25);
        }
      }
    }
  }, H / 80);
}

// ------------------------------------------------------------------
// 建物の部品
// ------------------------------------------------------------------
interface Ctx3 {
  ctx: Ctx;
  r: Rng;
  env: SpriteEnv;
  out: Sprite;
  /** 鉛筆の下描きだけで描く（まだ形になっていない可能性） */
  sketch: boolean;
}

/** 奥行きの方向（右上へ） */
const DV: [number, number] = [0.5, -0.3];

const INK: RGB = [44, 38, 32];

function faceTone(b: Ctx3, color: RGB, face: 'front' | 'side' | 'roofL' | 'roofR'): RGB {
  const { L } = b.env;
  const side = sunSide(L);
  const lit = (k: number) => mix(color, L.sunlight, k);
  const shd = (k: number) => mix(color, L.shadow, k);
  if (face === 'front') return side < 0 ? lit(0.16) : shd(0.12);
  if (face === 'side') return side > 0 ? lit(0.22) : shd(0.34);
  if (face === 'roofR') return side > 0 ? lit(0.18) : shd(0.25);
  return side < 0 ? lit(0.12) : shd(0.2);
}

function sketchLine(b: Ctx3, pts: [number, number][], closed = true) {
  const g: RGB = [70, 66, 62];
  for (let pass = 0; pass < 2; pass++) {
    ink(b.ctx, pts.map(([x, y]) => ({ x: x + (b.r() - 0.5) * 1.2, y: y + (b.r() - 0.5) * 1.2 })), b.r, g, 0.32, 0.55, closed);
  }
}

function poly(b: Ctx3, pts: [number, number][], color: RGB, o: { to?: RGB; texture?: number; outline?: boolean; edge?: number } = {}) {
  if (b.sketch) {
    sketchLine(b, pts);
    return;
  }
  fill(b.ctx, pts.map(([x, y]) => P(x, y, 0.25)), color, b.r, o);
  if (o.outline !== false) ink(b.ctx, pts.map(([x, y]) => ({ x, y })), b.r, INK, 0.42, 0.6, true);
}

interface BoxSpec {
  x: number;
  /** 手前からの奥行きのずれ（後ろに置くとき） */
  z?: number;
  w: number;
  d: number;
  h: number;
  wall: RGB;
  roof?: { type: 'gable' | 'flat' | 'hip' | 'cone' | 'dome'; h: number; color: RGB; over?: number };
  windows?: number;
  sideWindows?: number;
  door?: boolean;
  arched?: boolean;
  timber?: boolean;
  stone?: boolean;
  chimney?: number;
  /** 窓の行数 */
  floors?: number;
}

/** 箱の形の建物（正面・右側面・屋根）。返すのは屋根の頂点（旗などを立てる場所） */
function box(b: Ctx3, s: BoxSpec): [number, number] {
  const { ctx, r } = b;
  const z = s.z ?? 0;
  const ox = s.x + z * DV[0];
  const oy = z * DV[1];
  const dx = s.d * DV[0];
  const dy = s.d * DV[1];
  const x0 = ox;
  const x1 = ox + s.w;
  const front: [number, number][] = [
    [x0, oy],
    [x1, oy],
    [x1, oy - s.h],
    [x0, oy - s.h],
  ];
  const sideF: [number, number][] = [
    [x1, oy],
    [x1 + dx, oy + dy],
    [x1 + dx, oy + dy - s.h],
    [x1, oy - s.h],
  ];
  // 側面 → 正面
  poly(b, sideF, faceTone(b, s.wall, 'side'), { to: shade(faceTone(b, s.wall, 'side'), -0.08) });
  poly(b, front, faceTone(b, s.wall, 'front'), { to: shade(faceTone(b, s.wall, 'front'), -0.1) });
  if (!b.sketch) {
    // 壁の質感: 石積みか、木組み
    if (s.stone) {
      ctx.lineWidth = 0.5;
      for (let y = oy - 4; y > oy - s.h + 2; y -= 4.5) {
        for (let x = x0 + ((y / 4.5) % 2 ? 2 : 5); x < x1 - 2; x += 6 + r() * 3) {
          ctx.strokeStyle = rgba(shade(s.wall, -0.35), 0.28);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 4 + r() * 2, y + (r() - 0.5) * 0.4);
          ctx.stroke();
        }
      }
    }
    if (s.timber) {
      const t = mix(hex('#5a4231'), b.env.L.shadow, 0.15);
      brush(ctx, [P(x0 + 1, oy - s.h * 0.52), P(x1 - 1, oy - s.h * 0.52)], 1.4, t, r, { alpha: 0.75, bristles: 2, taper: 0 });
      for (let x = x0 + 1; x <= x1; x += s.w / 3) brush(ctx, [P(x, oy), P(x, oy - s.h)], 1.3, t, r, { alpha: 0.7, bristles: 2, taper: 0 });
      brush(ctx, [P(x0 + 2, oy - s.h * 0.1), P(x0 + s.w / 3 - 1, oy - s.h * 0.48)], 1, t, r, { alpha: 0.6, bristles: 2, taper: 0 });
      brush(ctx, [P(x1 + dx * 0.5, oy + dy * 0.5), P(x1 + dx * 0.5, oy + dy * 0.5 - s.h)], 1.2, t, r, { alpha: 0.55, bristles: 2, taper: 0 });
    }
    // 足もとの陰と草
    brush(ctx, [P(x0, oy - 1), P(x1, oy - 1), P(x1 + dx, oy + dy - 1)], 3, b.env.L.shadow, r, { alpha: 0.2, bristles: 3, taper: 0 });
  }
  // 窓
  const floors = s.floors ?? 1;
  const wn = s.windows ?? 0;
  for (let f = 0; f < floors; f++) {
    const wy = oy - s.h * (0.62 + f * 0) - (f * s.h) / (floors + 0.2) + (floors > 1 ? s.h * 0.22 : 0);
    for (let i = 0; i < wn; i++) {
      const cx = x0 + (s.w * (i + 1)) / (wn + 1);
      if (s.door && f === 0 && Math.abs(cx - (x0 + s.w / 2)) < 5) continue;
      win(b, cx, wy, 4.2, 5.6, s.arched);
    }
  }
  const swn = s.sideWindows ?? 0;
  for (let i = 0; i < swn; i++) {
    const t = (i + 1) / (swn + 1);
    sideWin(b, x1 + dx * t, oy + dy * t - s.h * 0.55, 3.6, 5.2);
  }
  if (s.door) door(b, x0 + s.w / 2, oy, Math.min(7, s.w * 0.22), Math.min(11, s.h * 0.6), s.arched);
  // 屋根
  let top: [number, number] = [x0 + s.w / 2, oy - s.h];
  if (s.roof) top = roof(b, s, x0, x1, oy, dx, dy);
  if (s.chimney !== undefined && !b.sketch) {
    const cx = x0 + s.w * s.chimney;
    const base = oy - s.h - (s.roof?.h ?? 0) * 0.45;
    const ch: [number, number][] = [
      [cx - 2.5, base + 2],
      [cx + 2.5, base + 2],
      [cx + 2.5, base - 9],
      [cx - 2.5, base - 9],
    ];
    poly(b, ch, faceTone(b, hex('#9a8c78'), 'front'));
    poly(b, [[cx - 3.4, base - 9], [cx + 3.4, base - 9], [cx + 3.4, base - 11], [cx - 3.4, base - 11]], shade(hex('#7a6c58'), -0.1));
    b.out.smoke.push({ x: cx, y: base - 12 });
  }
  return top;
}

function roof(b: Ctx3, s: BoxSpec, x0: number, x1: number, oy: number, dx: number, dy: number): [number, number] {
  const R = s.roof!;
  const o = R.over ?? 3;
  const yT = oy - s.h;
  const { ctx, r } = b;
  if (R.type === 'flat') {
    poly(b, [[x0 - o, yT], [x1 + o, yT], [x1 + o + dx, yT + dy], [x0 - o + dx, yT + dy]], faceTone(b, R.color, 'roofR'));
    poly(b, [[x0 - o, yT], [x1 + o, yT], [x1 + o, yT + 2.5], [x0 - o, yT + 2.5]], shade(R.color, -0.15));
    return [(x0 + x1) / 2 + dx / 2, yT + dy / 2];
  }
  if (R.type === 'gable') {
    const ax = (x0 + x1) / 2;
    const ay = yT - R.h;
    const el: [number, number] = [x0 - o, yT + o * 0.5];
    const er: [number, number] = [x1 + o, yT + o * 0.5];
    // 奥の屋根面 → 妻壁 → 手前の屋根面
    poly(b, [el, [ax, ay], [ax + dx, ay + dy], [el[0] + dx, el[1] + dy]], faceTone(b, R.color, 'roofL'));
    poly(b, [[x0, yT], [ax, ay + 1.5], [x1, yT]], faceTone(b, s.wall, 'front'), { outline: false });
    poly(b, [[ax, ay], er, [er[0] + dx, er[1] + dy], [ax + dx, ay + dy]], faceTone(b, R.color, 'roofR'), { to: shade(faceTone(b, R.color, 'roofR'), -0.1) });
    if (!b.sketch) {
      // 瓦の列
      const rows = Math.max(3, Math.round(R.h / 3.2));
      for (let i = 1; i < rows; i++) {
        const t = i / rows;
        const p0: [number, number] = [ax + (er[0] - ax) * t, ay + (er[1] - ay) * t];
        brush(ctx, [P(p0[0], p0[1]), P(p0[0] + dx, p0[1] + dy)], 0.8, shade(R.color, -0.3), r, { alpha: 0.35, bristles: 2, taper: 0 });
      }
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        brush(ctx, [P(ax + dx * t, ay + dy * t), P(er[0] + dx * t, er[1] + dy * t)], 0.6, shade(R.color, -0.25), r, { alpha: 0.22, bristles: 2, taper: 0 });
      }
      // 棟の明るい線
      brush(ctx, [P(ax, ay), P(ax + dx, ay + dy)], 1.3, mix(R.color, b.env.L.sunlight, 0.5), r, { alpha: 0.55, bristles: 2, taper: 0 });
      // 軒下の陰
      brush(ctx, [P(x0, yT + 1.2), P(x1, yT + 1.2)], 1.6, b.env.L.shadow, r, { alpha: 0.3, bristles: 2, taper: 0 });
      // 妻壁の小窓
      win(b, ax, yT - R.h * 0.38, 2.6, 3.2, true);
    }
    return [ax + dx / 2, ay + dy / 2];
  }
  if (R.type === 'hip') {
    const ax0 = x0 + (x1 - x0) * 0.3;
    const ax1 = x0 + (x1 - x0) * 0.7;
    const ay = yT - R.h;
    poly(b, [[x0 - o, yT + 1], [x1 + o, yT + 1], [ax1 + dx * 0.5, ay + dy * 0.5], [ax0 + dx * 0.5, ay + dy * 0.5]], faceTone(b, R.color, 'roofL'), { to: shade(faceTone(b, R.color, 'roofL'), -0.12) });
    poly(b, [[x1 + o, yT + 1], [x1 + o + dx, yT + 1 + dy], [ax1 + dx * 0.5, ay + dy * 0.5]], faceTone(b, R.color, 'roofR'));
    if (!b.sketch) {
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        brush(ctx, [P(x0 - o + (ax0 + dx * 0.5 - x0 + o) * t, yT + 1 + (ay + dy * 0.5 - yT - 1) * t), P(x1 + o + (ax1 + dx * 0.5 - x1 - o) * t, yT + 1 + (ay + dy * 0.5 - yT - 1) * t)], 0.7, shade(R.color, -0.3), r, { alpha: 0.3, bristles: 2, taper: 0 });
      }
    }
    return [(ax0 + ax1) / 2 + dx * 0.5, ay + dy * 0.5];
  }
  if (R.type === 'cone') {
    const cx = (x0 + x1) / 2 + dx / 2;
    const ay = yT - R.h;
    const half = (x1 - x0) / 2 + o;
    poly(b, [[cx - half, yT + 1], [cx, ay], [cx + half, yT + 1]], faceTone(b, R.color, 'roofL'), { to: shade(R.color, -0.15) });
    poly(b, [[cx, ay], [cx + half, yT + 1], [cx + half * 0.25, yT + 2]], faceTone(b, R.color, 'roofR'), { outline: false });
    return [cx, ay];
  }
  // dome
  const cx = (x0 + x1) / 2 + dx / 2;
  const rad = (x1 - x0) / 2 + 1;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    pts.push([cx + Math.cos(a) * rad, yT + dy / 2 + Math.sin(a) * R.h]);
  }
  poly(b, pts, faceTone(b, R.color, 'roofL'), { to: shade(R.color, -0.2) });
  if (!b.sketch) {
    const side = sunSide(b.env.L);
    wash(ctx, ellipse(cx + side * rad * 0.35, yT + dy / 2 - R.h * 0.62, rad * 0.32, R.h * 0.28, 8, r), b.env.L.sunlight, r, { layers: 6, alpha: 0.12, variance: 0.4 });
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      ink(ctx, Array.from({ length: 7 }, (_, k) => {
        const a = Math.PI + (k / 6) * Math.PI;
        return { x: cx + Math.cos(a) * rad * (1 - t * 0.0) * Math.cos((t - 0.5) * 0.0), y: yT + dy / 2 + Math.sin(a) * R.h * t };
      }), r, shade(R.color, -0.4), 0.18, 0.5);
    }
  }
  // 頂の飾り
  poly(b, [[cx - 1, yT + dy / 2 - R.h], [cx + 1, yT + dy / 2 - R.h], [cx, yT + dy / 2 - R.h - 7]], hex('#c9a95c'));
  return [cx, yT + dy / 2 - R.h - 7];
}

function win(b: Ctx3, cx: number, cy: number, w: number, h: number, arched?: boolean) {
  const { ctx, r, env } = b;
  const pts: [number, number][] = arched
    ? [[cx - w / 2, cy + h / 2], [cx + w / 2, cy + h / 2], [cx + w / 2, cy - h / 2 + w / 2], [cx + w * 0.3, cy - h / 2 + 0.6], [cx, cy - h / 2], [cx - w * 0.3, cy - h / 2 + 0.6], [cx - w / 2, cy - h / 2 + w / 2]]
    : [[cx - w / 2, cy + h / 2], [cx + w / 2, cy + h / 2], [cx + w / 2, cy - h / 2], [cx - w / 2, cy - h / 2]];
  if (b.sketch) {
    sketchLine(b, pts);
    return;
  }
  const lit = env.L.glow;
  const glass = lit > 0.25 ? mix(hex('#3a3328'), hex('#f2c46a'), Math.min(1, lit * 1.1)) : mix(hex('#2e3a3c'), env.L.skyMid, 0.35);
  fill(ctx, pts.map(([x, y]) => P(x, y, 0.1)), glass, r, { texture: 0.2, edge: 0.2 });
  ink(ctx, pts.map(([x, y]) => ({ x, y })), r, INK, 0.5, 0.5, true);
  // 窓枠の十字と窓台
  ctx.strokeStyle = rgba(mix(hex('#e8dcc4'), env.L.shadow, 0.2), 0.7);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2 + 0.5);
  ctx.lineTo(cx, cy + h / 2);
  ctx.moveTo(cx - w / 2, cy + 0.3);
  ctx.lineTo(cx + w / 2, cy + 0.3);
  ctx.stroke();
  brush(ctx, [P(cx - w / 2 - 0.8, cy + h / 2 + 0.6), P(cx + w / 2 + 0.8, cy + h / 2 + 0.6)], 1, hex('#e6dccb'), r, { alpha: 0.8, bristles: 2, taper: 0 });
  // 窓辺の花（ときどき）
  if (r() < 0.35 && lit < 0.6) for (let i = 0; i < 4; i++) dab(ctx, cx - w / 2 + r() * w, cy + h / 2 + 0.2, 0.9, 0.8, hex(['#c95b4a', '#e8b84a', '#d98aa0'][Math.floor(r() * 3)]), 0.9, r, 0.2);
  b.out.lights.push({ x: cx, y: cy, r: Math.max(w, h) });
}

function sideWin(b: Ctx3, cx: number, cy: number, w: number, h: number) {
  const k = DV[1] / DV[0];
  const pts: [number, number][] = [
    [cx - w / 2, cy + h / 2 - (k * w) / 2 * -1 * 0],
    [cx + w / 2, cy + h / 2 + (k * w) / 2],
    [cx + w / 2, cy - h / 2 + (k * w) / 2],
    [cx - w / 2, cy - h / 2],
  ];
  if (b.sketch) {
    sketchLine(b, pts);
    return;
  }
  const lit = b.env.L.glow;
  const glass = lit > 0.25 ? mix(hex('#3a3328'), hex('#f2c46a'), Math.min(1, lit * 1.1)) : mix(hex('#2a3436'), b.env.L.skyMid, 0.25);
  fill(b.ctx, pts.map(([x, y]) => P(x, y, 0.1)), glass, b.r, { texture: 0.2, edge: 0.2 });
  ink(b.ctx, pts.map(([x, y]) => ({ x, y })), b.r, INK, 0.45, 0.5, true);
  b.out.lights.push({ x: cx, y: cy, r: Math.max(w, h) });
}

function door(b: Ctx3, cx: number, base: number, w: number, h: number, arched?: boolean) {
  const pts: [number, number][] = arched
    ? [[cx - w / 2, base], [cx + w / 2, base], [cx + w / 2, base - h + w / 2], [cx, base - h], [cx - w / 2, base - h + w / 2]]
    : [[cx - w / 2, base], [cx + w / 2, base], [cx + w / 2, base - h], [cx - w / 2, base - h]];
  poly(b, pts, mix(hex('#5a4030'), b.env.L.shadow, 0.15), { texture: 0.3 });
  if (!b.sketch) {
    b.ctx.strokeStyle = rgba(shade(hex('#5a4030'), -0.4), 0.5);
    b.ctx.lineWidth = 0.4;
    b.ctx.beginPath();
    b.ctx.moveTo(cx, base);
    b.ctx.lineTo(cx, base - h + 1);
    b.ctx.stroke();
    // 戸口の石段
    poly(b, [[cx - w / 2 - 2, base + 1.2], [cx + w / 2 + 2, base + 1.2], [cx + w / 2 + 1.5, base - 0.6], [cx - w / 2 - 1.5, base - 0.6]], hex('#bfb39c'));
    if (b.env.L.glow > 0.3) b.out.lights.push({ x: cx, y: base - h * 0.5, r: w });
  }
}

/** 足場（計画中の開拓計画がある） */
function scaffold(b: Ctx3, x: number, h: number) {
  const { ctx, r, env } = b;
  const wood = mix(hex('#9a7a52'), env.L.shadow, 0.1);
  for (const px of [x, x + 14]) brush(ctx, [P(px, 0), P(px + 0.5, -h)], 1.3, wood, r, { alpha: 0.85, bristles: 2, taper: 0 });
  for (let y = -6; y > -h; y -= 9) brush(ctx, [P(x - 1, y), P(x + 15, y + 0.5)], 1.2, wood, r, { alpha: 0.8, bristles: 2, taper: 0 });
  brush(ctx, [P(x, -2), P(x + 14, -h + 4)], 0.9, wood, r, { alpha: 0.65, bristles: 2, taper: 0 });
  // 縄と板
  ink(ctx, [{ x: x + 14, y: -h }, { x: x + 20, y: -h * 0.4 }, { x: x + 21, y: -2 }], r, hex('#8a7a5a'), 0.5, 0.4);
  poly(b, [[x + 17, 0], [x + 30, 0], [x + 30, -3], [x + 17, -3]], hex('#b08a5a'));
  poly(b, [[x + 19, -3], [x + 28, -3], [x + 28, -5.5], [x + 19, -5.5]], hex('#a8825a'));
}

/** 小さな植え込み・花壇 */
function shrubs(b: Ctx3, x0: number, x1: number, y = 0, n = 5) {
  const { ctx, r, env } = b;
  const leaf = hex(env.F.leaves[0]);
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + r() * 0.6)) / n;
    const s = 3 + r() * 3;
    wash(ctx, ellipse(x, y - s * 0.6, s, s * 0.75, 7, r), mix(leaf, env.L.shadow, 0.3), r, { layers: 5, alpha: 0.18, variance: 0.5, opaque: 0.5 });
    dab(ctx, x + sunSide(env.L) * s * 0.3, y - s, s * 0.5, s * 0.4, mix(leaf, env.L.sunlight, 0.35), 0.5, r);
    if (r() < 0.5) dab(ctx, x + (r() - 0.5) * s, y - s * 0.9, 0.9, 0.8, hex(env.F.blossoms[Math.floor(r() * env.F.blossoms.length)]), 0.9, r, 0.2);
  }
}

function barrel(b: Ctx3, x: number, y: number, s = 1) {
  const c = hex('#8a6440');
  poly(b, [[x - 3 * s, y], [x + 3 * s, y], [x + 3.4 * s, y - 4 * s], [x + 3 * s, y - 8 * s], [x - 3 * s, y - 8 * s], [x - 3.4 * s, y - 4 * s]], faceTone(b, c, 'front'));
  if (!b.sketch) {
    b.ctx.strokeStyle = rgba(hex('#3e3a36'), 0.6);
    b.ctx.lineWidth = 0.6;
    for (const yy of [y - 2 * s, y - 6 * s]) {
      b.ctx.beginPath();
      b.ctx.moveTo(x - 3.2 * s, yy);
      b.ctx.lineTo(x + 3.2 * s, yy);
      b.ctx.stroke();
    }
  }
}

function crate(b: Ctx3, x: number, y: number, s = 1) {
  box(b, { x, w: 7 * s, d: 5 * s, h: 6 * s, wall: hex('#a5824f') });
  if (!b.sketch) ink(b.ctx, [{ x, y: y - 6 * s }, { x: x + 7 * s, y }], b.r, hex('#5a4030'), 0.4, 0.4);
}

function fence(b: Ctx3, x0: number, x1: number, y = 0) {
  const { ctx, r, env } = b;
  const wood = mix(hex('#8c6c48'), env.L.shadow, 0.1);
  for (let x = x0; x <= x1; x += 5) brush(ctx, [P(x, y + 0.5), P(x + 0.2, y - 6)], 1, wood, r, { alpha: 0.85, bristles: 2, taper: 0 });
  brush(ctx, [P(x0, y - 4.5), P(x1, y - 4.5)], 0.9, wood, r, { alpha: 0.8, bristles: 2, taper: 0 });
  brush(ctx, [P(x0, y - 2), P(x1, y - 2)], 0.9, wood, r, { alpha: 0.7, bristles: 2, taper: 0 });
}

function pennant(b: Ctx3, x: number, y: number, color = hex('#d6b878')) {
  if (b.sketch) return;
  brush(b.ctx, [P(x, y), P(x, y - 12)], 0.8, hex('#4a3a2a'), b.r, { alpha: 0.9, bristles: 2, taper: 0 });
  poly(b, [[x, y - 12], [x + 8, y - 10], [x, y - 8]], color);
}

/** 地面（敷石や土の広がり） */
function ground(b: Ctx3, rx: number, ry: number, color: RGB, dx = 0) {
  if (b.sketch) return;
  wash(b.ctx, ellipse(dx, 0, rx, ry, 14, b.r, 0.5), color, b.r, { layers: 10, alpha: 0.08, variance: 0.3, texture: 0.4, textureScale: 5 });
}

function rocks(b: Ctx3, x: number, y: number, s: number, n = 3) {
  const { ctx, r, env } = b;
  const stone = mix(hex('#a8a090'), env.L.sunlight, 0.1);
  for (let i = 0; i < n; i++) {
    const px = x + (i - n / 2) * s * 1.2 + (r() - 0.5) * s;
    const sz = s * (0.6 + r() * 0.6);
    dab(ctx, px, y - sz * 0.3, sz, sz * 0.7, mix(stone, env.L.shadow, 0.35), 0.95, r, 0.2);
    dab(ctx, px + sunSide(env.L) * sz * 0.2, y - sz * 0.55, sz * 0.6, sz * 0.4, stone, 0.85, r, 0.2);
  }
}

// ------------------------------------------------------------------
// 拠点の建物（種類 × 段階）
// ------------------------------------------------------------------
const C = {
  stone: hex('#d8cbb0'),
  plaster: hex('#ece3cf'),
  wood: hex('#9a7550'),
  darkWood: hex('#6b4e36'),
  green: hex('#3b5a4c'),
  slate: hex('#56657a'),
  terracotta: hex('#a9633f'),
  thatch: hex('#b99c62'),
  gold: hex('#d6b878'),
  water: hex('#7fa7a8'),
};

type Builder = (b: Ctx3, level: number) => void;

const BUILD: Record<StructureKind, Builder> = {
  workshop(b, L) {
    ground(b, 46, 9, mix(hex('#a08a68'), b.env.L.shadow, 0.1));
    if (L <= 1) {
      box(b, { x: -12, w: 22, d: 14, h: 13, wall: C.wood, roof: { type: 'gable', h: 9, color: C.thatch }, door: true });
      for (let i = 0; i < 3; i++) poly(b, [[16 + i * 3, 0], [26 + i * 3, 0], [26 + i * 3, -3], [16 + i * 3, -3]], hex('#8a6440'));
      return;
    }
    if (L >= 4) box(b, { x: 14, z: 12, w: 26, d: 14, h: 16, wall: C.plaster, roof: { type: 'gable', h: 10, color: C.terracotta }, windows: 2, timber: true });
    box(b, { x: -24, w: L >= 3 ? 40 : 30, d: 20, h: L >= 3 ? 22 : 17, wall: C.plaster, roof: { type: 'gable', h: 14, color: L >= 3 ? C.terracotta : C.thatch }, windows: 2, sideWindows: 1, door: true, timber: true, chimney: L >= 2 ? 0.25 : undefined });
    // 作業台と材木
    crate(b, 20, 0, 0.9);
    barrel(b, -28, 2, 0.9);
    if (L >= 3) for (let i = 0; i < 4; i++) poly(b, [[-40 + i * 2, 6], [-26 + i * 2, 6], [-26 + i * 2, 3.5], [-40 + i * 2, 3.5]], hex('#9b7448'));
    if (L >= 5) {
      // 水車
      const { ctx, r } = b;
      const cx = 44;
      const cy = -10;
      ctx.strokeStyle = rgba(faceTone(b, C.darkWood, 'side'), 0.9);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 6, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        brush(ctx, [P(cx, cy), P(cx + Math.cos(a) * 6, cy + Math.sin(a) * 12)], 0.9, C.darkWood, r, { alpha: 0.85, bristles: 2, taper: 0 });
      }
      pennant(b, -4, -48, C.gold);
    }
  },
  library(b, L) {
    ground(b, 50, 10, mix(C.stone, b.env.L.shadow, 0.15));
    if (L <= 1) {
      // 礎石と書見台
      poly(b, [[-20, 0], [20, 0], [24, -4], [-16, -4]], faceTone(b, C.stone, 'front'));
      poly(b, [[-3, -4], [3, -4], [2, -12], [-2, -12]], C.darkWood);
      poly(b, [[-6, -12], [6, -12], [5, -15], [-5, -15]], hex('#e8dcc0'));
      return;
    }
    const w = L >= 3 ? 50 : 36;
    const h = L >= 3 ? 28 : 22;
    if (L >= 4) {
      box(b, { x: -w / 2 - 16, z: 8, w: 18, d: 14, h: h - 6, wall: C.stone, roof: { type: 'hip', h: 8, color: C.slate }, windows: 1, stone: true, arched: true });
      box(b, { x: w / 2 - 2, z: 8, w: 18, d: 14, h: h - 6, wall: C.stone, roof: { type: 'hip', h: 8, color: C.slate }, windows: 1, stone: true, arched: true });
    }
    const top = box(b, { x: -w / 2, w, d: 24, h, wall: C.stone, roof: { type: L >= 5 ? 'dome' : 'gable', h: L >= 5 ? 22 : 15, color: L >= 5 ? hex('#5f7f78') : C.slate }, windows: L >= 3 ? 4 : 2, sideWindows: 2, door: true, arched: true, stone: true, floors: L >= 4 ? 2 : 1 });
    // 柱廊
    if (L >= 3 && !b.sketch) {
      for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 6 + (i * (w - 12)) / 3;
        poly(b, [[x - 1.6, 0], [x + 1.6, 0], [x + 1.4, -h * 0.72], [x - 1.4, -h * 0.72]], mix(C.plaster, b.env.L.sunlight, 0.2));
      }
      poly(b, [[-w / 2 + 2, -h * 0.72], [w / 2 - 2, -h * 0.72], [w / 2 - 2, -h * 0.82], [-w / 2 + 2, -h * 0.82]], mix(C.plaster, b.env.L.shadow, 0.1));
    }
    shrubs(b, -w / 2 - 6, -w / 2 + 6, 3, 2);
    shrubs(b, w / 2 - 4, w / 2 + 10, 3, 2);
    if (L >= 4) pennant(b, top[0], top[1], C.gold);
  },
  atelier(b, L) {
    ground(b, 44, 10, mix(hex(b.env.F.grassLight), b.env.L.shadow, 0.05));
    // 花壇
    const beds = Math.min(4, L + 1);
    for (let i = 0; i < beds; i++) {
      const x = -36 + i * 18;
      poly(b, [[x, 6], [x + 14, 6], [x + 15, 3], [x + 1, 3]], hex('#8a6c4c'));
      shrubs(b, x + 1, x + 14, 4, 3);
    }
    if (L >= 1) {
      // 画架
      const { ctx, r } = b;
      brush(ctx, [P(24, 0), P(28, -16)], 0.9, C.darkWood, r, { alpha: 0.9, bristles: 2, taper: 0 });
      brush(ctx, [P(32, 0), P(28, -16)], 0.9, C.darkWood, r, { alpha: 0.9, bristles: 2, taper: 0 });
      poly(b, [[23, -6], [33, -6], [33, -15], [23, -15]], hex('#efe6d2'));
      if (!b.sketch) {
        dab(ctx, 26, -11, 2.4, 1.8, hex('#c96f4a'), 0.8, r);
        dab(ctx, 30, -9, 2, 1.6, hex('#5f8fb0'), 0.8, r);
        dab(ctx, 28, -13, 1.6, 1.2, hex('#e0b44c'), 0.8, r);
      }
    }
    if (L >= 2) box(b, { x: -18, z: 10, w: 24, d: 16, h: 15, wall: C.plaster, roof: { type: 'gable', h: 10, color: C.green }, windows: 2, door: true });
    if (L >= 3) {
      // 温室（ガラス張り）
      const g = mix(hex('#cfe0dc'), b.env.L.skyMid, 0.3);
      box(b, { x: 8, z: 4, w: 22, d: 12, h: 11, wall: g, roof: { type: 'gable', h: 7, color: mix(g, hex('#ffffff'), 0.2) } });
      if (!b.sketch) for (let x = 8; x <= 30; x += 4) ink(b.ctx, [{ x, y: 0 }, { x, y: -11 }], b.r, hex('#ffffff'), 0.5, 0.4);
    }
    if (L >= 4) {
      // 藤棚
      const { ctx, r } = b;
      for (const x of [-42, -24]) brush(ctx, [P(x, 4), P(x, -16)], 1.2, C.darkWood, r, { alpha: 0.9, bristles: 2, taper: 0 });
      brush(ctx, [P(-45, -16), P(-21, -16)], 1.4, C.darkWood, r, { alpha: 0.9, bristles: 2, taper: 0 });
      if (!b.sketch) for (let i = 0; i < 14; i++) dab(ctx, -44 + r() * 22, -15 + r() * 6, 1.6, 2.4, mix(hex('#a98ac8'), b.env.L.shadow, 0.1), 0.75, r);
    }
    if (L >= 5) pennant(b, 0, -30, hex('#c96f4a'));
  },
  plaza(b, L) {
    const R = 22 + L * 5;
    // 敷石の円
    if (!b.sketch) {
      wash(b.ctx, ellipse(0, -2, R, R * 0.36, 20, b.r, 0.15), mix(C.stone, b.env.L.sunlight, 0.1), b.r, { layers: 12, alpha: 0.12, variance: 0.08, opaque: 0.7, texture: 0.5, textureScale: 6, edge: 0.6 });
      for (let i = 0; i < 40; i++) {
        const a = b.r() * Math.PI * 2;
        const d = Math.sqrt(b.r()) * R * 0.95;
        dab(b.ctx, Math.cos(a) * d, -2 + Math.sin(a) * d * 0.36, 1.6, 0.7, shade(C.stone, -0.2), 0.4, b.r, 0.2);
      }
    } else sketchLine(b, Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2) * R, -2 + Math.sin((i / 16) * Math.PI * 2) * R * 0.36] as [number, number]));
    if (L >= 1) {
      // 中央の井戸／噴水
      const fw = L >= 3 ? 12 : 8;
      poly(b, [[-fw, 0], [fw, 0], [fw, -5], [-fw, -5]], faceTone(b, C.stone, 'front'));
      if (!b.sketch) wash(b.ctx, ellipse(0, -5, fw, fw * 0.32, 12, b.r, 0.1), mix(C.water, b.env.L.skyMid, 0.3), b.r, { layers: 6, alpha: 0.2, variance: 0.1, opaque: 0.6 });
      if (L >= 3) {
        poly(b, [[-2, -5], [2, -5], [1.5, -14], [-1.5, -14]], C.stone);
        poly(b, [[-5, -14], [5, -14], [3, -16], [-3, -16]], C.stone);
        if (!b.sketch) b.out.smoke.push({ x: 0, y: -17, kind: 'spray' });
      } else if (!b.sketch) {
        // 井戸の屋根
        brush(b.ctx, [P(-fw + 1, -5), P(-fw + 1, -16)], 1, C.darkWood, b.r, { alpha: 0.9, bristles: 2, taper: 0 });
        brush(b.ctx, [P(fw - 1, -5), P(fw - 1, -16)], 1, C.darkWood, b.r, { alpha: 0.9, bristles: 2, taper: 0 });
        poly(b, [[-fw - 2, -15], [0, -21], [fw + 2, -15]], C.thatch);
      }
    }
    if (L >= 2) {
      // ベンチ
      for (const x of [-R * 0.7, R * 0.55]) poly(b, [[x - 5, 2], [x + 5, 2], [x + 5, -1], [x - 5, -1]], C.wood);
    }
    if (L >= 3) {
      // 屋台（布の屋根）
      for (const [x, col] of [[-R * 0.62, hex('#b5603f')], [R * 0.5, hex('#3a62a8')]] as [number, RGB][]) {
        box(b, { x: x - 7, z: 6, w: 14, d: 8, h: 8, wall: C.wood });
        poly(b, [[x - 9, -8 + 6 * DV[1]], [x + 9, -8 + 6 * DV[1]], [x + 7, -13 + 6 * DV[1]], [x - 7, -13 + 6 * DV[1]]], faceTone(b, col, 'roofR'));
      }
    }
    if (L >= 4) {
      // 大きな木（集いの木）
      const { ctx, r, env } = b;
      brush(ctx, [P(R * 0.85, -2), P(R * 0.85 + 1, -26)], 3, hex('#5b4634'), r, { alpha: 0.9, bristles: 5, taper: 0.4 });
      const leaf = hex(env.F.leaves[0]);
      for (let i = 0; i < 5; i++) wash(ctx, ellipse(R * 0.85 + (r() - 0.5) * 22, -34 + (r() - 0.5) * 12, 12, 10, 9, r), i < 3 ? mix(leaf, env.L.shadow, 0.35) : mix(leaf, env.L.sunlight, 0.3), r, { layers: 7, alpha: 0.13, variance: 0.55, opaque: i < 3 ? 0.5 : 0 });
    }
    if (L >= 5) {
      // あずまや
      box(b, { x: -R * 0.2 - 10, z: 14, w: 20, d: 12, h: 12, wall: mix(C.plaster, C.stone, 0.4), roof: { type: 'hip', h: 9, color: C.green }, door: true });
      pennant(b, -R * 0.2 + 3, -32, C.gold);
    }
  },
  spring(b, L) {
    const R = 16 + L * 5;
    const { ctx, r, env } = b;
    // 石の縁 → 水 → 映り込み
    if (!b.sketch) {
      wash(ctx, ellipse(0, -2, R + 4, (R + 4) * 0.36, 18, r, 0.3), mix(hex('#9c9484'), env.L.shadow, 0.2), r, { layers: 10, alpha: 0.12, variance: 0.12, opaque: 0.6 });
      wash(ctx, ellipse(0, -2.5, R, R * 0.33, 18, r, 0.2), mix(C.water, env.L.skyHorizon, 0.35), r, { layers: 12, alpha: 0.13, variance: 0.06, opaque: 0.85, gradientTo: shade(env.L.water, -0.1), edge: 0.6 });
      for (let i = 0; i < 6; i++) {
        const y = -2 + (r() - 0.5) * R * 0.36;
        const half = R * Math.sqrt(Math.max(0, 1 - ((y + 2) / (R * 0.33)) ** 2)) * (0.3 + r() * 0.4);
        const x = (r() - 0.5) * R * 0.4;
        brush(ctx, [P(x - half, y), P(x + half, y + (r() - 0.5) * 0.4)], 0.9, env.L.waterLight, r, { alpha: 0.32, bristles: 2, taper: 0.5 });
      }
    } else sketchLine(b, Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2) * R, -2 + Math.sin((i / 16) * Math.PI * 2) * R * 0.33] as [number, number]));
    // 縁の石
    if (!b.sketch) for (let i = 0; i < 10 + L * 2; i++) {
      const a = (i / (10 + L * 2)) * Math.PI * 2;
      rocks(b, Math.cos(a) * (R + 2), -2 + Math.sin(a) * (R + 2) * 0.36, 2.4, 1);
    }
    if (L >= 2) {
      // 湧き出る岩
      rocks(b, -R * 0.55, -6, 5, 3);
      if (!b.sketch) b.out.smoke.push({ x: -R * 0.55, y: -12, kind: 'spray' });
    }
    if (L >= 3) shrubs(b, R * 0.4, R + 8, -1, 3);
    if (L >= 4) {
      // 小さな滝
      rocks(b, -R * 0.8, -12, 7, 3);
      if (!b.sketch) brush(ctx, [P(-R * 0.75, -20), P(-R * 0.7, -10), P(-R * 0.6, -4)], 3, env.L.waterLight, r, { alpha: 0.55, bristles: 4, taper: 0.2 });
    }
    if (L >= 5) {
      // あずまや
      box(b, { x: R * 0.3, z: 12, w: 16, d: 10, h: 12, wall: mix(C.plaster, C.stone, 0.3), roof: { type: 'hip', h: 8, color: C.green } });
    }
  },
  house(b, L) {
    ground(b, 40, 9, mix(hex('#9a8a68'), b.env.L.shadow, 0.1));
    if (L <= 1) {
      // 小さな小屋
      box(b, { x: -10, w: 20, d: 14, h: 11, wall: C.wood, roof: { type: 'gable', h: 9, color: C.thatch }, door: true });
      return;
    }
    if (L >= 4) box(b, { x: 16, z: 6, w: 18, d: 14, h: 13, wall: C.plaster, roof: { type: 'gable', h: 9, color: C.terracotta }, windows: 1, timber: true });
    box(b, { x: -18, w: L >= 3 ? 34 : 26, d: 20, h: L >= 5 ? 26 : 17, wall: C.plaster, roof: { type: 'gable', h: 14, color: L >= 3 ? C.terracotta : C.thatch }, windows: 2, sideWindows: 1, door: true, timber: L >= 3, chimney: 0.72, floors: L >= 5 ? 2 : 1 });
    if (L >= 3) fence(b, -40, -22, 6);
    shrubs(b, -36, -22, 5, 3);
    if (L >= 2) {
      // 物干しと薪
      for (let i = 0; i < 3; i++) poly(b, [[22 + i * 2.5, 4], [32 + i * 2.5, 4], [32 + i * 2.5, 1.5], [22 + i * 2.5, 1.5]], hex('#9b7448'));
    }
    if (L >= 5) shrubs(b, 18, 40, 6, 4);
  },
  storehouse(b, L) {
    ground(b, 42, 9, mix(hex('#a39070'), b.env.L.shadow, 0.1));
    if (L <= 1) {
      barrel(b, -6, 0);
      barrel(b, 2, 1);
      crate(b, 8, 0);
      return;
    }
    if (L >= 4) box(b, { x: -38, z: 8, w: 22, d: 16, h: 18, wall: C.plaster, roof: { type: 'gable', h: 11, color: hex('#3c4652') }, windows: 1, stone: false });
    const top = box(b, { x: -16, w: L >= 3 ? 36 : 28, d: 22, h: L >= 3 ? 26 : 19, wall: mix(C.plaster, hex('#ffffff'), 0.25), roof: { type: 'gable', h: 15, color: hex('#3c4652') }, windows: 1, sideWindows: 1, door: true });
    // 蔵の腰壁（なまこ壁）
    if (!b.sketch) {
      const w = L >= 3 ? 36 : 28;
      poly(b, [[-16, 0], [-16 + w, 0], [-16 + w, -6], [-16, -6]], mix(hex('#5c6470'), b.env.L.shadow, 0.1));
      for (let x = -14; x < -16 + w - 2; x += 4) ink(b.ctx, [{ x, y: -1 }, { x: x + 3, y: -5 }], b.r, hex('#e8e4dc'), 0.7, 0.6);
    }
    barrel(b, 22, 2);
    barrel(b, 28, 3, 0.85);
    crate(b, -28, 2);
    if (L >= 3) for (let i = 0; i < 3; i++) poly(b, [[30 + i * 5, 8], [34 + i * 5, 8], [34 + i * 5, 4], [30 + i * 5, 4]], hex('#d8c6a0'));
    if (L >= 5) pennant(b, top[0], top[1], C.gold);
  },
  tower(b, L) {
    ground(b, 30, 8, mix(C.stone, b.env.L.shadow, 0.2));
    const h = 14 + L * 12;
    const top = box(b, { x: -9, w: 18, d: 14, h, wall: C.stone, roof: { type: 'cone', h: 14 + L, color: C.slate }, windows: 1, door: true, stone: true, arched: true, floors: Math.max(1, Math.floor(L / 2)) });
    if (L >= 3) shrubs(b, -22, -10, 3, 2);
    if (L >= 4) pennant(b, top[0], top[1], C.gold);
  },
};

/** 拠点の建物の絵 */
export function paintStructure(kind: StructureKind, level: number, planned: boolean, env: SpriteEnv, seed: number): Sprite {
  const W = 130;
  const H = 120;
  return makeSprite(W, H, W / 2, H - 22, env, (ctx, out) => {
    const r = rng(seed + level * 97);
    const b: Ctx3 = { ctx, r, env, out, sketch: level === 0 };
    if (level === 0) {
      // まだ形になっていない可能性: 杭と縄で区切った土地と、鉛筆の下描き
      wash(ctx, ellipse(0, 0, 34, 8, 12, r, 0.5), mix(hex('#b5a888'), env.L.shadow, 0.1), r, { layers: 8, alpha: 0.06, variance: 0.4 });
      BUILD[kind](b, 3);
      const wood = mix(hex('#8a6a48'), env.L.shadow, 0.1);
      const stakes: [number, number][] = [[-30, 4], [30, 4], [36, -6], [-24, -7]];
      for (const [x, y] of stakes) brush(ctx, [P(x, y), P(x, y - 8)], 1.2, wood, r, { alpha: 0.9, bristles: 2, taper: 0.3 });
      ink(ctx, [...stakes.map(([x, y]) => ({ x, y: y - 6 })), { x: stakes[0][0], y: stakes[0][1] - 6 }], r, hex('#d8c8a0'), 0.7, 0.4);
      return;
    }
    groundShadow(ctx, env, r, 40, 7);
    BUILD[kind](b, level);
    if (planned) {
      b.sketch = false;
      scaffold(b, 30, 30);
    }
  });
}

// ------------------------------------------------------------------
// 記念碑・灯籠・旗・橋
// ------------------------------------------------------------------
export function paintMonument(seed: number, env: SpriteEnv): Sprite {
  const r = rng(seed);
  const h = 22 + r() * 10;
  return makeSprite(40, h + 20, 20, h + 10, env, (ctx, out) => {
    const b: Ctx3 = { ctx, r, env, out, sketch: false };
    groundShadow(ctx, env, r, 9, 2.6);
    const stone = mix(hex('#c9c0ad'), env.L.sunlight, 0.1);
    poly(b, [[-8, 0], [8, 0], [8.5, -3], [-8.5, -3]], shade(stone, -0.15));
    box(b, { x: -4.5, w: 9, d: 5, h: h - 3, wall: stone });
    poly(b, [[-4.5, -h + 3], [4.5, -h + 3], [2, -h - 2], [-0.5, -h - 3]], faceTone(b, stone, 'front'));
    // 刻まれた葉の紋（円と若葉）
    ctx.strokeStyle = rgba(shade(stone, -0.45), 0.55);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.5, 2.6, 2.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ink(ctx, [{ x: 0, y: -h * 0.5 + 1.8 }, { x: 0, y: -h * 0.5 - 1.2 }], r, shade(stone, -0.5), 0.5, 0.45);
    dab(ctx, -0.9, -h * 0.5 - 1, 1, 0.5, shade(stone, -0.4), 0.6, r, 0.1);
    dab(ctx, 0.9, -h * 0.5 - 1.4, 1, 0.5, shade(stone, -0.4), 0.6, r, 0.1);
    // 金の飾りと花
    dab(ctx, 0, -h * 0.78, 1.4, 1.4, hex('#d6b878'), 0.9, r, 0.1);
    shrubs(b, -10, 10, 1, 3);
    out.lights.push({ x: 0, y: -h * 0.78, r: 4 });
  });
}

export function paintLantern(env: SpriteEnv): Sprite {
  const r = rng(808);
  return makeSprite(24, 34, 12, 30, env, (ctx, out) => {
    const b: Ctx3 = { ctx, r, env, out, sketch: false };
    groundShadow(ctx, env, r, 5, 1.6);
    const stone = mix(hex('#b8b0a0'), env.L.sunlight, 0.1);
    poly(b, [[-4, 0], [4, 0], [3.5, -2], [-3.5, -2]], shade(stone, -0.1));
    poly(b, [[-1.4, -2], [1.4, -2], [1.4, -12], [-1.4, -12]], faceTone(b, stone, 'front'));
    poly(b, [[-4, -12], [4, -12], [4, -13.5], [-4, -13.5]], stone);
    poly(b, [[-3, -13.5], [3, -13.5], [3, -18.5], [-3, -18.5]], mix(hex('#3c342a'), stone, 0.2));
    poly(b, [[-5.5, -18.5], [5.5, -18.5], [2, -22], [-2, -22]], faceTone(b, stone, 'roofR'));
    dab(ctx, 0, -23, 1.2, 1.2, stone, 0.9, r, 0.1);
    out.lights.push({ x: 0, y: -16, r: 3 });
  });
}

/** 石の太鼓橋（川幅に合わせて描く） */
export function paintBridge(width: number, env: SpriteEnv): Sprite {
  const r = rng(Math.round(width * 13));
  const w = width + 24;
  return makeSprite(w + 20, 50, (w + 20) / 2, 34, env, (ctx, out) => {
    const b: Ctx3 = { ctx, r, env, out, sketch: false };
    const stone = mix(hex('#cdbf9f'), env.L.sunlight, 0.12);
    const half = w / 2;
    const rise = 9 + width * 0.06;
    // 橋の側面（アーチの形にくり抜く）
    const top: [number, number][] = [];
    const bottom: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const x = -half + t * w;
      top.push([x, -Math.sin(t * Math.PI) * rise - 3]);
      const inner = Math.abs(x) < half - 8 ? -Math.sqrt(Math.max(0, 1 - (x / (half - 8)) ** 2)) * (rise + 1) : 0;
      bottom.push([x, inner + 3]);
    }
    poly(b, [...top, ...bottom.reverse()], faceTone(b, stone, 'front'), { texture: 0.5 });
    // アーチの内側の暗がりと水への映り込み
    const arch: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      arch.push(P(Math.cos(a) * (half - 8), 3 + Math.sin(a) * (rise + 1), 0.1));
    }
    wash(ctx, arch, mix(env.L.shadow, env.L.water, 0.3), r, { layers: 8, alpha: 0.14, variance: 0.05, opaque: 0.6 });
    wash(ctx, ellipse(0, 6, half - 6, rise * 0.5, 12, r, 0.2), mix(env.L.shadow, env.L.water, 0.5), r, { layers: 6, alpha: 0.08, variance: 0.3 });
    // 欄干と石の目地
    ink(ctx, top.map(([x, y]) => ({ x, y: y - 2.5 })), r, shade(stone, -0.35), 0.6, 0.8);
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const x = -half + t * w;
      const y = -Math.sin(t * Math.PI) * rise - 3;
      ink(ctx, [{ x, y: y - 2.5 }, { x, y: y + 1 }], r, shade(stone, -0.3), 0.35, 0.5);
    }
    for (const sx of [-1, 1]) {
      const x = sx * (half - 1);
      poly(b, [[x - 1.6, -2], [x + 1.6, -2], [x + 1.6, -9], [x - 1.6, -9]], faceTone(b, stone, 'front'));
    }
  });
}

// ------------------------------------------------------------------
// 雲・霧
// ------------------------------------------------------------------
export function paintCloud(seed: number, env: SpriteEnv): Sprite {
  const r = rng(seed);
  const w = 220 + r() * 160;
  const h = 70 + r() * 30;
  const { L } = env;
  return makeSprite(w, h + 30, w / 2, h, env, (ctx) => {
    const n = 7 + Math.floor(r() * 4);
    // 下側の陰 → 上側の明るいふくらみ
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * w * 0.7;
      const s = 26 + r() * 30;
      wash(ctx, ellipse(x, -s * 0.35, s * 1.3, s * 0.55, 10, r), L.cloudShade, r, { layers: 8, alpha: 0.05, variance: 0.7 });
    }
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * w * 0.6;
      const s = 22 + r() * 28;
      wash(ctx, ellipse(x, -s * 0.8 - r() * 10, s, s * 0.7, 10, r), L.cloudLight, r, { layers: 8, alpha: 0.07, variance: 0.75 });
    }
    // 光の当たる縁
    for (let i = 0; i < 4; i++) {
      const x = (r() - 0.5) * w * 0.5;
      glow(ctx, x, -h * 0.65, 30 + r() * 20, mix(L.cloudLight, L.sunColor, 0.4), 0.18);
    }
    softEdge(ctx, w, h + 30, 0, 15 - h / 2);
  });
}

/** 絵の縁を、だ円形にやわらかく消す（四角い切れ目が見えないように） */
function softEdge(ctx: Ctx, w: number, h: number, cx = 0, cy = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.translate(cx, cy);
  ctx.scale(1, h / w);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.85)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -w / 2, w, w);
  ctx.restore();
}

export function paintMist(seed: number, env: SpriteEnv): Sprite {
  const r = rng(seed);
  const w = 560;
  const h = 150;
  return makeSprite(w, h, w / 2, h / 2, env, (ctx) => {
    for (let i = 0; i < 7; i++) {
      wash(ctx, ellipse((r() - 0.5) * w * 0.4, (r() - 0.5) * 16, w * (0.14 + r() * 0.1), h * 0.13, 12, r), env.L.mist, r, { layers: 10, alpha: 0.05, variance: 0.9 });
    }
    softEdge(ctx, w, h);
  });
}

/** 前景の揺れる草（実行時に毎回描く。軽い線だけ） */
export function drawGrassTuft(ctx: Ctx, x: number, y: number, s: number, t: number, color: RGB, alpha: number, seed: number) {
  const r = rng(seed);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const h = (14 + r() * 26) * s;
    const sway = Math.sin(t * 1.4 + x * 0.02 + i) * 3 * s + Math.sin(t * 0.6 + i * 2) * 2 * s;
    blade(ctx, x + (i - n / 2) * 2.2 * s, y, h, (r() - 0.5) * 8 * s + sway, mix(color, [0, 0, 0], r() * 0.25), alpha, 1.2 * s);
  }
}
