import { useId, useMemo } from 'react';
import type { Dependency, Goal } from '../data/types';
import type { WorldState } from '../engine/world';
import { ArtDefs, PALETTES, Structure, Tree, seeded } from './art';

/** 地図上の場所（領域ごとに決まった位置） */
const PLACES: Record<string, [number, number]> = {
  'd-learning': [300, 168],
  'd-work': [300, 268],
  'd-relations': [200, 236],
  'd-health': [92, 236],
  'd-living': [140, 316],
  'd-hobby': [74, 330],
  'd-money': [246, 334],
};
const EXTRA: [number, number][] = [
  [200, 140],
  [350, 340],
  [60, 160],
  [196, 372],
];

export function placeOf(domainIds: string[], id: string): [number, number] {
  if (PLACES[id]) return PLACES[id];
  const custom = domainIds.filter((d) => !PLACES[d]);
  return EXTRA[Math.max(0, custom.indexOf(id)) % EXTRA.length];
}

const ISLAND = 'M40,120 C70,80 140,70 200,78 C270,70 350,86 372,140 C392,190 378,250 384,300 C390,350 350,392 282,388 C220,392 170,396 120,384 C60,376 22,340 26,280 C30,230 14,170 40,120Z';

/**
 * 世界地図（上から見た古地図の風）。領域は場所として描き、記録も計画もない場所は霧に包まれる。
 * つながり（連結の法則）は、関係する領域どうしを結ぶ道として描く。
 */
