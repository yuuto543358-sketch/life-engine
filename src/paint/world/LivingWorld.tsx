import { useEffect, useRef, useState } from 'react';
import type { WorldState, WorldStructure } from '../../engine/world';
import { ERA_LABELS } from '../../engine/world';
import { seasonOf } from '../light';
import { WORLD_W } from './layout';
import { WorldScene, deviceRenderScale, type Camera } from './scene';

export type WorldFrame = 'hero' | 'lake' | 'full' | { x: number; y: number; span: number };

export interface LivingWorldProps {
  state: WorldState;
  /** 見せ方: hero = 世界の中心（下に情報のシートが重なる）、lake = 静寂の地の水辺、full = 全体 */
  frame?: WorldFrame;
  /** 建物や道を描かない静かな風景 */
  quiet?: boolean;
  /** 動かさない 1 枚の絵（年代記の「この月の世界」など） */
  still?: boolean;
  /** 光の時刻（指定しなければ端末の時刻） */
  hour?: number;
  /** この拠点に近づく（null で元に戻る） */
  focus?: string | null;
  onSelect?: (s: WorldStructure) => void;
  /** 前回見たときから育った拠点を、育つ演出で見せる（記録する場所の名前） */
  revealKey?: string;
  /** hero のとき、絵が見えている高さの割合（下の部分はシートに隠れる） */
  visible?: number;
  className?: string;
}

const nowHour = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

function isReduced() {
  return document.documentElement.dataset.reduced === 'true';
}

function baseCamera(frame: WorldFrame, W: number, H: number, visible: number): Camera {
  if (typeof frame === 'object') {
    // 世界の一部分（横幅 span の範囲）を切り取って見せる
    const s = W / frame.span;
    return clampCam({ x: frame.x, y: frame.y, s }, W, H);
  }
  if (frame === 'lake') {
    // 水辺を、少し上から見おろす（水辺が画面のまん中より少し下に来る）
    const s = Math.max(H / 720, W / 680);
    return clampCam({ x: 300, y: 1196 - H * 0.08 / s, s }, W, H);
  }
  if (frame === 'full') {
    const s = Math.max(H / 1180, W / 1060);
    return clampCam({ x: WORLD_W / 2, y: 220 + H / 2 / s, s }, W, H);
  }
  const visH = H * visible;
  const s = Math.max(visH / 900, W / 1000);
  // 見えている部分の上端を 380 あたりに合わせる（山の頂から谷の手前まで）
  return clampCam({ x: 520, y: 390 + H / 2 / s, s }, W, H, H * (1 - visible));
}

/** カメラが世界の外を映さないようにする。hidden は画面の下のシートに隠れる高さ（px） */
function clampCam(c: Camera, W: number, H: number, hidden = 0): Camera {
  const halfW = W / 2 / c.s;
  const halfH = H / 2 / c.s;
  const x = Math.min(WORLD_W + 30 - halfW, Math.max(-30 + halfW, c.x));
  const y = Math.min(1420 - halfH + hidden / c.s, Math.max(halfH, c.y));
  return { x, y, s: c.s };
}

/**
 * 生きている世界の絵。WorldState だけを見て描き、ルールは持たない。
 * 動きは見た目のための演出で、「動きを抑える」設定では 1 枚の絵になる。
 */
