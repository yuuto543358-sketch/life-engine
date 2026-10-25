/**
 * 生きている世界の絵（描く準備と、毎フレームの描画）。
 *
 * - 「何を描くか」は世界のエンジンが計算した WorldState だけで決まる（ここでルールは持たない）。
 * - 時刻の光と季節で「どう見えるか」が変わる。描いた絵は光の区切り（30分）ごとに使い回す。
 * - 毎フレーム動くのは見た目の演出だけ（風・水・雲・霧・光・粒子）。世界の中身は変わらない。
 */
import type { WorldState, WorldStructure } from '../../engine/world';
import { clamp01, fbm, hashSeed, hex, makeCanvas, mix, noise2, rgba, rng, shade, type RGB } from '../core';
import { FLORA, lightAt, type Light, type Season } from '../light';
import { runJob, type Handle, type PaintJob } from '../scheduler';
import { loadImage, saveImage, type Img } from '../cache';
import { brush, glow, P, spline, wash, type Pt } from '../watercolor';
import { along, blade, dab, multiplyTint } from './brushes';
import { LAYERS, RIVER_LINE, riverWidth, type Env } from './backdrop';
import { BRIDGES, LAKE, LANTERNS, MONUMENTS, PATHS, PEAKS, TREES, WORLD_W, depthAt, structurePos } from './layout';
import { drawGrassTuft, paintBridge, paintCloud, paintLantern, paintMist, paintMonument, paintStructure, paintTree, type Sprite, type SpriteEnv } from './sprites';

export interface Camera {
  /** 画面の中心に来る世界の点 */
  x: number;
  y: number;
  /** 世界の 1 単位が画面の何 px か */
  s: number;
}

/** 光の区切り（30分ごと）。同じ区切りの間は同じ絵を使う */
export const lightBucket = (hour: number) => Math.floor((((hour % 24) + 24) % 24) * 2) / 2;

/** 拠点と木の大きさ（風景に対して） */
const STRUCTURE_SCALE = 1.65;
const TREE_SCALE = 1.3;

/** 奥行きによる大きさ（遠くは小さく） */
export const depthScale = (y: number) => 0.62 + 0.58 * depthAt(y);

// ------------------------------------------------------------------
// 描いた絵の置き場（同じ光・季節・解像度なら、画面をまたいで使い回す）
// ------------------------------------------------------------------
interface Look {
  key: string;
  L: Light;
  F: (typeof FLORA)[Season];
  season: Season;
  rs: number;
  layers: Map<string, Img>;
  sprites: Map<string, Sprite>;
  pending: Map<string, Promise<void>>;
  details: Map<string, Img>;
  lastUsed: number;
}

const LOOKS = new Map<string, Look>();

function getLook(hour: number, season: Season, rs: number): Look {
  const b = lightBucket(hour);
  const key = `${b}|${season}|${rs}`;
  let look = LOOKS.get(key);
  if (!look) {
    look = { key, L: lightAt(b + 0.25), F: FLORA[season], season, rs, layers: new Map(), sprites: new Map(), pending: new Map(), details: new Map(), lastUsed: 0 };
    LOOKS.set(key, look);
    // 古い絵は 3 つまで残す（記憶を使いすぎないため）
    if (LOOKS.size > 3) {
      const oldest = [...LOOKS.values()].sort((a, b) => a.lastUsed - b.lastUsed)[0];
      if (oldest !== look) LOOKS.delete(oldest.key);
    }
  }
  look.lastUsed = performance.now();
  return look;
}

function spriteEnv(look: Look, k = 1.9): SpriteEnv {
  return { L: look.L, F: look.F, px: look.rs * k };
}

/**
 * 絵を描く作業を一度だけ予約する（同じものを二重に描かない）。
 * 以前に描いて端末に保存してある絵があれば、それを読み込むだけで済ませる。
 */
function once(look: Look, key: string, make: () => PaintJob, front = false): Promise<void> {
  const kind = LAYERS.some((l) => l.key === key) ? 'layer' : key.startsWith('detail:') ? 'detail' : 'sprite';
  if (look.layers.has(key) || look.sprites.has(key) || look.details.has(key)) return Promise.resolve();
  const p = look.pending.get(key);
  if (p) return p;
  const ck = `${look.key}|${key}`;
  const work = async () => {
    const hit = await loadImage(ck);
    if (hit) {
      if (kind === 'sprite') look.sprites.set(key, { ...(hit.meta as Omit<Sprite, 'canvas'>), canvas: hit.img });
      else if (kind === 'layer') look.layers.set(key, hit.img);
      else look.details.set(key, hit.img);
      return;
    }
    const h: Handle = runJob(make(), front);
    await h.done;
    const keep = () => LOOKS.get(look.key) === look;
    if (kind === 'sprite') {
      const sp = look.sprites.get(key);
      if (sp) {
        const { canvas, ...meta } = sp;
        saveImage(ck, canvas, meta, keep);
      }
    } else {
      const img = kind === 'layer' ? look.layers.get(key) : look.details.get(key);
      if (img) saveImage(ck, img, null, keep);
    }
  };
  const done = work()
    .catch((e) => {
      // 1枚の絵が描けなくても、世界の残りは描き続ける
      console.warn('paint failed', key, e);
    })
    .finally(() => look.pending.delete(key));
  look.pending.set(key, done);
  return done;
}

