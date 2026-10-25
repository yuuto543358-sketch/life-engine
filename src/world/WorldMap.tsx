import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dependency, Goal } from '../data/types';
import type { WorldState } from '../engine/world';
import { makeCanvas } from '../paint/core';
import { loadImage, saveImage, type Img } from '../paint/cache';
import { FLORA, lightAt, seasonOf } from '../paint/light';
import { MAP_H, MAP_W, paintMap } from '../paint/map/mapPaint';
import { runJob, type PaintJob } from '../paint/scheduler';
import { paintStructure, type Sprite } from '../paint/world/sprites';
import { hashSeed } from '../paint/core';

/** 地図上の場所（領域ごとに決まった位置） */
const PLACES: Record<string, [number, number]> = {
  'd-learning': [300, 172],
  'd-work': [300, 268],
  'd-relations': [208, 236],
  'd-health': [94, 252],
  'd-living': [140, 336],
  'd-hobby': [62, 318],
  'd-money': [262, 344],
};
const EXTRA: [number, number][] = [
  [196, 150],
  [350, 330],
  [62, 160],
  [200, 384],
];

export function placeOf(domainIds: string[], id: string): [number, number] {
  if (PLACES[id]) return PLACES[id];
  const custom = domainIds.filter((d) => !PLACES[d]);
  return EXTRA[Math.max(0, custom.indexOf(id)) % EXTRA.length];
}

/** 地図の上の建物の印の大きさ（建物の絵に対する倍率） */
const ICON = 0.36;

const icons = new Map<string, Sprite>();

/**
 * 世界地図（上から見た水彩の古地図）。領域は場所として描き、記録も計画もない場所は霧に包まれる。
 * つながり（連結の法則）は、関係する領域どうしを結ぶ金色の道として描く。
 * 絵はキャンバスに、名前や押せる場所は文字が読みやすいよう上に重ねた SVG に描く。
 */
