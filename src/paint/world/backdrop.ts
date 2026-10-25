/**
 * 世界の背景（空・遠い山並み・丘・谷）を水彩で描く。
 * 背景は世界の状態に左右されない（時刻の光と季節だけで変わる）。描いた絵は使い回す。
 * どの関数も、ひと塗りごとに yield して一休みする（画面を止めないため）。
 */
import { fbm, hex, makeCanvas, mix, noise2, rgba, rng, shade, type Ctx, type RGB } from '../core';
import type { Flora, Light, Season } from '../light';
import { brush, deform, ellipse, glow, P, scaleOf, spline, wash, type Pt } from '../watercolor';
import type { PaintJob } from '../scheduler';
import { along, blade, closeDown, dab, paperGrain, ridge } from './brushes';
import { LAKE, PATHS, PEAKS, RIVER, SLOTS, WORLD_W, depthAt } from './layout';

export interface Env {
  L: Light;
  F: Flora;
  season: Season;
}

export interface LayerSpec {
  key: 'sky' | 'far' | 'mid' | 'near';
  /** この層が受け持つ縦の範囲（世界の座標） */
  y0: number;
  y1: number;
  /** 横に動かしたときの動きの割合（遠いものほど小さい） */
  parallax: number;
  paint: (ctx: Ctx, env: Env) => PaintJob;
}

/** 太陽がどちら側にあるか（-1 = 左、+1 = 右） */
export const sunSide = (L: Light) => (L.sunVisible > 0.05 ? (L.sunX < 0.5 ? -1 : 1) : 1);

/** 遠くのものほど空気の色に近づける */
const atmos = (L: Light, c: RGB, d: number) => mix(c, L.haze, d);

// ------------------------------------------------------------------
// 川の形（背景にも、実行時のきらめきにも使う）
// ------------------------------------------------------------------
export const RIVER_LINE = spline(RIVER, 10);
export const riverWidth = (y: number) => 1.5 + Math.pow(depthAt(y), 1.25) * 66 + Math.max(0, Math.sin(y * 0.011)) * 6 * depthAt(y);

/** 川の両岸の線 */
export function riverBanks(extra = 0): { left: Pt[]; right: Pt[] } {
  const left: Pt[] = [];
  const right: Pt[] = [];
  const n = RIVER_LINE.length;
  for (let i = 0; i < n; i++) {
    const p = RIVER_LINE[i];
    const q = RIVER_LINE[Math.min(n - 1, i + 1)];
    const o = RIVER_LINE[Math.max(0, i - 1)];
    const dx = q.x - o.x;
    const dy = q.y - o.y;
    const l = Math.hypot(dx, dy) || 1;
    const w = riverWidth(p.y) / 2 + extra * (0.4 + depthAt(p.y));
    // 曲がる外側ほど少し広く
    const bulge = 1 + noise2(p.y * 0.01, 3.1) * 0.18;
    left.push(P(p.x - (dy / l) * w * bulge, p.y + (dx / l) * w * bulge, 0.35));
    right.push(P(p.x + (dy / l) * w * bulge, p.y - (dx / l) * w * bulge, 0.35));
  }
  return { left, right };
}

export function riverPoly(extra = 0): Pt[] {
  const { left, right } = riverBanks(extra);
  return [...left, ...right.reverse()];
}

/** 川の中心から、そのyでのx（道や橋の計算用） */
export function riverXAt(y: number): number {
  for (let i = 0; i < RIVER_LINE.length - 1; i++) {
    const a = RIVER_LINE[i];
    const b = RIVER_LINE[i + 1];
    if ((a.y - y) * (b.y - y) <= 0) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1);
  }
  return RIVER_LINE[RIVER_LINE.length - 1].x;
}

// ------------------------------------------------------------------
// 地形の高さ（尾根の線）
// ------------------------------------------------------------------
const PEAK_SLOPES = [1.05, 0.92, 1.18, 0.86, 1.0, 1.12];

/** いちばん遠い高い山並み */
export function farRidgeY(x: number): number {
  let y = 560;
  PEAKS.forEach(([px, py], i) => {
    const s = PEAK_SLOPES[i];
    const d = Math.abs(x - px);
    y = Math.min(y, py + d * s * (0.7 + 0.3 * Math.min(1, d / 90)));
  });
  return y + fbm(x * 0.012, 1.7, 4) * 16 + Math.abs(noise2(x * 0.05, 9)) * 6;
}