function* layerJob(look: Look, spec: (typeof LAYERS)[number]): PaintJob {
  const { canvas, ctx } = makeCanvas((WORLD_W + 80) * look.rs, (spec.y1 - spec.y0) * look.rs);
  ctx.scale(look.rs, look.rs);
  ctx.translate(40, -spec.y0);
  const env: Env = { L: look.L, F: look.F, season: look.season };
  yield* spec.paint(ctx, env);
  if (spec.key !== 'sky') {
    multiplyTint(ctx, canvas, look.L.ambient, look.L.ambientAmount, () => {
      const { canvas: copy, ctx: c2 } = makeCanvas(canvas.width, canvas.height);
      c2.drawImage(canvas, 0, 0);
      return copy;
    });
  }
  look.layers.set(spec.key, canvas);
}

function* spriteJob(look: Look, key: string, make: () => Sprite): PaintJob {
  yield;
  look.sprites.set(key, make());
}

// ------------------------------------------------------------------
// 状態によって変わる地面（道・橋・湖畔の花）
// ------------------------------------------------------------------
const NEAR = LAYERS.find((l) => l.key === 'near')!;

function* detailJob(look: Look, key: string, state: WorldState, quiet: boolean): PaintJob {
  const rs = look.rs;
  const { canvas, ctx } = makeCanvas((WORLD_W + 80) * rs, (NEAR.y1 - NEAR.y0) * rs);
  ctx.scale(rs, rs);
  ctx.translate(40, -NEAR.y0);
  const { L, F } = look;
  const r = rng(909);
  const earth = mix(mix(hex('#c2ab80'), L.sunlight, 0.15), L.shadow, 0.08);
  if (!quiet) {
    const shown = state.paths.level + (state.paths.level >= 5 ? 1 : 0);
    for (const [i, path] of PATHS.entries()) {
      const line = spline(path, 10);
      if (i < shown) {
        // 踏み固められた道: 幅のある帯を水彩で塗り、中央をすり減った明るさに
        const L2: Pt[] = [];
        const R2: Pt[] = [];
        for (let j = 0; j < line.length; j++) {
          const a = line[Math.max(0, j - 1)];
          const b = line[Math.min(line.length - 1, j + 1)];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const l = Math.hypot(dx, dy) || 1;
          const hw = (3.5 + depthAt(line[j].y) * 10) * (0.9 + noise2(j * 0.3, i) * 0.25);
          L2.push(P(line[j].x - (dy / l) * hw, line[j].y + (dx / l) * hw, 0.3));
          R2.push(P(line[j].x + (dy / l) * hw, line[j].y - (dx / l) * hw, 0.3));
        }
        const ribbon = [...L2, ...R2.reverse()];
        wash(ctx, ribbon.map((q) => P(q.x, q.y + 1.5, 0.3)), mix(earth, L.shadow, 0.45), r, { layers: 6, alpha: 0.05, variance: 0.08 });
        wash(ctx, ribbon, earth, r, { layers: 10, alpha: 0.08, variance: 0.06, opaque: 0.75, texture: 0.5, textureScale: 4, edge: 0.6, granulation: 0.4 });
        brush(ctx, line.map((q) => P(q.x, q.y)), 2 + 3 * depthAt(line[Math.floor(line.length / 2)].y), mix(earth, L.sunlight, 0.4), r, { alpha: 0.22, bristles: 4, taper: 0.1 });
        for (const q of along(line, 7)) {
          const d = depthAt(q.y);
          if (r() < 0.4) dab(ctx, q.x + (r() - 0.5) * (6 + d * 10), q.y + (r() - 0.5) * 3, 0.6 + d, 0.4 + d * 0.6, mix(earth, L.shadow, 0.35), 0.6, r, 0.2);
          if (r() < 0.5) blade(ctx, q.x + q.nx * (5 + d * 8) * (r() < 0.5 ? -1 : 1), q.y + 1, 3 + d * 6, (r() - 0.5) * 4, mix(hex(F.grassDark), L.shadow, 0.2), 0.5, 0.6 + d * 0.6);
        }
      } else {
        // まだ歩いていない道（これから歩ける道）: 点々の印だけ
        for (const q of along(line, 11)) dab(ctx, q.x, q.y, 1 + depthAt(q.y) * 1.6, 0.6 + depthAt(q.y), earth, 0.35, r, 0.2);
      }
      yield;
    }
    // 橋
    for (let i = 0; i < Math.min(BRIDGES.length, state.paths.bridges); i++) {
      const bspec = BRIDGES[i];
      const k = depthScale(bspec.y);
      const sp = paintBridge(bspec.w / k, { L, F, px: rs * k });
      ctx.drawImage(sp.canvas as CanvasImageSource, bspec.x - sp.ax * k, bspec.y - sp.ay * k, sp.w * k, sp.h * k);
      yield;
    }
  }
  // 湖畔の花（静寂の地の記録の数）
  const fr = rng(4242);
  for (let i = 0; i < state.nature.flowers; i++) {
    const a = Math.PI * (0.05 + fr() * 0.9);
    const x = LAKE.x + Math.cos(a) * (LAKE.rx + 10 + fr() * 26);
    const y = LAKE.y + Math.sin(a) * (LAKE.ry + 8 + fr() * 14);
    const color = hex(F.blossoms[i % F.blossoms.length]);
    for (let k = 0; k < 5; k++) {
      blade(ctx, x + (fr() - 0.5) * 6, y + 2, 5 + fr() * 5, (fr() - 0.5) * 3, mix(hex(F.grassDark), L.shadow, 0.2), 0.7, 0.8);
      dab(ctx, x + (fr() - 0.5) * 7, y - 4 - fr() * 4, 1.4, 1.2, mix(color, L.ambient, L.ambientAmount * 0.6), 0.9, fr, 0.2);
    }
  }
  look.details.set(key, canvas);
}