export function LivingWorld({ state, frame = 'hero', quiet, still, hour, focus = null, onSelect, revealKey, visible = 0.62, className }: LivingWorldProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WorldScene | null>(null);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const markReady = () => {
    if (readyRef.current) return;
    readyRef.current = true;
    setReady(true);
  };
  const [zoomed, setZoomed] = useState(false);
  const live = useRef({
    W: 0,
    H: 0,
    dpr: 1,
    base: { x: 500, y: 900, s: 0.5 } as Camera,
    cam: { x: 500, y: 900, s: 0.5 } as Camera,
    target: null as Camera | null,
    vel: { x: 0, y: 0 },
    drag: null as null | { id: number; x: number; y: number; sx: number; sy: number; moved: boolean; t: number },
    userCam: null as Camera | null,
    raf: 0,
    visible: true,
    t0: performance.now(),
    dirty: true,
  });
  const frameKey = typeof frame === 'object' ? `${frame.x},${frame.y},${frame.span}` : frame;
  const hiddenPx = () => (frame === 'hero' ? live.current.H * (1 - visible) : 0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 場面をつくる（一度だけ）
  if (!sceneRef.current) {
    sceneRef.current = new WorldScene(state, hour ?? nowHour(), seasonOf(state.asOf), deviceRenderScale(), { quiet, still });
  }
  const scene = sceneRef.current;

  // 世界の状態が変わったら、描くものを入れかえる
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scene.setState(state);
    live.current.dirty = true;
  }, [scene, state]);

  // 時刻の光（1分ごとに見直す）
  useEffect(() => {
    if (hour !== undefined) {
      scene.setHour(hour);
      return;
    }
    const id = window.setInterval(() => {
      scene.setHour(nowHour());
      live.current.dirty = true;
    }, 60_000);
    return () => window.clearInterval(id);
  }, [scene, hour]);

  // 前回から育った拠点を、育つ演出で見せる
  useEffect(() => {
    if (!revealKey) return;
    try {
      const prev = JSON.parse(localStorage.getItem(revealKey) ?? 'null') as Record<string, number> | null;
      if (prev) scene.revealSince(prev);
      localStorage.setItem(revealKey, JSON.stringify(Object.fromEntries(state.structures.map((s) => [s.domainId, s.level]))));
    } catch {
      // 保存できない環境では演出を省く
    }
  }, [revealKey, scene, state.structures]);

  // 描画のループ
  useEffect(() => {
    const box = boxRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const L = live.current;

    const resize = () => {
      const rect = box.getBoundingClientRect();
      L.W = Math.max(1, rect.width);
      L.H = Math.max(1, rect.height);
      L.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(L.W * L.dpr);
      canvas.height = Math.round(L.H * L.dpr);
      L.base = baseCamera(frame, L.W, L.H, visible);
      if (!L.userCam && !L.target) L.cam = { ...L.base };
      L.dirty = true;
      kick();
    };

    const step = (dt: number, now: number) => {
      const t = (now - L.t0) / 1000;
      // 目標のカメラへ、ばねのようになめらかに近づく
      if (L.target) {
        const k = 1 - Math.exp(-dt * 5.5);
        L.cam = { x: L.cam.x + (L.target.x - L.cam.x) * k, y: L.cam.y + (L.target.y - L.cam.y) * k, s: L.cam.s + (L.target.s - L.cam.s) * k };
        if (Math.abs(L.cam.s - L.target.s) < 0.002 && Math.hypot(L.cam.x - L.target.x, L.cam.y - L.target.y) < 0.5) {
          L.cam = { ...L.target };
          L.userCam = L.target.s > L.base.s * 1.02 ? L.cam : null;
          L.target = null;
        }
      } else if (!L.drag && (Math.abs(L.vel.x) > 0.01 || Math.abs(L.vel.y) > 0.01)) {
        // 指を離したあとの慣性
        L.cam = clampCam({ x: L.cam.x - L.vel.x * dt, y: L.cam.y - L.vel.y * dt, s: L.cam.s }, L.W, L.H, hiddenPx());
        const f = Math.exp(-dt * 4);
        L.vel.x *= f;
        L.vel.y *= f;
        L.userCam = L.cam;
      }
      // 何も触っていないときは、ゆっくり呼吸するように視点がゆれる（視差で奥行きが見える）
      const idle = !L.drag && !L.target && !L.userCam && frame !== 'lake';
      const cam = idle ? { ...L.cam, x: L.cam.x + Math.sin(t * 0.05) * 10, y: L.cam.y + Math.sin(t * 0.037) * 3 } : L.cam;
      ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
      scene.draw(ctx, L.W, L.H, L.base, cam, t, now);
    };

    let last = performance.now();
    const loop = (now: number) => {
      L.raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt, now);
      if (scene.isReady()) markReady();
      if (L.visible && !document.hidden && !isReduced() && !still) L.raf = requestAnimationFrame(loop);
    };
    function kick() {
      if (L.raf) return;
      if (isReduced() || still) {
        // 動きなし: 必要なときに 1 枚だけ描く
        L.raf = requestAnimationFrame((now) => {
          L.raf = 0;
          if (L.target) {
            L.cam = { ...L.target };
            L.target = null;
          }
          ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
          scene.draw(ctx, L.W, L.H, L.base, L.cam, 0, now + 10_000);
          if (scene.isReady()) markReady();
        });
        return;
      }
      last = performance.now();
      L.raf = requestAnimationFrame(loop);
    }
    scene.onReady = kick;

    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();
    const io = new IntersectionObserver((entries) => {
      L.visible = entries.some((e) => e.isIntersecting);
      if (L.visible) kick();
    });
    io.observe(box);
    const onVis = () => !document.hidden && kick();
    document.addEventListener('visibilitychange', onVis);
    const mo = new MutationObserver(kick);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced'] });
    (box as unknown as { __kick?: () => void }).__kick = kick;
    return () => {
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (L.raf) cancelAnimationFrame(L.raf);
      L.raf = 0;
      scene.onReady = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, frameKey, visible, still]);

  // 選んだ拠点へ近づく／元に戻る
  useEffect(() => {
    const L = live.current;
    if (focus) {
      const pos = scene.positionOf(focus);
      if (pos) {
        const s = L.base.s * 2;
        // 下に情報のシートが出るので、拠点は画面の上のほうに置く
        L.target = clampCam({ x: pos[0], y: pos[1] - 30 + (L.H * 0.18) / s, s }, L.W, L.H, hiddenPx());
        setZoomed(true);
      }
    } else if (L.userCam || L.cam.s !== L.base.s) {
      L.target = { ...L.base };
      L.userCam = null;
      setZoomed(false);
    }
    (boxRef.current as unknown as { __kick?: () => void })?.__kick?.();
  }, [focus, scene]);

  // 指での操作（横にずらす・タップで拠点を選ぶ・ダブルタップで近づく）
  const interactive = !!onSelect && !still;
  const lastTap = useRef(0);
  const handlers = interactive
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          const L = live.current;
          L.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() };
          L.vel = { x: 0, y: 0 };
          L.target = null;
        },
        onPointerMove: (e: React.PointerEvent) => {
          const L = live.current;
          const d = L.drag;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
            d.moved = true;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }
          if (!d.moved) return;
          const zoomedIn = L.cam.s > L.base.s * 1.02;
          const now = performance.now();
          const dtm = Math.max(1, now - d.t) / 1000;
          L.cam = clampCam({ x: L.cam.x - dx / L.cam.s, y: zoomedIn ? L.cam.y - dy / L.cam.s : L.cam.y, s: L.cam.s }, L.W, L.H, hiddenPx());
          L.vel = { x: dx / L.cam.s / dtm, y: zoomedIn ? dy / L.cam.s / dtm : 0 };
          L.userCam = L.cam;
          d.x = e.clientX;
          d.y = e.clientY;
          d.t = now;
        },
        onPointerUp: (e: React.PointerEvent) => {
          const L = live.current;
          const d = L.drag;
          L.drag = null;
          if (!d || d.moved) return;
          const rect = boxRef.current!.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          const hit = scene.hitTest(px, py, L.W, L.H, L.cam);
          if (hit) {
            onSelectRef.current?.(hit);
            return;
          }
          const now = performance.now();
          if (now - lastTap.current < 320) {
            // ダブルタップ: その場所へ近づく／戻る
            if (L.cam.s > L.base.s * 1.05) {
              L.target = { ...L.base };
              L.userCam = null;
              setZoomed(false);
            } else {
              const wx = L.cam.x + (px - L.W / 2) / L.cam.s;
              const wy = L.cam.y + (py - L.H / 2) / L.cam.s;
              L.target = clampCam({ x: wx, y: wy, s: L.base.s * 2 }, L.W, L.H, hiddenPx());
              setZoomed(true);
            }
            lastTap.current = 0;
          } else lastTap.current = now;
        },
        onPointerCancel: () => {
          live.current.drag = null;
        },
      }
    : {};

  const label = `${ERA_LABELS[state.era].name}の世界。森の木 ${state.nature.trees}本、道 第${state.paths.level}段階、記念碑 ${state.monuments.length}基、今日の灯り ${state.lanterns}つ。`;
  return (
    <div
      ref={boxRef}
      className={`world-scene living-world${className ? ` ${className}` : ''}${zoomed ? ' is-zoomed' : ''}`}
      role="img"
      aria-label={label}
      data-ready={ready ? 'true' : 'false'}
      data-motion={still ? 'still' : 'live'}
      {...handlers}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="lw-vignette" aria-hidden="true" />
    </div>
  );
}