/** 手前の低い山並み */
export function nearRangeY(x: number): number {
  return 520 + Math.sin(x * 0.0061 + 1.2) * 26 + Math.sin(x * 0.017 + 0.4) * 11 + fbm(x * 0.009, 4.2, 4) * 26;
}

/** 遠くの丘（森の帯） */
export function midHillY(x: number): number {
  return 610 + Math.sin(x * 0.0052 + 2.4) * 22 + fbm(x * 0.008, 7.7, 3) * 18 - Math.max(0, 300 - Math.abs(x - 520)) * 0.06;
}

/** 左の丘（森） */
export function leftHillY(x: number): number {
  return 690 + Math.pow(Math.max(0, x - 40) / 420, 2.2) * 130 + fbm(x * 0.01, 2.2, 3) * 12;
}

/** 右の丘（図書館の丘） */
export function rightHillY(x: number): number {
  const t = (x - 580) / 420;
  return 662 + Math.pow(Math.max(0, 1 - t * 2.2), 2) * 150 - Math.sin(t * Math.PI) * 18 + fbm(x * 0.011, 5.5, 3) * 10;
}

/** 草原の上端 */
export function meadowTopY(x: number): number {
  return 836 + Math.sin(x * 0.009) * 14 + fbm(x * 0.013, 8.8, 3) * 10 + (x > 600 ? (x - 600) * 0.08 : 0);
}

// ------------------------------------------------------------------
// 空
// ------------------------------------------------------------------
function* paintSky(ctx: Ctx, { L }: Env): PaintJob {
  const r = rng(101);
  const H = 760;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgba(L.skyTop));
  g.addColorStop(0.5, rgba(L.skyMid));
  g.addColorStop(0.86, rgba(L.skyHorizon));
  g.addColorStop(1, rgba(mix(L.skyHorizon, L.haze, 0.5)));
  ctx.fillStyle = g;
  ctx.fillRect(-40, 0, WORLD_W + 80, H);
  yield;
  // 太陽（月）のまわりの大きな光
  const sx = L.sunX * WORLD_W;
  const sy = L.sunY * 1000;
  if (L.sunVisible > 0) {
    glow(ctx, sx, sy, 520, L.sunColor, 0.32 * L.sunVisible);
    glow(ctx, sx, sy, 200, L.sunColor, 0.38 * L.sunVisible);
  } else {
    glow(ctx, sx, sy, 300, mix(L.skyMid, [230, 226, 210], 0.4), 0.18);
  }
  yield;
  // 空の水彩のムラ（横に長い、薄いにじみ）
  for (let i = 0; i < 9; i++) {
    const y = 60 + r() * 520;
    const x = r() * WORLD_W;
    const c = r() < 0.5 ? shade(L.skyMid, 0.12) : mix(L.skyTop, L.skyHorizon, r());
    wash(ctx, ellipse(x, y, 160 + r() * 260, 26 + r() * 40, 10, r), c, r, { layers: 14, alpha: 0.028, variance: 1.1 });
    yield;
  }
  // 地平線近くの暖かい帯
  wash(ctx, deform([P(-40, 560), P(1040, 540), P(1040, 700), P(-40, 700)], 2, 0.3, r), mix(L.skyHorizon, L.sunColor, 0.3), r, { layers: 18, alpha: 0.05, variance: 0.5 });
  yield;
  paperGrain(ctx, -40, 0, WORLD_W + 80, H, r, 0.5, 0.8);
}