export function WorldMap({ state, goals, dependencies, domainNames, onSelect, selected }: { state: WorldState; goals: Goal[]; dependencies: Dependency[]; domainNames: Record<string, string>; onSelect: (domainId: string) => void; selected?: string | null }) {
  const ids = state.structures.map((s) => s.domainId);
  const goalDomain = useMemo(() => new Map(goals.map((g) => [g.id, g.domainId])), [goals]);
  const roads = useMemo(() => {
    const domainOf = (r: { kind: 'goal' | 'domain'; id: string }) => (r.kind === 'domain' ? r.id : goalDomain.get(r.id) ?? null);
    const seen = new Set<string>();
    const out: [string, string][] = [];
    for (const d of dependencies) {
      const a = domainOf(d.from);
      const b = domainOf(d.to);
      if (!a || !b || a === b) continue;
      const k = [a, b].sort().join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([a, b]);
    }
    return out;
  }, [dependencies, goalDomain]);
  const unexplored = new Set(state.unexploredDomains);
  const center = PLACES['d-relations'];

  return (
    <div className="world-map">
      <MapCanvas state={state} />
      <svg className="world-map-overlay" viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={`世界地図。場所 ${ids.length}か所、まだ霧の中の場所 ${unexplored.size}か所、つながりの道 ${roads.length}本。`}>
        <defs>
          <radialGradient id="map-mist">
            <stop offset="0" stopColor="#f6f1e4" stopOpacity="0.95" />
            <stop offset="0.6" stopColor="#f6f1e4" stopOpacity="0.6" />
            <stop offset="1" stopColor="#f6f1e4" stopOpacity="0" />
          </radialGradient>
          <filter id="map-ink" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="1.4" />
          </filter>
        </defs>
        {/* 原生域の霧（まだ知らない領域が多いほど濃い） */}
        <g className="map-mist-band" opacity={0.25 + state.mist * 0.6}>
          <ellipse cx={150} cy={104} rx={110} ry={22} fill="url(#map-mist)" />
          <ellipse cx={280} cy={98} rx={120} ry={20} fill="url(#map-mist)" />
        </g>
        <text x={200} y={70} textAnchor="middle" className="map-region-label">原 生 域</text>
        <text x={58} y={176} className="map-region-label">自 然 域</text>
        <text x={258} y={214} className="map-region-label">道と集落</text>

        {/* 歩いたことのある場所への小道（中心の広場から） */}
        {state.structures
          .filter((s) => s.domainId !== 'd-relations' && !unexplored.has(s.domainId))
          .map((s) => {
            const [x, y] = placeOf(ids, s.domainId);
            return <path key={s.domainId} d={`M${center[0]},${center[1]} Q${(center[0] + x) / 2 + 12},${(center[1] + y) / 2 - 10} ${x},${y}`} className="map-trail" />;
          })}
        {/* 連結の法則: 登録したつながりの道（描かれていくように現れる） */}
        {roads.map(([a, b], i) => {
          const [x1, y1] = placeOf(ids, a);
          const [x2, y2] = placeOf(ids, b);
          const d = `M${x1},${y1} Q${(x1 + x2) / 2},${(y1 + y2) / 2 + 18} ${x2},${y2}`;
          return (
            <g key={`${a}-${b}`} filter="url(#map-ink)">
              <path d={d} className="map-road-glow" />
              <path d={d} pathLength={1} className="map-road" style={{ animationDelay: `${0.25 + i * 0.18}s` }} />
            </g>
          );
        })}

        {/* 場所 */}
        {state.structures.map((s) => {
          const [x, y] = placeOf(ids, s.domainId);
          const misty = unexplored.has(s.domainId);
          const flags = goals.filter((g) => g.domainId === s.domainId && !g.completedAt).length;
          const name = domainNames[s.domainId] ?? s.domainName;
          const label = `${name}（${s.name}・第${s.level}段階${misty ? '・まだ霧の中' : ''}）`;
          return (
            <g
              key={s.domainId}
              className={`map-place${selected === s.domainId ? ' is-selected' : ''}`}
              onClick={() => onSelect(s.domainId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(s.domainId);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={label}
            >
              <circle cx={x} cy={y - 10} r={26} className="map-hit" />
              {selected === s.domainId && <circle cx={x} cy={y - 8} r={24} className="map-ring" />}
              {misty && (
                <g className="map-mist">
                  <ellipse cx={x} cy={y - 10} rx={34} ry={20} fill="url(#map-mist)" />
                </g>
              )}
              {flags > 0 && !misty && (
                <g transform={`translate(${x + 15},${y - 30})`} className="map-flag">
                  <path d="M0,0 L0,14" stroke="#4a3a2a" strokeWidth={0.9} />
                  <path d="M0,0 L9,2.5 L0,5Z" fill="#c9a24a" />
                </g>
              )}
              <text x={x} y={y + 13} textAnchor="middle" className="map-place-name">
                {name}
              </text>
              <text x={x} y={y + 23} textAnchor="middle" className="map-place-sub">
                {misty ? '未踏の地' : `${s.name}${flags ? `・旗${flags}` : ''}`}
              </text>
            </g>
          );
        })}
        {state.monuments.length > 0 && (
          <text x={center[0]} y={center[1] - 34} textAnchor="middle" className="map-place-sub">
            記念碑 {state.monuments.length}基
          </text>
        )}
        <text x={MAP_W - 52} y={30} textAnchor="middle" className="map-place-sub">北</text>
        <g className="map-cartouche" transform="translate(26,388)">
          <path d="M0,-12 L150,-12 L156,-4 L150,4 L0,4 L6,-4Z" />
          <text x={78} y={-0.5} textAnchor="middle">VERDANTH 世界地図</text>
        </g>
      </svg>
    </div>
  );
}

/** 地図の絵（下絵と建物の印）。描いた絵は端末に保存して使い回す */
function MapCanvas({ state }: { state: WorldState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const iconsKey = state.structures.map((s) => `${s.kind}:${s.level}:${s.planned ? 1 : 0}`).join(',');
  useEffect(() => {
    if (!width) return;
    const canvas = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = Math.round(((width / MAP_W) * dpr) * 4) / 4;
    canvas.width = Math.round(MAP_W * k);
    canvas.height = Math.round(MAP_H * k);
    const ctx = canvas.getContext('2d')!;
    const season = seasonOf(state.asOf);
    const F = FLORA[season];
    const trees = state.nature.trees;
    let cancelled = false;
    const baseKey = `map|${trees}|${season}|${k}`;
    const ids = state.structures.map((s) => s.domainId);
    const env = { L: lightAt(11), F, px: k * ICON * 1.3 };

    const drawIcons = () => {
      const sorted = [...state.structures].map((s) => ({ s, p: placeOf(ids, s.domainId) })).sort((a, b) => a.p[1] - b.p[1]);
      for (const { s, p } of sorted) {
        const sp = icons.get(`${s.kind}:${s.level}:${s.planned}:${env.px}`);
        if (!sp) continue;
        const sc = ICON * k;
        ctx.drawImage(sp.canvas as CanvasImageSource, (p[0] - sp.ax * ICON) * k, (p[1] - sp.ay * ICON) * k, sp.w * sc, sp.h * sc);
      }
    };

    (async () => {
      let base: Img | null = (await loadImage(baseKey))?.img ?? null;
      if (!base) {
        const { canvas: c, ctx: cx } = makeCanvas(MAP_W * k, MAP_H * k);
        cx.scale(k, k);
        await runJob(paintMap(cx, { trees, leaves: F.leaves }), true).done;
        base = c;
        saveImage(baseKey, c);
      }
      if (cancelled) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      canvas.dataset.ready = 'true';
      // 建物の印を、ひとつずつ描いて置く
      function* iconJob(): PaintJob {
        for (const s of state.structures) {
          const key = `${s.kind}:${s.level}:${s.planned}:${env.px}`;
          if (!icons.has(key)) {
            icons.set(key, paintStructure(s.kind, s.level, s.planned, env, hashSeed(s.kind)));
            yield;
          }
        }
      }
      drawIcons();
      await runJob(iconJob()).done;
      if (cancelled) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      drawIcons();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, iconsKey, state.nature.trees, state.asOf]);

  return <canvas ref={ref} className="world-map-canvas" aria-hidden="true" />;
}
