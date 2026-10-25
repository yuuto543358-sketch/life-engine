/**
 * VERDANTH の絵の部品（手描き風の 2D）。画像ファイルを使わず SVG で描くため、通信がなくても表示できる。
 * ここでは「どう描くか」だけを扱い、「何を描くか」は世界のエンジン（engine/world.ts）が決める。
 */
import type { ReactNode } from 'react';
import type { StructureKind } from '../engine/world';

/** 決まった種から同じ並びの数を作る（毎回同じ配置にするため。演出のための乱数ではない） */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Phase = 'dawn' | 'day' | 'dusk' | 'night';

/** 時刻から光の様子を決める（表示のためだけに使い、世界の状態には影響しない） */
export function phaseOf(hour: number): Phase {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 16) return 'day';
  if (hour >= 16 && hour < 19) return 'dusk';
  return 'night';
}

export interface Palette {
  sky: [string, string, string];
  far: [string, string, string];
  hill: [string, string];
  meadow: [string, string];
  water: string;
  waterLight: string;
  mist: string;
  tree: [string, string, string];
  stone: string;
  stoneShade: string;
  roof: string;
  roof2: string;
  wood: string;
  window: string;
  path: string;
  glow: string;
  ink: string;
}

export const PALETTES: Record<Phase, Palette> = {
  dawn: {
    sky: ['#c9d3cf', '#e9dcc3', '#f3e6cd'],
    far: ['#b9c7c2', '#a7bdb3', '#93aaa1'],
    hill: ['#6f8a76', '#4e6a5b'],
    meadow: ['#a9b58f', '#8fa07a'],
    water: '#9fb8b3',
    waterLight: '#f3e6cd',
    mist: '#f1ece0',
    tree: ['#3f5f4c', '#2f4c3d', '#5f7d5f'],
    stone: '#d8cbb0',
    stoneShade: '#b6a684',
    roof: '#2f4a40',
    roof2: '#3c4a66',
    wood: '#8a6a48',
    window: '#d6b878',
    path: '#d8cbb0',
    glow: '#f2d48f',
    ink: '#243d35',
  },
  day: {
    sky: ['#b7cdc8', '#d9e3dc', '#efeadd'],
    far: ['#b4c6c0', '#a7bdb3', '#8ea79d'],
    hill: ['#6a8a70', '#4a6956'],
    meadow: ['#a4b486', '#8ea072'],
    water: '#8fb1ad',
    waterLight: '#eef2ea',
    mist: '#f3f1ea',
    tree: ['#3a5c46', '#2a4737', '#5b7d58'],
    stone: '#d8cbb0',
    stoneShade: '#b4a482',
    roof: '#243d35',
    roof2: '#2b3a55',
    wood: '#86664a',
    window: '#8a7a5a',
    path: '#ddd1b7',
    glow: '#f2d48f',
    ink: '#243d35',
  },
  dusk: {
    sky: ['#8e9cad', '#d6b49a', '#efcf9f'],
    far: ['#9aa5ad', '#8f9ca0', '#7c8b8b'],
    hill: ['#566d5f', '#3e5549'],
    meadow: ['#8f9673', '#77805f'],
    water: '#8b97a0',
    waterLight: '#f0c995',
    mist: '#eadcc8',
    tree: ['#334c3e', '#253a2f', '#4d6449'],
    stone: '#d3c1a1',
    stoneShade: '#ab9677',
    roof: '#243d35',
    roof2: '#2b3a55',
    wood: '#7b5c42',
    window: '#e7c27a',
    path: '#d3c1a1',
    glow: '#f5cf83',
    ink: '#243d35',
  },
  night: {
    sky: ['#0f1624', '#1b2638', '#2a3550'],
    far: ['#2a3650', '#25304a', '#1f2a40'],
    hill: ['#1f3330', '#172826'],
    meadow: ['#24372f', '#1d2e28'],
    water: '#2e4560',
    waterLight: '#d6b878',
    mist: '#3c4a66',
    tree: ['#17302a', '#112520', '#22403a'],
    stone: '#8e8a7c',
    stoneShade: '#6c6a60',
    roof: '#121d1f',
    roof2: '#1b2438',
    wood: '#4b3b2e',
    window: '#f2cf7f',
    path: '#6f6c60',
    glow: '#f2cf7f',
    ink: '#d8cbb0',
  },
};