// ------------------------------------------------------------------
// 置かれるもの
// ------------------------------------------------------------------
interface Placed {
  key: string;
  x: number;
  y: number;
  k: number;
  flip: boolean;
  kind: 'tree' | 'structure' | 'monument' | 'lantern';
  structure?: WorldStructure;
  lanternIndex?: number;
  seed: number;
}

function placements(state: WorldState, quiet: boolean): Placed[] {
  const out: Placed[] = [];
  TREES.slice(0, state.nature.trees).forEach((t, i) => {
    out.push({ key: `tree:${t.kind}:${t.seed % 5}`, x: t.x, y: t.y, k: depthScale(t.y) * t.size * TREE_SCALE, flip: t.seed % 2 === 0, kind: 'tree', seed: t.seed + i });
  });
  if (!quiet) {
    for (const s of state.structures) {
      const [x, y] = structurePos(state.structures, s.domainId);
      out.push({ key: `st:${s.kind}:${s.level}:${s.planned ? 1 : 0}`, x, y, k: depthScale(y) * STRUCTURE_SCALE, flip: false, kind: 'structure', structure: s, seed: hashSeed(s.domainId) });
    }
    state.monuments.slice(-MONUMENTS.length).forEach((_m, i) => {
      const [x, y] = MONUMENTS[i];
      out.push({ key: `mon:${i % 3}`, x, y, k: depthScale(y) * 1.3, flip: false, kind: 'monument', seed: i });
    });
    if (state.paths.level >= 1) {
      LANTERNS.forEach(([x, y], i) => out.push({ key: 'lantern', x, y, k: depthScale(y) * 1.4, flip: false, kind: 'lantern', lanternIndex: i, seed: i }));
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

// ------------------------------------------------------------------
// 描画する人
// ------------------------------------------------------------------
export interface SceneOptions {
  /** 静寂の地: 建物や道を描かない、静かな風景 */
  quiet?: boolean;
  /** 動きなし（1枚の絵として描く） */
  still?: boolean;
}

interface Reveal {
  start: number;
}

export class WorldScene {
  state: WorldState;
  hour: number;
  season: Season;
  rs: number;
  opts: SceneOptions;
  look: Look;
  /** 光が変わったときの、前の絵（なめらかに切りかえる） */
  prevLook: Look | null = null;
  fadeStart = 0;
  items: Placed[] = [];
  detailKey = '';
  /** 層ごとの現れ方（描き終えた時刻） */
  shownAt = new Map<string, number>();
  reveals = new Map<string, Reveal>();
  lanternBloom: { from: number; start: number } | null = null;
  onReady?: () => void;

  constructor(state: WorldState, hour: number, season: Season, rs: number, opts: SceneOptions = {}) {
    this.state = state;
    this.hour = hour;
    this.season = season;
    this.rs = rs;
    this.opts = opts;
    this.look = getLook(hour, season, rs);
    this.items = placements(state, !!opts.quiet);
    this.prepare(this.look);
  }

  /** 必要な絵を描く予約をする（遠くから順に） */
  private prepare(look: Look) {
    const mark = (k: string) => () => {
      if (!this.shownAt.has(`${look.key}:${k}`)) this.shownAt.set(`${look.key}:${k}`, performance.now());
      this.onReady?.();
    };
    for (const spec of LAYERS) once(look, spec.key, () => layerJob(look, spec)).then(mark(spec.key));
    const env = spriteEnv(look);
    this.detailKey = `${this.opts.quiet ? 'q' : 'w'}:${this.state.paths.level}:${this.state.paths.bridges}:${this.state.nature.flowers}`;
    once(look, `detail:${this.detailKey}`, () => detailJob(look, `detail:${this.detailKey}`, this.state, !!this.opts.quiet)).then(mark('detail'));
    for (const it of this.items) {
      const key = it.key;
      once(look, key, () =>
        spriteJob(look, key, () => {
          const [kind, a, b, c] = key.split(':');
          if (kind === 'tree') return paintTree(+a as 0 | 1, 1000 + +b * 7919 + (+a) * 31, env, look.season);
          if (kind === 'st') return paintStructure(a as WorldStructure['kind'], +b, c === '1', env, hashSeed(a));
          if (kind === 'mon') return paintMonument(70 + +a, env);
          return paintLantern(env);
        }),
      ).then(mark(key));
    }
    if (!this.opts.still) {
      for (let i = 0; i < 4; i++) once(look, `cloud:${i}`, () => spriteJob(look, `cloud:${i}`, () => paintCloud(500 + i * 13, { ...env, px: look.rs * 0.6 })));
      for (let i = 0; i < 3; i++) once(look, `mist:${i}`, () => spriteJob(look, `mist:${i}`, () => paintMist(600 + i * 17, { ...env, px: look.rs * 0.5 })));
    }
  }

  /** 世界の状態が変わった（記録を保存したなど） */
  setState(state: WorldState) {
    const prev = this.state;
    this.state = state;
    this.items = placements(state, !!this.opts.quiet);
    // 段階が上がった拠点は、育つ演出をする
    for (const s of state.structures) {
      const before = prev.structures.find((p) => p.domainId === s.domainId);
      if (before && s.level > before.level) this.reveals.set(s.domainId, { start: performance.now() });
    }
    if (state.lanterns > prev.lanterns) this.lanternBloom = { from: prev.lanterns, start: performance.now() };
    this.prepare(this.look);
  }

  /** 前回見たときより育った拠点を、育つ演出つきで見せる */
  revealSince(levels: Record<string, number>) {
    for (const s of this.state.structures) {
      if (levels[s.domainId] !== undefined && s.level > levels[s.domainId]) this.reveals.set(s.domainId, { start: performance.now() + 900 });
    }
  }

  setHour(hour: number) {
    if (lightBucket(hour) === lightBucket(this.hour)) {
      this.hour = hour;
      return;
    }
    this.hour = hour;
    const next = getLook(hour, this.season, this.rs);
    if (next === this.look) return;
    this.prevLook = this.look;
    this.look = next;
    this.fadeStart = 0;
    this.prepare(next);
  }

  /** 最初に見せるのに必要な絵がそろったか */
  isReady(look = this.look): boolean {
    return LAYERS.every((l) => look.layers.has(l.key)) && look.details.has(`detail:${this.detailKey}`) && this.items.every((it) => look.sprites.has(it.key));
  }

  // ---------------- 毎フレームの描画 ----------------

  /**
   * ctx は CSS ピクセル単位に合わせてあること。W, H は CSS ピクセル。
   * base は既定のカメラ（視差の基準）、cam は今のカメラ。t は秒。
   */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, base: Camera, cam: Camera, t: number, now: number) {
    let look = this.look;
    let alpha = 1;
    if (this.prevLook) {
      if (this.isReady(look)) {
        if (!this.fadeStart) this.fadeStart = now;
        const f = clamp01((now - this.fadeStart) / 2500);
        if (f >= 1) this.prevLook = null;
        else {
          this.drawLook(ctx, W, H, base, cam, t, now, this.prevLook, 1);
          alpha = f;
        }
      } else look = this.prevLook;
    }
    this.drawLook(ctx, W, H, base, cam, t, now, look, alpha);
  }

  private camFor(base: Camera, cam: Camera, p: number): Camera {
    return { x: base.x + (cam.x - base.x) * p, y: base.y + (cam.y - base.y) * p, s: base.s + (cam.s - base.s) * p };
  }

  private drawLook(ctx: CanvasRenderingContext2D, W: number, H: number, base: Camera, cam: Camera, t: number, now: number, look: Look, alpha: number) {
    const { L } = look;
    const still = !!this.opts.still;
    const sky = look.layers.get('sky');
    ctx.save();
    ctx.globalAlpha = alpha;
    // 空（絵がまだなら、光の色だけで）
    const c0 = this.camFor(base, cam, 0.2);
    const toScreen = (c: Camera) => (wx: number, wy: number): [number, number] => [(wx - c.x) * c.s + W / 2, (wy - c.y) * c.s + H / 2];
    {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgba(L.skyTop));
      g.addColorStop(0.6, rgba(L.skyHorizon));
      g.addColorStop(1, rgba(mix(L.skyHorizon, hex(look.F.grassDark), 0.6)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const layerAlpha = (key: string) => {
      const at = this.shownAt.get(`${look.key}:${key}`);
      if (at === undefined) return 0;
      return still ? 1 : clamp01((now - at) / 700);
    };
    const drawLayer = (key: string, p: number, y0: number) => {
      const img = key.startsWith('detail') ? look.details.get(key) : look.layers.get(key);
      if (!img) return;
      const a = layerAlpha(key.startsWith('detail') ? 'detail' : key);
      if (a <= 0) return;
      const c = this.camFor(base, cam, p);
      const [sx, sy] = toScreen(c)(-40, y0);
      ctx.globalAlpha = alpha * a;
      ctx.drawImage(img as CanvasImageSource, sx, sy, img.width / look.rs * c.s, img.height / look.rs * c.s);
      ctx.globalAlpha = alpha;
    };
    if (sky) drawLayer('sky', 0.2, 0);

    // 星・月・太陽
    this.drawSkyLights(ctx, toScreen(c0), c0, look, t, still);
    // 雲
    if (!still) this.drawClouds(ctx, W, toScreen(this.camFor(base, cam, 0.15)), this.camFor(base, cam, 0.15), look, t);

    drawLayer('far', 0.5, 200);
    if (!this.opts.quiet) this.drawFlags(ctx, toScreen(this.camFor(base, cam, 0.5)), this.camFor(base, cam, 0.5), look, t, still);
    this.drawMist(ctx, toScreen(this.camFor(base, cam, 0.6)), this.camFor(base, cam, 0.6), look, t, 560, 0.55 + this.state.mist * 0.45, still);
    drawLayer('mid', 0.78, 540);
    this.drawMist(ctx, toScreen(this.camFor(base, cam, 0.85)), this.camFor(base, cam, 0.85), look, t + 40, 650, 0.25 + this.state.mist * 0.5, still);
    drawLayer('near', 1, 620);
    drawLayer(`detail:${this.detailKey}`, 1, 620);

    const S = toScreen(cam);
    if (!still) this.drawWater(ctx, S, cam, look, t);
    this.drawItems(ctx, S, cam, look, t, now, still);
    this.drawGlows(ctx, S, cam, look, t, now, still);
    if (!still) {
      this.drawFireflies(ctx, S, cam, look, t);
      this.drawParticles(ctx, W, H, look, t);
      this.drawBirds(ctx, S, cam, look, t);
      this.drawRays(ctx, W, H, toScreen(c0), look, t);
      this.drawForeground(ctx, S, cam, look, t);
    }
    ctx.restore();
  }

  private drawSkyLights(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number, still: boolean) {
    const { L } = look;
    if (L.stars > 0.02) {
      const r = rng(31);
      for (let i = 0; i < 140; i++) {
        const x = r() * WORLD_W;
        const y = r() * 520;
        const size = 0.35 + r() * r() * 1.5;
        const ph = r() * 10;
        const tw = still ? 0.8 : 0.55 + 0.45 * Math.sin(t * (0.8 + (i % 5) * 0.4) + ph);
        const [sx, sy] = S(x, y);
        ctx.fillStyle = `rgba(246,240,222,${(0.35 + 0.65 * tw) * L.stars * (1 - y / 700)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size * Math.max(0.8, c.s * 1.2), 0, Math.PI * 2);
        ctx.fill();
        if (size > 1.3) {
          ctx.strokeStyle = `rgba(246,240,222,${0.25 * tw * L.stars})`;
          ctx.lineWidth = 0.6;
          const l = size * 3.2;
          ctx.beginPath();
          ctx.moveTo(sx - l, sy);
          ctx.lineTo(sx + l, sy);
          ctx.moveTo(sx, sy - l);
          ctx.lineTo(sx, sy + l);
          ctx.stroke();
        }
      }
      // 流れ星（ときどき）
      if (!still && L.stars > 0.5) {
        const cycle = 17;
        const k = Math.floor(t / cycle);
        const u = (t % cycle) / 1.1;
        if (u < 1) {
          const rr = rng(k * 7 + 3);
          const x0 = 150 + rr() * 700;
          const y0 = 60 + rr() * 160;
          const [ax, ay] = S(x0 + u * 160, y0 + u * 70);
          const [bx, by] = S(x0 + u * 160 - 60, y0 + u * 70 - 26);
          const g = ctx.createLinearGradient(ax, ay, bx, by);
          g.addColorStop(0, `rgba(255,248,230,${0.8 * (1 - u)})`);
          g.addColorStop(1, 'rgba(255,248,230,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
    }
    const [sx, sy] = S(L.sunX * WORLD_W, L.sunY * 1000);
    const rad = 26 * c.s;
    if (L.sunVisible > 0) {
      const pulse = still ? 1 : 1 + Math.sin(t * 0.7) * 0.04;
      glow(ctx, sx, sy, rad * 5 * pulse, L.sunColor, 0.22 * L.sunVisible);
      glow(ctx, sx, sy, rad * 2.2, L.sunColor, 0.45 * L.sunVisible);
      ctx.fillStyle = rgba(mix(L.sunColor, [255, 255, 255], 0.5), 0.9 * L.sunVisible);
      ctx.beginPath();
      ctx.arc(sx, sy, rad * 0.75, 0, Math.PI * 2);
      ctx.fill();
    } else if (L.moonVisible > 0) {
      glow(ctx, sx, sy, rad * 5, [220, 222, 210], 0.16);
      ctx.fillStyle = 'rgba(240,236,220,0.95)';
      ctx.beginPath();
      ctx.arc(sx, sy, rad * 0.7, 0, Math.PI * 2);
      ctx.fill();
      // 月の模様と欠け
      const r = rng(77);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = 'rgba(160,160,150,0.25)';
        ctx.beginPath();
        ctx.arc(sx + (r() - 0.5) * rad * 0.8, sy + (r() - 0.5) * rad * 0.8, rad * (0.08 + r() * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba(L.skyTop, 0.88);
      ctx.beginPath();
      ctx.arc(sx + rad * 0.38, sy - rad * 0.2, rad * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawClouds(ctx: CanvasRenderingContext2D, W: number, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number) {
    const night = look.L.ambientAmount;
    for (let i = 0; i < 4; i++) {
      const sp = look.sprites.get(`cloud:${i}`);
      if (!sp) continue;
      const span = WORLD_W + 900;
      const speed = 2.2 + i * 0.9;
      const x = ((i * 397 + t * speed) % span) - 450;
      const y = 110 + i * 70 + Math.sin(i * 2.1) * 30;
      const [sx, sy] = S(x, y);
      const k = (0.75 + (i % 2) * 0.3) * c.s;
      if (sx - sp.ax * k > W + 20 || sx + (sp.w - sp.ax) * k < -20) continue;
      ctx.globalAlpha = 0.85 - night * 0.55;
      ctx.drawImage(sp.canvas as CanvasImageSource, sx - sp.ax * k, sy - sp.ay * k, sp.w * k, sp.h * k);
      ctx.globalAlpha = 1;
    }
  }

  private drawMist(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number, y: number, amount: number, still: boolean) {
    const morning = look.L.hour > 4.5 && look.L.hour < 9 ? 0.35 : 0;
    const a = clamp01(amount + morning) * 0.8;
    for (let i = 0; i < 5; i++) {
      const sp = look.sprites.get(`mist:${i % 3}`);
      if (!sp) continue;
      const span = WORLD_W + 500;
      const x = still ? i * 240 : ((i * 263 + t * (3 + (i % 3) * 1.5)) % span) - 250;
      const yy = y + (i % 3) * 18 - 10 + Math.sin(t * 0.1 + i) * 4;
      const [sx, sy] = S(x, yy);
      const k = c.s * (1 + (i % 2) * 0.3);
      ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 0.13 + i * 1.7));
      ctx.drawImage(sp.canvas as CanvasImageSource, sx - sp.ax * k, sy - sp.ay * k, sp.w * k, sp.h * k);
    }
    ctx.globalAlpha = 1;
  }

  private drawFlags(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number, still: boolean) {
    const flags = this.state.flags.slice(0, PEAKS.length);
    flags.forEach((_, i) => {
      const [px, py] = PEAKS[i];
      const [x, y] = S(px, py - 2);
      const s = c.s * 1.1;
      ctx.strokeStyle = rgba(mix(hex('#4a3a2a'), look.L.shadow, 0.2), 0.9);
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 30 * s);
      ctx.stroke();
      // はためく布
      const cloth = mix(hex('#d6b878'), look.L.ambient, look.L.ambientAmount * 0.5);
      ctx.fillStyle = rgba(cloth, 0.95);
      ctx.beginPath();
      const n = 8;
      const top: [number, number][] = [];
      const bot: [number, number][] = [];
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const wave = still ? Math.sin(u * 3) * 1.5 : Math.sin(u * 4 - t * 5 + i) * 2.4 * u + Math.sin(t * 2.3 + u * 2) * 0.8 * u;
        top.push([x + u * 18 * s, y - 30 * s + wave * s + u * 2 * s]);
        bot.push([x + u * 16 * s, y - 20 * s + wave * s + u * 1 * s]);
      }
      ctx.moveTo(top[0][0], top[0][1]);
      for (const p of top) ctx.lineTo(p[0], p[1]);
      for (const p of bot.reverse()) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(shade(cloth, -0.4), 0.5);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    });
  }

  private drawWater(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number) {
    const { L } = look;
    // 川のきらめき（流れに乗って下っていく）
    const pts = RIVER_LINE;
    const total = pts.length - 1;
    const r = rng(55);
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const speed = 0.012 + r() * 0.01;
      const u = (r() + t * speed) % 1;
      const fi = u * total;
      const i0 = Math.floor(fi);
      const a = pts[i0];
      const b = pts[Math.min(total, i0 + 1)];
      const f = fi - i0;
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      const w = riverWidth(y);
      const off = (r() - 0.5) * w * 0.7;
      const tw = Math.max(0, Math.sin(t * (1.5 + r() * 2) + r() * 6));
      const d = depthAt(y);
      const [sx, sy] = S(x + off, y);
      const len = (2 + d * 9) * c.s;
      ctx.strokeStyle = rgba(L.waterLight, 0.55 * tw * (0.3 + d * 0.7));
      ctx.lineWidth = (0.6 + d * 1.2) * c.s;
      ctx.beginPath();
      ctx.moveTo(sx - len, sy);
      ctx.lineTo(sx + len, sy);
      ctx.stroke();
    }
    // 湖の波紋
    for (let i = 0; i < 4; i++) {
      const cycle = 5 + i * 1.3;
      const u = ((t + i * 2.1) % cycle) / cycle;
      const rr = rng(Math.floor((t + i * 2.1) / cycle) * 13 + i);
      const x = LAKE.x + (rr() - 0.5) * LAKE.rx * 1.2;
      const y = LAKE.y + (rr() - 0.5) * LAKE.ry * 0.9;
      const [sx, sy] = S(x, y);
      ctx.strokeStyle = rgba(L.waterLight, 0.4 * (1 - u));
      ctx.lineWidth = 0.8 * c.s;
      ctx.beginPath();
      ctx.ellipse(sx, sy, (4 + u * 26) * c.s, (1.2 + u * 7) * c.s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 月や夕日が湖に映る光の道
    const shine = Math.max(L.moonVisible * 0.8, L.rays * 0.6);
    if (shine > 0.05) {
      for (let k = 0; k < 9; k++) {
        const y = LAKE.y - LAKE.ry * 0.5 + (k / 8) * LAKE.ry * 1.2;
        const wob = Math.sin(t * 1.6 + k * 1.3) * 6;
        const half = (8 + k * 2) * (0.6 + 0.4 * Math.sin(t * 2 + k));
        const [sx, sy] = S(LAKE.x + 40 + wob, y);
        ctx.strokeStyle = rgba(L.waterLight, shine * 0.45);
        ctx.lineWidth = 1.2 * c.s;
        ctx.beginPath();
        ctx.moveTo(sx - half * c.s, sy);
        ctx.lineTo(sx + half * c.s, sy);
        ctx.stroke();
      }
    }
  }

  private wind(t: number, x: number) {
    return noise2(t * 0.22 + x * 0.003, 0.5) * 0.8 + Math.sin(t * 1.1 + x * 0.04) * 0.25 + Math.max(0, noise2(t * 0.05, 3)) * 0.8;
  }

  private drawItems(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number, now: number, still: boolean) {
    for (const it of this.items) {
      const sp = look.sprites.get(it.key);
      if (!sp) continue;
      const fade = still ? 1 : clamp01((now - (this.shownAt.get(`${look.key}:${it.key}`) ?? now)) / 600);
      const [x, y] = S(it.x, it.y);
      let k = it.k * c.s;
      let a = fade;
      let lift = 0;
      const rev = it.structure ? this.reveals.get(it.structure.domainId) : undefined;
      if (rev && !still) {
        const u = (now - rev.start) / 1800;
        if (u < 0) a = 0;
        else if (u < 1) {
          // 育つ: 小さく現れて、少し大きくなってから落ち着く
          const e = 1 - Math.pow(1 - u, 3);
          const back = 1 + Math.sin(u * Math.PI) * 0.08;
          k *= (0.55 + 0.45 * e) * back;
          a *= clamp01(u * 3);
          lift = (1 - e) * 6;
        } else if (u > 3) this.reveals.delete(it.structure!.domainId);
      }
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y - lift * c.s);
      if (sp.sway && !still) {
        const sk = this.wind(t, it.x) * 0.05 * sp.sway;
        ctx.transform(1, 0, sk, 1, 0, 0);
      }
      if (it.flip) ctx.scale(-1, 1);
      ctx.drawImage(sp.canvas as CanvasImageSource, -sp.ax * k, -sp.ay * k, sp.w * k, sp.h * k);
      ctx.restore();
      if (rev && !still) this.drawRevealBurst(ctx, x, y, k, now - rev.start);
      // 煙突の煙と、噴水のしぶき
      if (!still && it.kind === 'structure') {
        for (const [j, sm] of sp.smoke.entries()) this.drawSmoke(ctx, x + sm.x * k, y + sm.y * k, k, t, j + it.seed, look, sm.kind ?? 'smoke');
      }
    }
  }

  private drawRevealBurst(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, ms: number) {
    const u = ms / 2200;
    if (u < 0 || u > 1) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = rng(9);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const sp = 20 + r() * 40;
      const px = x + Math.cos(a) * sp * u * k;
      const py = y - 30 * k + Math.sin(a) * sp * 0.6 * u * k - u * 30 * k;
      ctx.fillStyle = `rgba(242,212,143,${(1 - u) * 0.8})`;
      ctx.beginPath();
      ctx.arc(px, py, (1.5 + r() * 1.5) * k * (1 - u * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = `rgba(242,212,143,${(1 - u) * 0.6})`;
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.ellipse(x, y, 60 * u * k, 16 * u * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSmoke(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, t: number, seed: number, look: Look, kind: 'smoke' | 'spray') {
    const { L } = look;
    if (kind === 'spray') {
      for (let i = 0; i < 10; i++) {
        const u = ((t * 0.9 + i / 10 + seed * 0.13) % 1);
        const a = (i / 10 - 0.5) * 1.6;
        const px = x + Math.sin(a) * u * 10 * k;
        const py = y - (Math.sin(u * Math.PI) * 9 - u * 2) * k;
        ctx.fillStyle = rgba(L.waterLight, 0.6 * (1 - u));
        ctx.beginPath();
        ctx.arc(px, py, 0.9 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    const col = mix(L.mist, [150, 145, 140], 0.35);
    for (let i = 0; i < 9; i++) {
      const u = ((t * 0.12 + i / 9 + seed * 0.37) % 1);
      const drift = this.wind(t - u * 4, x) * 18 * u + u * 10;
      const px = x + drift * k;
      const py = y - u * 46 * k;
      const rad = (2.5 + u * 9) * k;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      const a = 0.32 * Math.sin(Math.min(1, u * 4) * Math.PI * 0.5) * (1 - u);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
  }

  private drawGlows(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number, now: number, still: boolean) {
    const { L } = look;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const warm: RGB = [255, 196, 110];
    for (const it of this.items) {
      const sp = look.sprites.get(it.key);
      if (!sp) continue;
      const k = it.k * c.s;
      const [x, y] = S(it.x, it.y);
      if (it.kind === 'lantern') {
        const i = it.lanternIndex ?? 0;
        if (i >= this.state.lanterns) continue;
        let bloom = 1;
        if (this.lanternBloom && i >= this.lanternBloom.from && !still) {
          const u = (now - this.lanternBloom.start) / 2400;
          if (u > 1.5) this.lanternBloom = null;
          else {
            bloom = u < 0 ? 0 : 1 + Math.max(0, 1 - u) * 2.2;
            if (u >= 0 && u < 1) {
              ctx.strokeStyle = rgba(warm, 0.5 * (1 - u));
              ctx.lineWidth = 1.5 * k;
              ctx.beginPath();
              ctx.ellipse(x, y - 16 * k, 40 * u * k, 40 * u * k, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
        const flick = still ? 1 : 0.85 + 0.15 * Math.sin(t * 9 + i * 2) * Math.sin(t * 5.3 + i);
        const strength = (0.4 + L.glow * 0.6) * flick * bloom;
        for (const l of sp.lights) glow(ctx, x + l.x * k, y + l.y * k, 22 * k * Math.min(2.5, bloom), warm, 0.55 * strength);
        continue;
      }
      if (L.glow < 0.05) continue;
      for (const [j, l] of sp.lights.entries()) {
        const flick = still ? 1 : 0.9 + 0.1 * Math.sin(t * 3 + j * 1.7 + it.seed);
        glow(ctx, x + l.x * k, y + l.y * k, l.r * 3.2 * k, warm, 0.32 * L.glow * flick);
      }
    }
    ctx.restore();
  }

  private drawFireflies(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number) {
    const n = this.state.nature.fireflies;
    if (!n) return;
    const { L } = look;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const fx = LAKE.x + fbm(t * 0.05 + i * 3.1, i * 1.7, 2) * LAKE.rx * 1.6;
      const fy = LAKE.y - 18 + fbm(i * 2.3, t * 0.05 + i, 2) * 50;
      const blink = Math.max(0, Math.sin(t * 1.3 + i * 2.4)) ** 2;
      const [sx, sy] = S(fx, fy);
      const a = (0.25 + 0.75 * L.glow) * (0.3 + 0.7 * blink);
      glow(ctx, sx, sy, 9 * c.s + 3, [214, 236, 140], 0.5 * a);
      ctx.fillStyle = `rgba(248,255,200,${a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.1 * Math.max(1, c.s), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, W: number, H: number, look: Look, t: number) {
    const season = look.season;
    const r = rng(1234);
    const n = season === 'winter' ? 70 : season === 'autumn' ? 26 : season === 'spring' ? 30 : 18;
    const colors = look.F.drift.map(hex);
    for (let i = 0; i < n; i++) {
      const depth = 0.6 + r() * 0.8;
      const fall = season === 'winter' ? 16 + r() * 14 : season === 'summer' ? -3 - r() * 3 : 10 + r() * 10;
      const x0 = r() * (W + 100) - 50;
      const y0 = r() * (H + 100);
      const ph = r() * 10;
      const w = this.wind(t * 0.5, x0) * 30;
      const x = ((x0 + t * (12 + w) * depth + Math.sin(t * 0.8 + ph) * 18) % (W + 100) + W + 100) % (W + 100) - 50;
      const y = ((y0 + t * fall * depth) % (H + 100) + H + 100) % (H + 100) - 50;
      const col = colors[i % colors.length];
      const nightDim = 1 - look.L.ambientAmount * 0.6;
      if (season === 'winter') {
        ctx.fillStyle = `rgba(255,255,255,${(0.5 + 0.4 * depth) * nightDim})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + depth * 1.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (season === 'summer') {
        // 綿毛・花粉（光をうけて浮かぶ）
        ctx.fillStyle = rgba(mix(col, look.L.sunlight, 0.5), 0.55 * depth * nightDim);
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + depth, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 花びら・葉（回りながら舞う）
        const rot = t * (1 + (i % 3)) + ph;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(1, Math.abs(Math.sin(rot * 0.7)) * 0.7 + 0.3);
        ctx.fillStyle = rgba(mix(col, look.L.ambient, look.L.ambientAmount * 0.5), 0.85);
        ctx.beginPath();
        const s = (season === 'autumn' ? 3.2 : 2.4) * depth;
        ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        if (season === 'autumn') {
          ctx.strokeStyle = rgba(shade(col, -0.35), 0.6);
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(-s, 0);
          ctx.lineTo(s, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  private drawBirds(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number) {
    if (look.L.ambientAmount > 0.3) return;
    const cycle = 38;
    const k = Math.floor(t / cycle);
    const u = (t % cycle) / 22;
    if (u > 1) return;
    const rr = rng(k * 11 + 5);
    const dir = rr() < 0.5 ? 1 : -1;
    const y0 = 300 + rr() * 180;
    const count = 3 + Math.floor(rr() * 4);
    ctx.strokeStyle = rgba(mix(hex('#2f3a3a'), look.L.haze, 0.3), 0.8);
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const bx = (dir > 0 ? -100 : WORLD_W + 100) + dir * u * (WORLD_W + 200) - dir * i * 22 + Math.sin(i * 1.7) * 10;
      const by = y0 + i * 9 * (i % 2 ? 1 : -1) + Math.sin(t * 0.8 + i) * 6;
      const [sx, sy] = S(bx, by);
      const flap = Math.sin(t * 9 + i * 1.3);
      const span = 6 * c.s + 2;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(sx - span, sy - flap * span * 0.6);
      ctx.quadraticCurveTo(sx - span * 0.4, sy - span * 0.3 - flap * span * 0.2, sx, sy);
      ctx.quadraticCurveTo(sx + span * 0.4, sy - span * 0.3 - flap * span * 0.2, sx + span, sy - flap * span * 0.6);
      ctx.stroke();
    }
  }

  private drawRays(ctx: CanvasRenderingContext2D, W: number, H: number, S: (x: number, y: number) => [number, number], look: Look, t: number) {
    const { L } = look;
    if (L.rays < 0.05 || L.sunVisible <= 0) return;
    const [sx, sy] = S(L.sunX * WORLD_W, L.sunY * 1000);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * 0.5 + (i - 3) * 0.16 + Math.sin(t * 0.07 + i) * 0.03 + (L.sunX - 0.5) * -0.6;
      const len = H * 1.4;
      const wdt = 0.035 + (i % 3) * 0.012;
      const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
      const al = L.rays * (0.09 + 0.04 * Math.sin(t * 0.3 + i * 2));
      g.addColorStop(0, rgba(L.sunColor, al));
      g.addColorStop(1, rgba(L.sunColor, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a - wdt) * len, sy + Math.sin(a - wdt) * len);
      ctx.lineTo(sx + Math.cos(a + wdt) * len, sy + Math.sin(a + wdt) * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    void W;
  }

  private drawForeground(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => [number, number], c: Camera, look: Look, t: number) {
    const col = mix(hex(look.F.grassDark), look.L.shadow, 0.45);
    const spots: [number, number][] = [[30, 1330], [90, 1352], [150, 1380], [880, 1330], [940, 1310], [990, 1350]];
    for (const [i, [x, y]] of spots.entries()) {
      const [sx, sy] = S(x, y);
      drawGrassTuft(ctx, sx, sy, c.s * 1.3, t, col, 0.75, i * 19 + 3);
    }
  }

  /** 画面上の点に、どの拠点があるか */
  hitTest(px: number, py: number, W: number, H: number, cam: Camera): WorldStructure | null {
    let best: { s: WorldStructure; d: number } | null = null;
    for (const it of this.items) {
      if (it.kind !== 'structure' || !it.structure) continue;
      const k = it.k * cam.s;
      const sx = (it.x - cam.x) * cam.s + W / 2;
      const sy = (it.y - cam.y) * cam.s + H / 2;
      const inside = px > sx - 50 * k && px < sx + 50 * k && py > sy - 70 * k && py < sy + 14 * k;
      if (!inside) continue;
      const d = Math.hypot(px - sx, py - (sy - 25 * k));
      if (!best || d < best.d) best = { s: it.structure, d };
    }
    return best?.s ?? null;
  }

  /** 拠点の世界での位置 */
  positionOf(domainId: string): [number, number] | null {
    const it = this.items.find((i) => i.structure?.domainId === domainId);
    return it ? [it.x, it.y] : null;
  }
}

/** 端末に合った、絵の細かさ（1 世界単位あたりの画素数） */
export function deviceRenderScale(): number {
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  return Math.round(Math.max(0.8, Math.min(1.56, dpr * 0.78)) * 4) / 4;
}

export { type Season };
