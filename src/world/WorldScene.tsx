import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { WorldState, WorldStructure } from '../engine/world';
import { ERA_LABELS } from '../engine/world';
import { Flag, Lantern, Monument, PALETTES, Structure, Tree, ArtDefs, seeded, phaseOf, type Phase } from './art';

/** 拠点を置く場所（領域ごとに決まった位置。独自の領域は空いている場所に順に置く） */
const SLOTS: Record<string, [number, number]> = {
  'd-health': [86, 300],
  'd-living': [165, 394],
  'd-hobby': [118, 348],
  'd-relations': [200, 302],
  'd-work': [270, 334],
  'd-learning': [318, 262],
  'd-money': [340, 374],
};
const EXTRA_SLOTS: [number, number][] = [
  [372, 304],
  [40, 350],
  [298, 414],
  [112, 424],
  [366, 420],
];

export function slotOf(structures: WorldStructure[], domainId: string): [number, number] {
  if (SLOTS[domainId]) return SLOTS[domainId];
  const custom = structures.filter((s) => !SLOTS[s.domainId]);
  const i = custom.findIndex((s) => s.domainId === domainId);
  return EXTRA_SLOTS[Math.max(0, i) % EXTRA_SLOTS.length];
}

const FLAG_SPOTS: [number, number][] = [
  [110, 119],
  [230, 97],
  [310, 123],
  [141, 151],
  [240, 159],
  [331, 161],
];
const MONUMENT_SPOTS: [number, number][] = [
  [176, 308],
  [224, 308],
  [166, 316],
  [234, 316],
  [184, 320],
  [216, 320],
  [156, 302],
  [244, 302],
];
const LANTERN_SPOTS: [number, number][] = [
  [192, 424],
  [178, 374],
  [146, 360],
  [184, 322],
  [226, 326],
];

/** 川の中心線（決まった形） */
const RIVER: [number, number][] = [
  [204, 236],
  [192, 262],
  [180, 290],
  [198, 318],
  [238, 344],
  [234, 378],
  [214, 410],
  [210, 444],
];