/** 木（広葉樹・針葉樹）。sway は風で揺れる演出 */
export function Tree({ x, y, s, kind, p, sway, delay = 0 }: { x: number; y: number; s: number; kind: 0 | 1; p: Palette; sway?: boolean; delay?: number }) {
  const cls = sway ? 'w-sway' : undefined;
  if (kind === 1) {
    return (
      <g transform={`translate(${x},${y}) scale(${s})`}>
        <g className={cls} style={sway ? { animationDelay: `${delay}s` } : undefined}>
          <rect x={-0.8} y={-4} width={1.6} height={5} fill={p.wood} />
          <path d="M0,-26 C3,-18 7,-12 9,-5 C4,-4 -4,-4 -9,-5 C-7,-12 -3,-18 0,-26Z" fill={p.tree[1]} />
          <path d="M0,-26 C2,-19 5,-13 6,-8 C3,-9 1,-14 0,-26Z" fill={p.tree[2]} opacity={0.55} />
        </g>
      </g>
    );
  }
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <g className={cls} style={sway ? { animationDelay: `${delay}s` } : undefined}>
        <path d="M-0.9,0 L-0.6,-9 L0.6,-9 L0.9,0Z" fill={p.wood} />
        <ellipse cx={0} cy={-15} rx={9} ry={9.5} fill={p.tree[0]} />
        <ellipse cx={-4} cy={-12} rx={5.5} ry={5} fill={p.tree[1]} opacity={0.9} />
        <ellipse cx={3} cy={-18} rx={5} ry={4.5} fill={p.tree[2]} opacity={0.7} />
      </g>
    </g>
  );
}

/** 石の土台（まだ形になっていない可能性） */
function Foundation({ p }: { p: Palette }) {
  return (
    <g opacity={0.55}>
      <ellipse cx={0} cy={0} rx={13} ry={3.2} fill={p.stoneShade} opacity={0.35} />
      {[-9, -3, 3, 9].map((dx) => (
        <rect key={dx} x={dx - 2} y={-3} width={4} height={3} rx={1} fill={p.stone} />
      ))}
    </g>
  );
}

function Win({ x, y, w = 2.4, h = 3.2, p, lit }: { x: number; y: number; w?: number; h?: number; p: Palette; lit: boolean }) {
  return <rect x={x} y={y} width={w} height={h} rx={0.6} fill={lit ? p.glow : p.window} opacity={lit ? 1 : 0.75} className={lit ? 'w-window' : undefined} />;
}

/**
 * 拠点の建物。level 0 は土台だけ、1〜5 で大きく・細かくなる。
 * planned は開拓中の足場と小さな旗。lit は窓の灯り。
 */
