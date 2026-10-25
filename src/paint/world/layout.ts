/**
 * 世界の絵の配置（1000 × 1400 の画面上の座標）。配置は決まっていて、世界の状態によって「何を描くか」だけが変わる。
 */
import type { WorldStructure } from '../../engine/world';
import { rng } from '../core';

export const WORLD_W = 1000;
export const WORLD_H = 1400;

/** 奥行き（0 = 遠く、1 = 手前）。視差（パララックス）とかすみに使う */
export function depthAt(y: number): number {
  return Math.max(0, Math.min(1, (y - 560) / 820));
}

export const SLOTS: Record<string, [number, number]> = {
  'd-learning': [792, 748],
  'd-work': [706, 990],
  'd-relations': [498, 902],
  'd-health': [212, 902],
  'd-living': [400, 1162],
  'd-hobby': [262, 1040],
  'd-money': [852, 1124],
};
const EXTRA: [number, number][] = [
  [930, 880],
  [92, 1064],
  [716, 1262],
  [236, 1290],
  [928, 1296],
];

export function structurePos(structures: WorldStructure[], domainId: string): [number, number] {
  if (SLOTS[domainId]) return SLOTS[domainId];
  const custom = structures.filter((s) => !SLOTS[s.domainId]);
  return EXTRA[Math.max(0, custom.findIndex((s) => s.domainId === domainId)) % EXTRA.length];
}

/** 遠くの山の頂（原生域の旗を立てる場所） */
export const PEAKS: [number, number][] = [
  [262, 336],
  [575, 262],
  [790, 318],
  [118, 418],
  [415, 384],
  [920, 402],
];

/** 川の中心線 */
export const RIVER: { x: number; y: number }[] = [
  { x: 520, y: 612 },
  { x: 498, y: 680 },
  { x: 468, y: 752 },
  { x: 488, y: 826 },
  { x: 560, y: 886 },
  { x: 610, y: 960 },
  { x: 590, y: 1052 },
  { x: 540, y: 1150 },
  { x: 548, y: 1260 },
  { x: 590, y: 1400 },
];

/** 湖（静寂の地の水辺） */
export const LAKE = { x: 196, y: 1196, rx: 170, ry: 44 };

/** 道（段階ごとに 1 本ずつ現れる） */
export const PATHS: { x: number; y: number }[][] = [
  [
    { x: 470, y: 1400 },
    { x: 452, y: 1320 },
    { x: 418, y: 1236 },
    { x: 404, y: 1180 },
  ],
  [
    { x: 396, y: 1170 },
    { x: 340, y: 1120 },
    { x: 292, y: 1074 },
    { x: 268, y: 1050 },
  ],
  [
    { x: 410, y: 1166 },
    { x: 480, y: 1126 },
    { x: 560, y: 1084 },
    { x: 640, y: 1030 },
    { x: 700, y: 996 },
  ],
  [
    { x: 266, y: 1038 },
    { x: 330, y: 980 },
    { x: 420, y: 930 },
    { x: 494, y: 908 },
  ],
  [
    { x: 506, y: 900 },
    { x: 600, y: 866 },
    { x: 700, y: 820 },
    { x: 788, y: 760 },
  ],
  [
    { x: 712, y: 1000 },
    { x: 780, y: 1050 },
    { x: 846, y: 1120 },
  ],
];

/** 橋をかける場所（川と道が交わるあたり） */
export const BRIDGES: { x: number; y: number; w: number }[] = [
  { x: 598, y: 1044, w: 96 },
  { x: 556, y: 880, w: 86 },
  { x: 488, y: 790, w: 70 },
  { x: 545, y: 1210, w: 110 },
];

export const MONUMENTS: [number, number][] = [
  [444, 930],
  [556, 934],
  [420, 952],
  [578, 956],
  [462, 962],
  [536, 966],
  [398, 918],
  [598, 922],
];

export const LANTERNS: [number, number][] = [
  [478, 1336],
  [432, 1214],
  [352, 1112],
  [452, 922],
  [548, 922],
];

export interface TreeSpot {
  x: number;
  y: number;
  /** 0 = 広葉樹、1 = 針葉樹 */
  kind: 0 | 1;
  size: number;
  seed: number;
}

/** 森の木の位置（最大 40 本。数が増えると、この順に現れる） */
export const TREES: TreeSpot[] = (() => {
  const r = rng(77);
  const zones = [
    { x0: 30, x1: 400, y0: 700, y1: 840, w: 4 }, // 左の丘の森
    { x0: 640, x1: 990, y0: 664, y1: 760, w: 3 }, // 右の丘（図書館の後ろ）
    { x0: 600, x1: 980, y0: 820, y1: 930, w: 2 }, // 川の右岸
    { x0: 20, x1: 180, y0: 960, y1: 1140, w: 2 }, // 左手前
    { x0: 860, x1: 990, y0: 1150, y1: 1330, w: 1 }, // 右手前
  ];
  const total = zones.reduce((s, z) => s + z.w, 0);
  const out: TreeSpot[] = [];
  for (let i = 0; i < 40; i++) {
    let pick = r() * total;
    const z = zones.find((zz) => (pick -= zz.w) < 0) ?? zones[0];
    const x = z.x0 + r() * (z.x1 - z.x0);
    const y = z.y0 + r() * (z.y1 - z.y0);
    // 川と建物の近くは避ける
    const nearRiver = Math.abs(x - 530) < 70 && y > 600 && y < 1000;
    const nearSlot = Object.values(SLOTS).some(([sx, sy]) => Math.abs(x - sx) < 74 && y > sy - 60 && y < sy + 34);
    if (nearRiver || nearSlot) {
      i--;
      continue;
    }
    out.push({ x, y, kind: r() < 0.42 ? 1 : 0, size: 0.75 + r() * 0.5, seed: Math.floor(r() * 1e9) });
  }
  return out;
})();