export function WorldMap({ state, goals, dependencies, domainNames, onSelect, selected }: { state: WorldState; goals: Goal[]; dependencies: Dependency[]; domainNames: Record<string, string>; onSelect: (domainId: string) => void; selected?: string | null }) {
  const id = useId().replace(/:/g, '');
  const p = PALETTES.day;
  const ids = state.structures.map((s) => s.domainId);
  const goalDomain = useMemo(() => new Map(goals.map((g) => [g.id, g.domainId])), [goals]);
  const domainOf = (r: { kind: 'goal' | 'domain'; id: string }) => (r.kind === 'domain' ? r.id : goalDomain.get(r.id) ?? null);
  const roads = useMemo(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencies, goalDomain]);
  const forest = useMemo(() => {
    const r = seeded(31);
    return Array.from({ length: 34 }, () => ({ x: 40 + r() * 120, y: 170 + r() * 60, k: (r() > 0.5 ? 1 : 0) as 0 | 1 })).sort((a, b) => a.y - b.y);
  }, []);
  const unexplored = new Set(state.unexploredDomains);
  const center = PLACES['d-relations'];

  return (
    <svg className="world-map" viewBox="0 0 400 420" role="img" aria-label={`世界地図。場所 ${ids.length}か所、まだ霧の中の場所 ${unexplored.size}か所、つながりの道 ${roads.length}本。`}>
      <ArtDefs id={id} />
      <rect width="400" height="420" fill="#efe6d2" />
      <rect width="400" height="420" filter={`url(#${id}-paper)`} />
      {/* 海と島 */}
      <path d={ISLAND} fill="#a7bdb3" opacity={0.35} transform="translate(0,6) scale(1.02)" />
      <path d={ISLAND} fill="#cfd3b5" stroke="#8a7f66" strokeWidth={1.2} filter={`url(#${id}-rough)`} />
      {/* 原生域の山脈 */}
      <g filter={`url(#${id}-rough)`}>
        {[90, 130, 170, 215, 255, 295, 330].map((x, i) => (
          <path key={x} d={`M${x - 22},${118 + (i % 2) * 8} L${x},${92 + (i % 3) * 6} L${x + 22},${118 + (i % 2) * 8}Z`} fill="#b8b7a0" stroke="#8a7f66" strokeWidth={0.8} />
        ))}
      </g>
      <rect x={40} y={80} width={330} height={52} fill="#f3eee2" opacity={0.25 + state.mist * 0.45} className="w-mist" />
      <text x={200} y={74} textAnchor="middle" className="map-region-label">原生域</text>
      {/* 川 */}
      <path d="M210,96 C200,140 236,170 222,210 C210,250 170,270 180,320 C186,350 212,370 206,396" stroke="#8fb1ad" strokeWidth={5} fill="none" strokeLinecap="round" />
      {/* 自然域の森 */}
      {forest.slice(0, Math.min(forest.length, 10 + Math.floor(state.nature.trees * 0.66))).map((t, i) => (
        <Tree key={i} x={t.x} y={t.y} s={0.5} kind={t.k} p={p} />
      ))}
      <text x={60} y={160} className="map-region-label">自然域</text>
      {/* 道（中心の広場から、歩いたことのある場所へ） */}
      {state.structures
        .filter((s) => s.domainId !== 'd-relations' && !unexplored.has(s.domainId))
        .map((s) => {
          const [x, y] = placeOf(ids, s.domainId);
          return <path key={s.domainId} d={`M${center[0]},${center[1]} Q${(center[0] + x) / 2 + 12},${(center[1] + y) / 2 - 10} ${x},${y}`} stroke="#9a8a66" strokeWidth={1.4} fill="none" strokeDasharray="3 3" opacity={0.7} />;
        })}
      {/* 連結の法則: 登録したつながりの道 */}
      {roads.map(([a, b]) => {
        const [x1, y1] = placeOf(ids, a);
        const [x2, y2] = placeOf(ids, b);
        return <path key={`${a}-${b}`} d={`M${x1},${y1} Q${(x1 + x2) / 2},${(y1 + y2) / 2 + 18} ${x2},${y2}`} stroke="#b08a3e" strokeWidth={2.4} fill="none" strokeLinecap="round" />;
      })}
      {/* 場所 */}
      {state.structures.map((s) => {
        const [x, y] = placeOf(ids, s.domainId);
        const misty = unexplored.has(s.domainId);
        const flags = goals.filter((g) => g.domainId === s.domainId && !g.completedAt).length;
        return (
          <g key={s.domainId} className="w-tap map-place" onClick={() => onSelect(s.domainId)} role="button" aria-label={`${domainNames[s.domainId] ?? s.domainName}（${s.name}・第${s.level}段階${misty ? '・まだ霧の中' : ''}）`}>
            <circle cx={x} cy={y - 8} r={24} fill="transparent" />
            {selected === s.domainId && <circle cx={x} cy={y - 6} r={22} fill="none" stroke="#b08a3e" strokeWidth={1.5} strokeDasharray="2 3" />}
            <Structure kind={s.kind} level={s.level} x={x} y={y} p={p} planned={s.planned} />
            {misty && <ellipse cx={x} cy={y - 8} rx={26} ry={16} fill="#f3eee2" opacity={0.75} className="w-mist" />}
            <text x={x} y={y + 13} textAnchor="middle" className="map-place-name">
              {domainNames[s.domainId] ?? s.domainName}
            </text>
            <text x={x} y={y + 23} textAnchor="middle" className="map-place-sub">
              {misty ? '未踏の地' : `${s.name}${flags ? `・旗${flags}` : ''}`}
            </text>
          </g>
        );
      })}
      {/* 記念碑の数 */}
      {state.monuments.length > 0 && (
        <text x={center[0]} y={center[1] - 30} textAnchor="middle" className="map-place-sub">
          記念碑 {state.monuments.length}基
        </text>
      )}
      {/* 方位と題字 */}
      <g transform="translate(352,62)" opacity={0.75}>
        <circle r={14} fill="none" stroke="#8a7f66" strokeWidth={0.8} />
        <path d="M0,-16 L3,0 L0,16 L-3,0Z" fill="#8a7f66" />
        <text y={-19} textAnchor="middle" className="map-place-sub">北</text>
      </g>
      <text x={24} y={404} className="map-title">VERDANTH 世界地図</text>
    </svg>
  );
}