export function Structure({ kind, level, x, y, p, planned, lit, label }: { kind: StructureKind; level: number; x: number; y: number; p: Palette; planned?: boolean; lit?: boolean; label?: string }) {
  const s = 0.95 + level * 0.12;
  let body: ReactNode = null;
  const L = level;
  const on = !!lit;
  switch (kind) {
    case 'library':
      body = (
        <g>
          <rect x={-14} y={-12} width={28} height={12} fill={p.stone} />
          <rect x={-15} y={-14} width={30} height={2.5} fill={p.stoneShade} />
          {[-10, -5, 0, 5, 10].map((cx) => (
            <rect key={cx} x={cx - 1} y={-12} width={2} height={12} fill={p.stoneShade} opacity={0.5} />
          ))}
          {L >= 3 ? <path d="M-9,-14 A9,9 0 0 1 9,-14Z" fill={p.roof2} /> : <path d="M-16,-14 L0,-22 L16,-14Z" fill={p.roof2} />}
          {L >= 4 && <rect x={-1} y={-26} width={2} height={5} fill={p.stoneShade} />}
          {L >= 4 && (
            <g>
              <rect x={15} y={-8} width={9} height={8} fill={p.stone} />
              <path d="M14,-8 L19.5,-12 L25,-8Z" fill={p.roof2} />
            </g>
          )}
          <Win x={-2} y={-8} w={4} h={8} p={p} lit={on} />
          {L >= 5 && <circle cx={0} cy={-29} r={1.6} fill={p.glow} />}
        </g>
      );
      break;
    case 'workshop':
      body = (
        <g>
          <rect x={-11} y={-11} width={22} height={11} fill={p.stone} />
          <rect x={-11} y={-11} width={22} height={11} fill={p.wood} opacity={0.25} />
          <path d="M-13,-11 L0,-20 L13,-11Z" fill={p.roof} />
          <rect x={6} y={-22} width={3} height={8} fill={p.stoneShade} />
          {L >= 3 && <path className="w-smoke" d="M7.5,-23 C6,-27 9,-29 7.5,-33 C6,-36 9,-38 8,-41" stroke={p.mist} strokeWidth={1.6} fill="none" opacity={0.6} strokeLinecap="round" />}
          <Win x={-7} y={-7} p={p} lit={on} />
          <Win x={3} y={-7} p={p} lit={on} />
          {L >= 4 && (
            <g>
              <rect x={-24} y={-7} width={12} height={7} fill={p.wood} />
              <path d="M-25,-7 L-18,-12 L-11,-7Z" fill={p.roof} />
            </g>
          )}
          {L >= 5 && <circle cx={-18} cy={-3} r={1.2} fill={p.glow} />}
        </g>
      );
      break;
    case 'atelier':
      body = (
        <g>
          <rect x={-9} y={-9} width={18} height={9} fill={p.stone} />
          <path d="M-11,-9 L0,-17 L11,-9Z" fill={p.roof2} />
          <Win x={-5} y={-6} p={p} lit={on} />
          <path d="M3,0 L3,-5 A2.5,2.5 0 0 1 8,-5 L8,0" fill={p.wood} />
          {Array.from({ length: Math.min(10, L * 2) }, (_, i) => (
            <circle key={i} cx={-16 + (i % 5) * 3 + (i > 4 ? 22 : 0)} cy={-1 - (i % 2)} r={1.1} fill={i % 3 === 0 ? p.glow : i % 3 === 1 ? '#c98c8c' : '#e8e1cf'} />
          ))}
          {L >= 4 && <path d="M-14,0 L-14,-8 A4,4 0 0 1 -6,-8 L-6,0" fill="none" stroke={p.tree[2]} strokeWidth={1.5} />}
        </g>
      );
      break;
    case 'plaza':
      body = (
        <g>
          <ellipse cx={0} cy={-1} rx={15 + L} ry={4 + L * 0.3} fill={p.stone} opacity={0.85} />
          <ellipse cx={0} cy={-1} rx={10 + L} ry={2.6} fill={p.stoneShade} opacity={0.35} />
          {L >= 2 && <Tree x={0} y={-1} s={0.6} kind={0} p={p} />}
          {L >= 3 && (
            <g>
              <rect x={-14} y={-3} width={5} height={1.5} fill={p.wood} />
              <rect x={9} y={-3} width={5} height={1.5} fill={p.wood} />
            </g>
          )}
          {L >= 4 && <circle cx={-8} cy={-6} r={1.2} fill={p.glow} />}
          {L >= 5 && <circle cx={8} cy={-6} r={1.2} fill={p.glow} />}
        </g>
      );
      break;
    case 'spring':
      body = (
        <g>
          <ellipse cx={0} cy={-1} rx={8 + L * 1.5} ry={3 + L * 0.4} fill={p.water} />
          <ellipse className="w-water" cx={-2} cy={-1.5} rx={4 + L} ry={0.8} fill={p.waterLight} opacity={0.6} />
          {[-1, 1].map((sgn) => (
            <ellipse key={sgn} cx={sgn * (9 + L * 1.5)} cy={-1} rx={2.5} ry={1.8} fill={p.stone} />
          ))}
          {L >= 4 && <path d="M-5,-3 L-5,-12 L5,-12 L5,-3 M-7,-12 L7,-12" stroke={p.stoneShade} strokeWidth={1.4} fill="none" />}
        </g>
      );
      break;
    case 'house':
      body = (
        <g>
          <rect x={-8} y={-8} width={16} height={8} fill={p.stone} />
          <path d="M-10,-8 L0,-15 L10,-8Z" fill={p.roof} />
          {L >= 3 && (
            <g>
              <rect x={-5} y={-14} width={10} height={4} fill={p.stone} />
              <path d="M-7,-14 L0,-19 L7,-14Z" fill={p.roof} />
            </g>
          )}
          <Win x={-5} y={-6} p={p} lit={on} />
          <Win x={2.5} y={-6} p={p} lit={on} />
          {L >= 2 && <path d="M-14,0 L-14,-3 M-11,0 L-11,-3 M11,0 L11,-3 M14,0 L14,-3 M-15,-2 L-9,-2 M9,-2 L15,-2" stroke={p.wood} strokeWidth={0.8} />}
        </g>
      );
      break;
    case 'storehouse':
      body = (
        <g>
          {Array.from({ length: L >= 4 ? 2 : 1 }, (_, i) => (
            <g key={i} transform={`translate(${i * 17},0)`}>
              <rect x={-7} y={-12} width={14} height={12} fill="#ece4d1" />
              <rect x={-7} y={-3} width={14} height={3} fill={p.ink} opacity={0.75} />
              <path d="M-9,-12 L0,-17 L9,-12Z" fill={p.roof} />
              <rect x={-2} y={-9} width={4} height={4} fill={p.wood} />
            </g>
          ))}
          {L >= 5 && <circle cx={0} cy={-19} r={1.3} fill={p.glow} />}
        </g>
      );
      break;
    default:
      body = (
        <g>
          <rect x={-4} y={-14 - L * 2} width={8} height={14 + L * 2} fill={p.stone} />
          <path d={`M-6,${-14 - L * 2} L0,${-20 - L * 2} L6,${-14 - L * 2}Z`} fill={p.roof2} />
          <Win x={-1.2} y={-9 - L} p={p} lit={on} />
        </g>
      );
  }
  return (
    <g transform={`translate(${x},${y})`} className="w-structure" aria-label={label}>
      <ellipse cx={0} cy={0.5} rx={16} ry={2.6} fill="#000" opacity={0.08} />
      {L === 0 ? <Foundation p={p} /> : <g transform={`scale(${s})`}>{body}</g>}
      {planned && (
        <g transform="translate(14,-2)">
          <path d="M0,0 L0,-14" stroke={p.wood} strokeWidth={0.9} />
          <path d="M0,-14 L7,-11.5 L0,-9Z" fill={p.window === '#8a7a5a' ? '#c9a55a' : p.glow} />
        </g>
      )}
    </g>
  );
}