// ------------------------------------------------------------------
// 遠い山並み
// ------------------------------------------------------------------
function* paintFar(ctx: Ctx, env: Env): PaintJob {
  const { L, F } = env;
  const r = rng(202);
  const side = sunSide(L);
  const rock = hex('#8d9aa3');
  // いちばん遠い山
  const far = ridge(-120, WORLD_W + 120, 8, farRidgeY, 0.25);
  const farCol = atmos(L, mix(hex(F.hillFar), rock, 0.55), 0.62);
  wash(ctx, closeDown(far, 700), shade(farCol, 0.06), r, { layers: 24, alpha: 0.06, variance: 0.22, gradientTo: atmos(L, farCol, 0.5), edge: 0.6, granulation: 0.25, opaque: 0.9, texture: 0.5, textureScale: 1.6 });
  yield;
  // 山肌の起伏: 峰ごとの円すいと、浸食された谷筋（ノイズ）から面の向きを求め、光の当たり方で塗り分ける
  yield* relief(ctx, env, farCol);
  for (const [i, [px, py]] of PEAKS.entries()) {
    const s = PEAK_SLOPES[i];
    const dir = -side;
    // 岩肌の筋（稜線から斜面へ流れ落ちる筆）
    for (let k = 0; k < 10; k++) {
      const t = r();
      const y0 = py + 10 + t * (560 - py) * 0.7;
      const x0 = px + dir * ((y0 - py) / (s * 0.9)) * (0.1 + r() * 0.8);
      const len = 16 + r() * 34;
      const lean = (r() < 0.5 ? dir : -dir) * (5 + r() * 8);
      brush(ctx, [P(x0, y0), P(x0 + lean * 0.5, y0 + len * 0.5), P(x0 + lean, y0 + len)], 1.6 + r() * 2, mix(L.shadow, farCol, 0.3), r, { alpha: 0.12, taper: 0.9 });
    }
    // 日の当たる稜線の明るさ
    const rim: Pt[] = [];
    for (let y = py; y < py + 120; y += 8) {
      const x = px - dir * ((y - py) / (s * 0.9));
      rim.push(P(x, farRidgeY(x) + 1.5));
    }
    brush(ctx, rim, 2.2, mix(L.sunlight, farCol, 0.3), r, { alpha: 0.3, bristles: 3, taper: 0.9 });
    yield;
  }
  // 雪（高い峰ほど、冬ほど多い）
  const snowAmount = 0.35 + env.F.snow;
  const snowCol = mix(hex('#f6f4ee'), L.sunlight, 0.25);
  const snowShade = mix(hex('#c8d2dc'), L.shadow, 0.25);
  for (const [i, [px, py]] of PEAKS.entries()) {
    const height = 560 - py;
    const depth = Math.min(110, height * 0.32 * snowAmount + 12);
    if (depth < 16) continue;
    const s = PEAK_SLOPES[i];
    const pts: Pt[] = [P(px, py - 1, 0.1)];
    const steps = 9;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = px + (t - 0.5) * 2 * depth * 1.05;
      const edge = farRidgeY(x);
      const drip = depth * (0.55 + 0.45 * Math.sin(t * Math.PI)) * (0.7 + r() * 0.6);
      pts.push(P(x, Math.max(edge, py + drip * (0.6 + 0.4 * (1 / s))), 1.4));
    }
    wash(ctx, pts, snowCol, r, { layers: 20, alpha: 0.09, variance: 0.32, edge: 0.4 });
    // 雪の陰の側
    const sh = pts.filter((p) => (p.x - px) * side < 0);
    if (sh.length > 2) wash(ctx, [P(px, py, 0.1), ...sh], snowShade, r, { layers: 12, alpha: 0.07, variance: 0.3 });
    yield;
  }
  // 手前の低い山並み（森におおわれている）
  const near = ridge(-120, WORLD_W + 120, 8, nearRangeY, 0.3);
  const nearCol = atmos(L, mix(hex(F.hillFar), hex(F.conifer), 0.35), 0.42);
  wash(ctx, closeDown(near, 720), nearCol, r, { layers: 24, alpha: 0.065, variance: 0.2, gradientTo: atmos(L, nearCol, 0.62), edge: 0.5, granulation: 0.2, opaque: 0.92, texture: 0.5, textureScale: 1.4 });
  yield;
  // 森の木々（遠いので、小さな縦の点の並び）
  const treeCol = atmos(L, hex(F.conifer), 0.48);
  for (let x = -30; x < WORLD_W + 30; x += 3.2) {
    const top = nearRangeY(x);
    const n = 1 + Math.floor(r() * 2.2);
    for (let k = 0; k < n; k++) {
      const y = top + 4 + r() * 70 * r();
      const h = 5 + r() * 7;
      ctx.fillStyle = rgba(mix(treeCol, L.haze, (y - top) / 120), 0.28 + r() * 0.2);
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x - 2.2, y);
      ctx.lineTo(x + 2.2, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  yield;
  // 山すその霧
  const haze = ctx.createLinearGradient(0, 520, 0, 700);
  haze.addColorStop(0, rgba(L.mist, 0));
  haze.addColorStop(0.55, rgba(L.mist, 0.55));
  haze.addColorStop(1, rgba(L.mist, 0.75));
  ctx.fillStyle = haze;
  ctx.fillRect(-40, 520, WORLD_W + 80, 180);
  yield;
  paperGrain(ctx, -40, 200, WORLD_W + 80, 500, r, 0.6);
}

/**
 * 山肌の陰影。低い解像度で面の明るさを計算し、絵の具の濃淡のように数段階にまとめて重ねる。
 * すでに塗った山の形の上にだけ乗せる（source-atop）。
 */
function* relief(ctx: Ctx, env: Env, base: RGB): PaintJob {
  const { L, F } = env;
  const side = sunSide(L);
  const k = scaleOf(ctx);
  const x0 = -120;
  const y0 = 200;
  const w = WORLD_W + 240;
  const h = 420;
  const step = 3;
  const nw = Math.ceil((w * k) / step);
  const nh = Math.ceil((h * k) / step);
  const { canvas: tc, ctx: tx } = makeCanvas(nw, nh);
  const img = tx.createImageData(nw, nh);
  const lit = mix(base, L.sunlight, 0.32);
  const dark = mix(base, L.shadow, 0.5);
  const snow = mix(hex('#f4f3ee'), L.sunlight, 0.2);
  const snowDark = mix(hex('#c2ccd8'), L.shadow, 0.3);
  const snowline = 0.74 - F.snow * 0.35;
  const ridged = (x: number, y: number) => 1 - Math.abs(noise2(x * 0.018, y * 0.009 + 3.3));
  for (let j = 0; j < nh; j++) {
    const wy = y0 + (j * step) / k;
    for (let i = 0; i < nw; i++) {
      const wx = x0 + (i * step) / k;
      // いちばん手前の円すい（その点の高さを決める峰）
      let best = Infinity;
      let face = 0;
      let peakY = 560;
      // 谷の線がまっすぐにならないよう、横位置を少しゆがめる
      const wxw = wx + fbm(wy * 0.012, wx * 0.006 + 7, 3) * 46 * Math.min(1, (wy - 300) / 120);
      for (let p = 0; p < PEAKS.length; p++) {
        const [px, py] = PEAKS[p];
        const d = Math.abs(wxw - px);
        const ry = py + d * PEAK_SLOPES[p] * (0.7 + 0.3 * Math.min(1, d / 90));
        if (ry < best) {
          best = ry;
          face = Math.sign(wxw - px) * Math.min(1, d / 18);
          peakY = py;
        }
      }
      if (wy < farRidgeY(wx) - 6) continue;
      // 谷筋: 縦にのびる尾根と谷（ノイズの横方向の変化）
      const g = (ridged(wx + 2, wy) - ridged(wx - 2, wy)) * 3.2 + fbm(wx * 0.05, wy * 0.05, 2) * 0.25;
      const facing = face * 0.75 + g;
      let t = 0.5 + facing * side * 0.55;
      // 濃淡を数段階にまとめる（水彩の塗り重ねのように）
      t = Math.round(t * 4) / 4 + (t - Math.round(t * 4) / 4) * 0.45;
      t = Math.max(0, Math.min(1, t));
      const height = 1 - (wy - peakY) / (560 - peakY + 1);
      let c = mix(dark, lit, t);
      const sn = height - snowline + noise2(wx * 0.04, wy * 0.04) * 0.12 + g * 0.08;
      if (sn > 0) c = mix(c, mix(snowDark, snow, t), Math.min(1, sn * 6));
      // 山すそほど空気の色に
      c = mix(c, L.haze, Math.max(0, Math.min(0.7, (wy - 430) / 220)));
      const o = (j * nw + i) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 200;
    }
    if (j % 40 === 39) yield;
  }
  tx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tc, x0, y0, (nw * step) / k, (nh * step) / k);
  ctx.restore();
}