function catmull(points: [number, number][], steps = 10): [number, number][] {
  const out: [number, number][] = [];
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
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const RIVER_LINE = catmull(RIVER);

function riverShape(): string {
  const n = RIVER_LINE.length;
  const left: string[] = [];
  const right: string[] = [];
  RIVER_LINE.forEach(([x, y], i) => {
    const [nx, ny] = RIVER_LINE[Math.min(n - 1, i + 1)];
    const [px, py] = RIVER_LINE[Math.max(0, i - 1)];
    const dx = nx - px;
    const dy = ny - py;
    const len = Math.hypot(dx, dy) || 1;
    const w = 1.5 + (i / n) * 12;
    left.push(`${(x - (dy / len) * w).toFixed(1)},${(y + (dx / len) * w).toFixed(1)}`);
    right.push(`${(x + (dy / len) * w).toFixed(1)},${(y - (dx / len) * w).toFixed(1)}`);
  });
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}
const RIVER_PATH = riverShape();
const RIVER_CENTER = `M${RIVER_LINE.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}`;
const BRIDGE_AT = [0.42, 0.58, 0.74, 0.88].map((t) => RIVER_LINE[Math.round(t * (RIVER_LINE.length - 1))]);

/** 道（段階が上がるごとに1本ずつ現れる。まだの道は薄い点線で「これから歩ける道」として描く） */
const PATH_SEGMENTS = [
  'M200,444 C196,428 182,412 168,398',
  'M166,394 C150,382 132,366 122,352',
  'M168,396 C200,388 224,372 238,360 C250,350 262,342 270,336',
  'M122,350 C140,330 170,312 198,304',
  'M202,302 C240,296 290,286 316,266',
  'M272,338 C298,352 322,364 338,374',
];

function trees(count: number) {
  const r = seeded(11);
  const all = Array.from({ length: 40 }, (_, i) => {
    const right = i % 3 === 2;
    const x = right ? 268 + r() * 128 : 6 + r() * 168;
    const y = right ? 228 + r() * 30 : 222 + r() * 44;
    return { x, y, kind: (r() > 0.55 ? 1 : 0) as 0 | 1, i };
  });
  return all.slice(0, count).sort((a, b) => a.y - b.y);
}

function flowers(count: number) {
  const r = seeded(21);
  return Array.from({ length: count }, () => ({ x: 22 + r() * 110, y: 380 + r() * 40, c: r() }));
}

function stars() {
  const r = seeded(5);
  return Array.from({ length: 46 }, () => ({ x: r() * 400, y: r() * 150, s: 0.4 + r() * 0.9 }));
}

export interface WorldSceneProps {
  state: WorldState;
  /** 光の時間帯（指定しなければ端末の時刻） */
  phase?: Phase;
  onSelect?: (s: WorldStructure) => void;
  className?: string;
  /** 静寂の地など、建物を描かない静かな風景 */
  quiet?: boolean;
}

/**
 * 世界の風景。WorldState だけを見て描く（描画側では世界のルールを持たない）。
 */
export function WorldScene({ state, phase: phaseProp, onSelect, className, quiet }: WorldSceneProps) {
  const id = useId().replace(/:/g, '');
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const t = window.setInterval(() => setHour(new Date().getHours()), 5 * 60_000);
    return () => window.clearInterval(t);
  }, []);
  const phase = phaseProp ?? phaseOf(hour);
  const p = PALETTES[phase];
  const night = phase === 'night';
  const dusk = phase === 'dusk';

  // 記録を保存して灯りが増えたときだけ、新しい灯りをふわっとともす
  const prevLit = useRef(state.lanterns);
  const [freshFrom, setFreshFrom] = useState<number | null>(null);
  useEffect(() => {
    if (state.lanterns > prevLit.current) setFreshFrom(prevLit.current);
    prevLit.current = state.lanterns;
  }, [state.lanterns]);

  const treeList = useMemo(() => trees(state.nature.trees), [state.nature.trees]);
  const flowerList = useMemo(() => flowers(state.nature.flowers), [state.nature.flowers]);
  const starList = useMemo(() => stars(), []);
  const mistOpacity = 0.12 + state.mist * 0.55;
  const lit = Math.min(LANTERN_SPOTS.length, state.lanterns);
  const label = `${ERA_LABELS[state.era].name}の世界。森の木 ${state.nature.trees}本、道 第${state.paths.level}段階、記念碑 ${state.monuments.length}基、今日の灯り ${state.lanterns}つ。`;

  return (
    <svg className={`world-scene${className ? ` ${className}` : ''}`} viewBox="0 0 400 440" preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
      <ArtDefs id={id} />
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="0.45" stopColor={p.sky[1]} />
          <stop offset="0.6" stopColor={p.sky[2]} />
        </linearGradient>
        <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.mist} stopOpacity="0" />
          <stop offset="0.5" stopColor={p.mist} stopOpacity="1" />
          <stop offset="1" stopColor={p.mist} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-meadow`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.meadow[0]} />
          <stop offset="1" stopColor={p.meadow[1]} />
        </linearGradient>
        <radialGradient id={`${id}-vignette`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={night ? 0.45 : 0.16} />
        </radialGradient>
      </defs>

      {/* 空 */}
      <rect width="400" height="440" fill={`url(#${id}-sky)`} />
      {night ? (
        <g>
          {starList.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#efe6cf" opacity={0.75} className={i % 7 === 0 ? 'w-twinkle' : undefined} />
          ))}
          <circle cx={318} cy={66} r={13} fill="#efe6cf" opacity={0.9} />
          <circle cx={324} cy={62} r={12} fill={p.sky[0]} />
        </g>
      ) : (
        <g>
          <circle cx={318} cy={phase === 'day' ? 70 : 118} r={34} fill={p.glow} opacity={0.18} filter={`url(#${id}-soft)`} />
          <circle cx={318} cy={phase === 'day' ? 70 : 118} r={16} fill={dusk ? '#f3c98a' : '#f6efd9'} opacity={0.85} />
        </g>
      )}

      {/* 原生域: 遠くの山々と霧 */}
      <g filter={`url(#${id}-rough)`}>
        <path d="M0,176 L40,150 L70,160 L110,118 L150,150 L190,130 L230,96 L270,140 L310,122 L350,150 L400,128 L400,240 L0,240Z" fill={p.far[0]} />
        <path d="M0,196 L50,168 L95,186 L141,151 L185,181 L240,159 L290,183 L331,161 L370,177 L400,166 L400,250 L0,250Z" fill={p.far[1]} />
        <path d="M0,214 L60,194 L120,206 L180,190 L250,204 L320,188 L400,200 L400,260 L0,260Z" fill={p.far[2]} opacity={0.9} />
      </g>
      {!quiet && state.flags.slice(0, FLAG_SPOTS.length).map((f, i) => <Flag key={f.goalId} x={FLAG_SPOTS[i][0]} y={FLAG_SPOTS[i][1]} p={p} />)}
      <g className="w-mist" opacity={mistOpacity}>
        <rect x={-40} y={150} width={480} height={50} fill={`url(#${id}-mist)`} />
        <rect x={-60} y={186} width={520} height={44} fill={`url(#${id}-mist)`} opacity={0.8} />
      </g>

      {/* 自然域: 丘と森 */}
      <g filter={`url(#${id}-rough)`}>
        <path d="M0,232 C40,206 90,200 140,222 C170,234 192,240 214,248 L214,330 L0,330Z" fill={p.hill[0]} />
        <path d="M140,300 C176,262 240,226 300,216 C340,210 372,214 400,220 L400,330 L140,330Z" fill={p.hill[1]} />
        {/* 森の奥の木々（最初から豊かな緑がある） */}
        <path d="M0,236 C12,226 20,230 28,222 C36,228 44,220 52,224 C60,214 70,222 78,216 C88,222 96,212 106,218 C114,214 124,220 132,222 L140,232 C100,226 60,228 0,246Z" fill={p.tree[1]} opacity={0.85} />
        <path d="M262,228 C270,218 280,224 288,216 C296,222 306,212 314,218 C324,210 334,218 342,212 C352,218 362,210 372,216 C382,212 392,218 400,214 L400,232 C360,226 300,228 262,236Z" fill={p.tree[1]} opacity={0.85} />
      </g>
      {treeList.map((t, i) => (
        <Tree key={t.i} x={t.x} y={t.y} s={0.55 + ((t.y - 215) / 60) * 0.45} kind={t.kind} p={p} sway={i % 4 === 0} delay={(t.i % 5) * 0.7} />
      ))}

      {/* 草原 */}
      <path d="M0,300 C80,288 150,296 200,300 C260,305 330,292 400,298 L400,440 L0,440Z" fill={`url(#${id}-meadow)`} filter={`url(#${id}-rough)`} />

      {/* 川と水辺 */}
      <path d={RIVER_PATH} fill={p.water} />
      <path d={RIVER_CENTER} className="w-river" stroke={p.waterLight} strokeWidth={1.1} fill="none" strokeDasharray="6 14" strokeLinecap="round" opacity={0.7} />
      <ellipse cx={66} cy={398} rx={40} ry={11} fill={p.water} />
      <ellipse cx={58} cy={396} rx={20} ry={2} fill={p.waterLight} opacity={0.5} className="w-water" />
      {flowerList.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.y} r={1.3} fill={f.c < 0.33 ? '#e8e1cf' : f.c < 0.66 ? p.glow : '#c98c8c'} />
      ))}
      {Array.from({ length: state.nature.fireflies }, (_, i) => (
        <circle key={i} cx={36 + ((i * 37) % 70)} cy={378 + ((i * 13) % 16)} r={1.2} fill={p.glow} className="w-firefly" style={{ animationDelay: `${(i % 6) * 0.6}s` }} />
      ))}

      {!quiet && (
        <>
          {/* 道と集落 */}
          {PATH_SEGMENTS.map((d, i) =>
            i < state.paths.level + (state.paths.level >= 5 ? 1 : 0) ? (
              <path key={i} d={d} stroke={p.path} strokeWidth={3.6} fill="none" strokeLinecap="round" opacity={0.95} />
            ) : (
              <path key={i} d={d} stroke={p.path} strokeWidth={1.4} fill="none" strokeDasharray="1.5 5" strokeLinecap="round" opacity={0.45} />
            ),
          )}
          {BRIDGE_AT.slice(0, state.paths.bridges).map(([x, y], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <path d="M-12,2 Q0,-7 12,2" stroke={p.stoneShade} strokeWidth={3} fill="none" />
              <path d="M-12,1 Q0,-8 12,1" stroke={p.stone} strokeWidth={1.4} fill="none" />
            </g>
          ))}

          {/* 拠点（奥から手前の順に描く） */}
          {[...state.structures]
            .map((s) => ({ s, pos: slotOf(state.structures, s.domainId) }))
            .sort((a, b) => a.pos[1] - b.pos[1])
            .map(({ s, pos }) => (
              <g key={s.domainId} className={onSelect ? 'w-tap' : undefined} onClick={onSelect ? () => onSelect(s) : undefined}>
                <circle cx={pos[0]} cy={pos[1] - 8} r={18} fill="transparent" />
                <Structure kind={s.kind} level={s.level} x={pos[0]} y={pos[1]} p={p} planned={s.planned} lit={night || dusk} label={`${s.name} 第${s.level}段階`} />
              </g>
            ))}

          {/* 文明域: 記念碑 */}
          {state.monuments.slice(-MONUMENT_SPOTS.length).map((m, i) => (
            <Monument key={m.id} x={MONUMENT_SPOTS[i][0]} y={MONUMENT_SPOTS[i][1]} p={p} h={9 + (i % 3) * 2} />
          ))}

          {/* 今日の灯り */}
          {state.paths.level >= 1 &&
            LANTERN_SPOTS.map(([x, y], i) => <Lantern key={i} x={x} y={y} p={p} lit={i < lit} fresh={freshFrom !== null && i >= freshFrom && i < lit} />)}
        </>
      )}

      {/* 紙の質感と周辺の陰り */}
      <rect width="400" height="440" filter={`url(#${id}-paper)`} opacity={0.9} pointerEvents="none" />
      <rect width="400" height="440" fill={`url(#${id}-vignette)`} pointerEvents="none" />
    </svg>
  );
}