/** 記念碑（節目の法則） */
export function Monument({ x, y, p, h = 12 }: { x: number; y: number; p: Palette; h?: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx={0} cy={0.4} rx={4} ry={1} fill="#000" opacity={0.1} />
      <path d={`M-2.4,0 L-1.6,${-h} L0,${-h - 2.5} L1.6,${-h} L2.4,0Z`} fill={p.stone} />
      <path d={`M0,${-h - 2.5} L1.6,${-h} L2.4,0 L0,0Z`} fill={p.stoneShade} opacity={0.6} />
      <circle cx={0} cy={-h - 3.4} r={0.9} fill={p.glow} />
    </g>
  );
}

/** 開拓計画の旗（原生域） */
export function Flag({ x, y, p }: { x: number; y: number; p: Palette }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <path d="M0,0 L0,-9" stroke={p.ink} strokeWidth={0.7} opacity={0.7} />
      <path className="w-flag" d="M0,-9 L5,-7.5 L0,-6Z" fill="#d6b878" />
    </g>
  );
}

/** 灯籠。lit で灯りがともる */
export function Lantern({ x, y, p, lit, fresh }: { x: number; y: number; p: Palette; lit: boolean; fresh?: boolean }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {lit && <circle cx={0} cy={-6} r={6} fill={p.glow} opacity={0.22} className={fresh ? 'w-lantern-new' : 'w-lantern'} />}
      <path d="M0,0 L0,-4" stroke={p.stoneShade} strokeWidth={0.9} />
      <rect x={-1.6} y={-7.4} width={3.2} height={3.4} rx={0.6} fill={lit ? p.glow : p.stoneShade} />
      <path d="M-2.4,-7.4 L0,-9 L2.4,-7.4Z" fill={p.roof} />
    </g>
  );
}

/** 手描き風のにじみ（線を少しだけ揺らす）と紙の質感のフィルター */
export function ArtDefs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`${id}-rough`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={3} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={2.6} />
      </filter>
      <filter id={`${id}-paper`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={8} result="g" />
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.22  0 0 0 0 0.18  0 0 0 0.06 0" />
      </filter>
      <filter id={`${id}-soft`}>
        <feGaussianBlur stdDeviation="3" />
      </filter>
    </defs>
  );
}