// ------------------------------------------------------------------
// 遠くの丘（森の帯）
// ------------------------------------------------------------------
function* paintMid(ctx: Ctx, env: Env): PaintJob {
  const { L, F } = env;
  const r = rng(303);
  const side = sunSide(L);
  const line = ridge(-120, WORLD_W + 120, 8, midHillY, 0.3);
  const col = atmos(L, hex(F.hillNear), 0.34);
  wash(ctx, closeDown(line, 900), shade(col, 0.04), r, { layers: 22, alpha: 0.07, variance: 0.2, gradientTo: mix(col, hex(F.grassDark), 0.3), edge: 0.5, granulation: 0.25, opaque: 1, texture: 0.4 });
  yield;
  // 森の帯: 丸い樹冠を重ねて描く（奥ほど薄い）
  const forestDark = atmos(L, hex(F.conifer), 0.3);
  const forestLight = atmos(L, mix(hex(F.leaves[0]), L.sunlight, 0.25), 0.3);
  for (let row = 0; row < 3; row++) {
    for (let x = -30; x < WORLD_W + 30; x += 7 + r() * 5) {
      if (Math.abs(x - 512) < 22 + row * 8) continue; // 川の出口
      const top = midHillY(x) + 2 + row * 14 + r() * 8;
      const rx = 7 + r() * 6;
      const ry = 6 + r() * 6;
      dab(ctx, x, top, rx, ry, mix(forestDark, L.haze, 0.18 - row * 0.05), 0.5, r);
      dab(ctx, x + side * rx * 0.35, top - ry * 0.3, rx * 0.6, ry * 0.55, forestLight, 0.32, r);
    }
    yield;
  }
  paperGrain(ctx, -40, 560, WORLD_W + 80, 340, r, 0.6);
}

// ------------------------------------------------------------------
// 手前の谷（丘・草原・川・湖）
// ------------------------------------------------------------------
function* paintNear(ctx: Ctx, env: Env): PaintJob {
  const { L, F } = env;
  const r = rng(404);
  const side = sunSide(L);
  const grassL = hex(F.grassLight);
  const grassD = hex(F.grassDark);
  const meadow = hex(F.meadow);
  const sunTint = (c: RGB, k: number) => mix(c, L.sunlight, k);

  // 右の丘（図書館の丘）
  const rh = ridge(560, WORLD_W + 120, 6, rightHillY, 0.3);
  const rhCol = atmos(L, hex(F.hillNear), 0.12);
  wash(ctx, closeDown(rh, 1000), sunTint(rhCol, side > 0 ? 0.12 : 0.02), r, { layers: 22, alpha: 0.075, variance: 0.18, gradientTo: mix(rhCol, grassD, 0.4), edge: 0.6, granulation: 0.3, opaque: 1, texture: 0.45 });
  yield;
  // 左の丘（森の丘）
  const lh = ridge(-120, 520, 6, leftHillY, 0.3);
  const lhCol = atmos(L, mix(hex(F.hillNear), hex(F.conifer), 0.2), 0.14);
  wash(ctx, closeDown(lh, 1000), sunTint(lhCol, side < 0 ? 0.12 : 0.02), r, { layers: 22, alpha: 0.075, variance: 0.18, gradientTo: mix(lhCol, grassD, 0.35), edge: 0.6, granulation: 0.3, opaque: 1, texture: 0.45 });
  yield;
  // 丘の上の森の帯（左右の丘の奥）
  const fdark = atmos(L, hex(F.conifer), 0.12);
  for (let x = -20; x < WORLD_W + 20; x += 6 + r() * 4) {
    if (x > 440 && x < 600) continue;
    const top = x < 520 ? leftHillY(x) : rightHillY(x);
    for (let k = 0; k < 2; k++) {
      const y = top + 4 + k * 10 + r() * 6;
      dab(ctx, x, y, 7 + r() * 5, 7 + r() * 5, mix(fdark, L.shadow, 0.15), 0.42, r);
      dab(ctx, x + side * 3, y - 3, 4 + r() * 3, 4 + r() * 3, sunTint(mix(fdark, hex(F.leaves[0]), 0.5), 0.2), 0.3, r);
    }
  }
  yield;

  // 草原（谷の床）
  const mt = ridge(-120, WORLD_W + 120, 8, meadowTopY, 0.35);
  const meadowFar = atmos(L, sunTint(meadow, 0.1), 0.12);
  wash(ctx, closeDown(mt, 1420), meadowFar, r, { layers: 24, alpha: 0.075, variance: 0.16, gradientTo: mix(grassD, L.shadow, 0.12), edge: 0.5, granulation: 0.35, opaque: 1, texture: 0.45, textureScale: 0.8 });
  yield;
  // 草原の起伏（ゆるやかな丘のふくらみの陰）
  for (let i = 0; i < 7; i++) {
    const y0 = 900 + i * 62 + r() * 30;
    const x0 = -40 + r() * 300;
    const len = 380 + r() * 420;
    const pts: { x: number; y: number }[] = [];
    for (let t = 0; t <= 1.0001; t += 0.1) pts.push({ x: x0 + t * len, y: y0 - Math.sin(t * Math.PI) * (14 + depthAt(y0) * 26) });
    brush(ctx, pts, 10 + depthAt(y0) * 26, mix(grassD, L.shadow, 0.25), r, { alpha: 0.07, bristles: 8, taper: 0.3 });
    brush(ctx, pts.map((p) => ({ x: p.x, y: p.y - 8 - depthAt(y0) * 10 })), 8 + depthAt(y0) * 20, sunTint(grassL, 0.35), r, { alpha: 0.06, bristles: 6, taper: 0.3 });
  }
  yield;
  // 前景の暗い草むら（絵の額縁のように手前を締める）
  const fgL = [P(-40, 1250, 1), P(80, 1296, 1), P(170, 1352, 1), P(250, 1420, 0.5), P(-40, 1420, 0.3)];
  const fgR = [P(1040, 1230, 1), P(930, 1284, 1), P(860, 1350, 1), P(800, 1420, 0.5), P(1040, 1420, 0.3)];
  for (const fg of [fgL, fgR]) {
    wash(ctx, fg, mix(grassD, L.shadow, 0.35), r, { layers: 22, alpha: 0.08, variance: 0.35, edge: 0.5 });
    yield;
  }

  // 川: 濡れた岸 → 水 → 空の映り込み → 岸の陰
  const bankPoly = riverPoly(7);
  wash(ctx, bankPoly, mix(hex('#7c6a4e'), L.shadow, 0.25), r, { layers: 16, alpha: 0.07, variance: 0.12 });
  yield;
  const water = riverPoly(0);
  wash(ctx, water, mix(mix(L.water, L.haze, 0.3), L.skyHorizon, 0.35), r, { layers: 20, alpha: 0.09, variance: 0.06, gradientTo: mix(shade(L.water, -0.22), hex('#3f5a55'), 0.25), edge: 0.8, opaque: 0.9, texture: 0.5, textureScale: 2 });
  yield;
  const { left, right } = riverBanks(0);
  // 岸の映り込み（水の縁の内側を少し暗く）
  for (const bank of [left, right]) {
    const inner = bank.filter((_, i) => i % 2 === 0);
    for (let i = 0; i < inner.length - 1; i++) {
      const a = inner[i];
      const b = inner[i + 1];
      const d = depthAt(a.y);
      brush(ctx, [P(a.x, a.y), P(b.x, b.y)], 2 + d * 9, mix(hex(F.grassDark), L.water, 0.35), r, { alpha: 0.12, bristles: 4, taper: 0 });
    }
  }
  // 水面の流れの筋（流れに沿った細い筆）と、空の映り込み
  for (const pt of along(RIVER_LINE, 6)) {
    const d = depthAt(pt.y);
    const w = riverWidth(pt.y);
    if (r() < 0.6) continue;
    const off = (r() - 0.5) * w * 0.7;
    const len = 8 + d * 30 * r();
    const tx = -pt.ny;
    const ty = pt.nx;
    const x = pt.x + pt.nx * off;
    const y = pt.y + pt.ny * off;
    brush(ctx, [P(x, y), P(x + tx * len * 0.5 + (r() - 0.5) * 2, y + ty * len * 0.5), P(x + tx * len, y + ty * len)], 0.8 + d * 1.6, r() < 0.7 ? mix(L.waterLight, L.skyHorizon, 0.5) : shade(L.water, -0.2), r, { alpha: 0.22, bristles: 2, taper: 0.9 });
  }
  // 水の深いところ（中ほど）を少し濃く
  wash(ctx, riverPoly(-6).filter((p) => p.y > 760), shade(L.water, -0.15), r, { layers: 10, alpha: 0.04, variance: 0.1 });
  yield;
  // 日の当たらない側の岸の陰
  const shadowBank = side > 0 ? left : right;
  brush(ctx, shadowBank, 4, mix(L.shadow, L.water, 0.3), r, { alpha: 0.35, bristles: 5, taper: 0 });
  brush(ctx, side > 0 ? right : left, 2, L.sunlight, r, { alpha: 0.25, bristles: 3, taper: 0 });
  yield;
  // 川辺の葦
  for (const bank of [left, right]) {
    for (const p of along(bank, 14)) {
      if (r() < 0.45) continue;
      const d = depthAt(p.y);
      const n = 3 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) blade(ctx, p.x + (r() - 0.5) * 8, p.y + 2, (6 + r() * 10) * (0.5 + d), (r() - 0.5) * 6, mix(grassD, L.shadow, 0.2 + r() * 0.3), 0.6, 0.8 + d);
    }
  }
  yield;

  // 湖（静寂の地の水辺）
  const { x: lx, y: ly, rx, ry } = LAKE;
  wash(ctx, ellipse(lx, ly + 4, rx + 16, ry + 12, 28, undefined, 0.3), mix(hex('#6f6448'), L.shadow, 0.3), r, { layers: 14, alpha: 0.07, variance: 0.08 });
  wash(ctx, ellipse(lx, ly, rx, ry, 28, undefined, 0.25), mix(L.water, L.skyHorizon, 0.3), r, { layers: 20, alpha: 0.1, variance: 0.05, gradientTo: shade(L.water, -0.1), edge: 0.8, opaque: 0.9, texture: 0.4, textureScale: 2 });
  yield;
  // 湖に映る空と森（上の縁に暗い映り込み、中ほどに明るい帯）
  wash(ctx, ellipse(lx - 10, ly - ry * 0.45, rx * 0.82, ry * 0.32, 14, r, 0.3), mix(fdark, L.water, 0.5), r, { layers: 12, alpha: 0.06, variance: 0.3 });
  for (let i = 0; i < 16; i++) {
    const y = ly - ry * 0.2 + r() * ry * 0.9;
    const half = rx * Math.sqrt(Math.max(0, 1 - ((y - ly) / ry) ** 2)) * (0.3 + r() * 0.5);
    const x = lx + (r() - 0.5) * rx * 0.6;
    brush(ctx, [P(x - half, y), P(x + half, y + (r() - 0.5))], 1.6 + r() * 1.6, L.waterLight, r, { alpha: 0.3, bristles: 3, taper: 0.4 });
  }
  yield;
  // 睡蓮の葉と、向こう岸の葦
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const x = lx + Math.cos(a) * rx * (0.5 + r() * 0.4);
    const y = ly + Math.sin(a) * ry * (0.4 + r() * 0.45);
    dab(ctx, x, y, 5 + r() * 4, 1.8 + r() * 1.2, mix(grassD, L.shadow, 0.2), 0.7, r, 0.3);
    dab(ctx, x - 1, y - 0.6, 3 + r() * 2, 1, sunTint(grassL, 0.3), 0.5, r, 0.3);
  }
  for (let i = 0; i < 70; i++) {
    const a = Math.PI + r() * Math.PI;
    const x = lx + Math.cos(a) * (rx + 4);
    const y = ly + Math.sin(a) * (ry + 2);
    blade(ctx, x, y, 8 + r() * 16, (r() - 0.5) * 8, mix(grassD, L.shadow, 0.25 + r() * 0.3), 0.65, 1.2);
  }
  yield;

  // 草の筆づかい（奥は細かく、手前は大きく）
  for (let i = 0; i < 2600; i++) {
    const y = 840 + Math.pow(r(), 0.8) * 580;
    const x = -20 + r() * (WORLD_W + 40);
    if (y < meadowTopY(x)) continue;
    // 川と湖の上には描かない
    if (Math.abs(x - riverXAt(y)) < riverWidth(y) * 0.6 + 4) continue;
    if (((x - lx) / (rx + 6)) ** 2 + ((y - ly) / (ry + 6)) ** 2 < 1) continue;
    const d = depthAt(y);
    const h = 3 + d * 14 * (0.6 + r() * 0.8);
    const c = r() < 0.55 ? mix(grassD, L.shadow, r() * 0.3) : sunTint(grassL, r() * 0.35);
    blade(ctx, x, y, h, (r() - 0.4) * h * 0.7, c, 0.16 + r() * 0.26, 0.5 + d * 1.4);
    if (i % 400 === 399) yield;
  }
  // 花（季節の色の小さな点の群れ）
  for (let cl = 0; cl < 34; cl++) {
    const cx = r() * WORLD_W;
    const cy = 870 + r() * 520;
    if (Math.abs(cx - riverXAt(cy)) < riverWidth(cy)) continue;
    const d = depthAt(cy);
    const color = hex(F.blossoms[Math.floor(r() * F.blossoms.length)]);
    const n = 6 + Math.floor(r() * 14);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 60 * (0.4 + d);
      const y = cy + (r() - 0.5) * 14 * (0.4 + d);
      const s = 0.8 + d * 2.2 * r();
      ctx.fillStyle = rgba(mix(color, L.shadow, L.ambientAmount * 0.5), 0.55 + r() * 0.35);
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  yield;
  // 茂み（草原に点在する低木の固まり。拠点・道・川・湖は避ける）
  const nearPath = (x: number, y: number) =>
    PATHS.some((path) => path.some((p, i) => i > 0 && distSeg(x, y, path[i - 1], p) < 26));
  const nearSlot = (x: number, y: number) => Object.values(SLOTS).some(([sx, sy]) => Math.abs(x - sx) < 95 && y > sy - 70 && y < sy + 40);
  let placed = 0;
  for (let i = 0; i < 400 && placed < 46; i++) {
    const x = -20 + r() * (WORLD_W + 40);
    const y = 860 + r() * 520;
    if (y < meadowTopY(x) + 10) continue;
    if (Math.abs(x - riverXAt(y)) < riverWidth(y) * 0.5 + 26) continue;
    if (((x - lx) / (rx + 34)) ** 2 + ((y - ly) / (ry + 30)) ** 2 < 1) continue;
    if (nearPath(x, y) || nearSlot(x, y)) continue;
    placed++;
    const d = depthAt(y);
    const sz = (5 + r() * 7) * (0.6 + d * 0.9);
    const leaf = hex(F.leaves[Math.floor(r() * F.leaves.length)]);
    const n = 3 + Math.floor(r() * 4);
    wash(ctx, ellipse(x - side * sz * 0.5, y + 1, sz * (1.4 + n * 0.25), sz * 0.3, 9, r), L.shadow, r, { layers: 6, alpha: 0.05, variance: 0.4 });
    for (let k = 0; k < n; k++) {
      const bx = x + (k - n / 2) * sz * 0.7 + (r() - 0.5) * sz * 0.4;
      const by = y - sz * 0.45 - r() * sz * 0.3;
      dab(ctx, bx, by, sz * 0.75, sz * 0.6, mix(mix(leaf, hex(F.grassDark), 0.65), L.shadow, 0.35), 0.85, r, 0.6);
      dab(ctx, bx + side * sz * 0.2, by - sz * 0.2, sz * 0.5, sz * 0.38, mix(mix(leaf, hex(F.grassLight), 0.5), L.sunlight, 0.25), 0.6, r, 0.6);
      if (r() < 0.4) dab(ctx, bx + (r() - 0.5) * sz, by - sz * 0.3, sz * 0.12, sz * 0.1, hex(F.blossoms[Math.floor(r() * F.blossoms.length)]), 0.9, r, 0.2);
    }
    if (placed % 8 === 0) yield;
  }
  yield;
  // 川辺と湖畔の石
  for (let i = 0; i < 22; i++) {
    const onLake = i < 7;
    let x: number;
    let y: number;
    if (onLake) {
      const a = Math.PI * (0.1 + r() * 0.8);
      x = lx + Math.cos(a) * (rx + 6);
      y = ly + Math.sin(a) * (ry + 6);
    } else {
      y = 700 + r() * 700;
      const w = riverWidth(y);
      x = riverXAt(y) + (r() < 0.5 ? -1 : 1) * (w / 2 + 3 + r() * 10);
    }
    const d = depthAt(y);
    const s = 2.5 + d * 9 * (0.5 + r());
    const stone = mix(hex('#a39d8c'), L.sunlight, 0.15);
    dab(ctx, x, y, s, s * 0.62, mix(stone, L.shadow, 0.35), 0.85, r, 0.25);
    dab(ctx, x + side * s * 0.25, y - s * 0.22, s * 0.62, s * 0.36, stone, 0.8, r, 0.25);
  }
  yield;
  paperGrain(ctx, -40, 640, WORLD_W + 80, 780, r, 0.7);
}

function distSeg(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

export const LAYERS: LayerSpec[] = [
  { key: 'sky', y0: 0, y1: 760, parallax: 0.2, paint: paintSky },
  { key: 'far', y0: 200, y1: 720, parallax: 0.5, paint: paintFar },
  { key: 'mid', y0: 540, y1: 920, parallax: 0.78, paint: paintMid },
  { key: 'near', y0: 620, y1: 1420, parallax: 1, paint: paintNear },
];

/** 前景の草むらの上端（実行時に揺れる草を置く場所） */
export function foregroundTop(x: number): number {
  if (x < 260) return 1250 + x * 0.4;
  if (x > 790) return 1230 + (WORLD_W - x) * 0.45;
  return 1500;
}

/** ノイズで木の量や配置を決めるための補助（確定的） */
export const field = (x: number, y: number) => fbm(x * 0.004, y * 0.004, 3);
