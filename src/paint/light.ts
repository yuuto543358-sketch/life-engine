/**
 * 光と季節。時刻（端末の時計）と日付から、空・大気・光・影の色を連続的に決める。
 * これは見た目のためだけに使い、世界の状態（何があるか）には影響しない。
 */
import { hex, lerp, mix, type RGB } from './core';

export interface Light {
  /** 0〜24 の時刻 */
  hour: number;
  skyTop: RGB;
  skyMid: RGB;
  skyHorizon: RGB;
  /** 遠くのものにかかる大気の色（空気遠近） */
  haze: RGB;
  /** 日の当たる側に足す色 */
  sunlight: RGB;
  /** 影の色 */
  shadow: RGB;
  /** 全体にかける色（夜は深い藍） */
  ambient: RGB;
  ambientAmount: number;
  /** 太陽・月の位置（画面に対する割合）と色 */
  sunX: number;
  sunY: number;
  sunColor: RGB;
  sunVisible: number;
  moonVisible: number;
  stars: number;
  /** 光の筋（朝夕） */
  rays: number;
  /** 窓や灯籠の明かりの強さ */
  glow: number;
  water: RGB;
  waterLight: RGB;
  mist: RGB;
  cloudLight: RGB;
  cloudShade: RGB;
}

interface Key {
  h: number;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  haze: string;
  sunlight: string;
  shadow: string;
  ambient: string;
  ambientAmount: number;
  sunColor: string;
  rays: number;
  glow: number;
  stars: number;
  water: string;
  waterLight: string;
  mist: string;
  cloudLight: string;
  cloudShade: string;
}

const KEYS: Key[] = [
  { h: 0, skyTop: '#0b1220', skyMid: '#16223a', skyHorizon: '#26324c', haze: '#26324a', sunlight: '#6f7fa6', shadow: '#0c1220', ambient: '#203466', ambientAmount: 0.66, sunColor: '#e9e2cc', rays: 0, glow: 1, stars: 1, water: '#1d2c44', waterLight: '#d8c58f', mist: '#3a4762', cloudLight: '#3c4a66', cloudShade: '#1c2638' },
  { h: 4.8, skyTop: '#121a2e', skyMid: '#2a3352', skyHorizon: '#4c4f6a', haze: '#3f4762', sunlight: '#8a8fb0', shadow: '#151b2c', ambient: '#2c3a66', ambientAmount: 0.5, sunColor: '#efe0c8', rays: 0, glow: 0.85, stars: 0.6, water: '#2a3a55', waterLight: '#d8c59a', mist: '#5a6380', cloudLight: '#59607c', cloudShade: '#2a3049' },
  { h: 6.2, skyTop: '#5f7192', skyMid: '#c9a9a2', skyHorizon: '#f2c99a', haze: '#c8b3ad', sunlight: '#ffd7a0', shadow: '#4b4a63', ambient: '#a07a86', ambientAmount: 0.12, sunColor: '#ffd9a0', rays: 0.75, glow: 0.35, stars: 0.05, water: '#7f8ea3', waterLight: '#ffe1b0', mist: '#ead9cf', cloudLight: '#f6d1b4', cloudShade: '#a88f9c' },
  { h: 8, skyTop: '#9ab8c4', skyMid: '#cfddd8', skyHorizon: '#f1eadc', haze: '#c9d6d2', sunlight: '#fff0cf', shadow: '#4e6460', ambient: '#ffffff', ambientAmount: 0, sunColor: '#fff4dc', rays: 0.35, glow: 0, stars: 0, water: '#88aeb0', waterLight: '#f6f2e2', mist: '#f1efe6', cloudLight: '#fbf8ef', cloudShade: '#c3cfd0' },
  { h: 12.5, skyTop: '#8fb3c7', skyMid: '#c4d9dc', skyHorizon: '#ecefe6', haze: '#c5d4d3', sunlight: '#fff6dd', shadow: '#4a5f5b', ambient: '#ffffff', ambientAmount: 0, sunColor: '#fffaf0', rays: 0.1, glow: 0, stars: 0, water: '#80a9ae', waterLight: '#ffffff', mist: '#f2f2ec', cloudLight: '#ffffff', cloudShade: '#c2d0d4' },
  { h: 15.5, skyTop: '#93b0bf', skyMid: '#cfd9d2', skyHorizon: '#f2e6cf', haze: '#cdd3c8', sunlight: '#ffe8bd', shadow: '#4c5b55', ambient: '#ffffff', ambientAmount: 0, sunColor: '#fff0cf', rays: 0.25, glow: 0, stars: 0, water: '#86a8a8', waterLight: '#fff1d4', mist: '#f1ece0', cloudLight: '#fff8ea', cloudShade: '#c7c9c4' },
  { h: 17.2, skyTop: '#7b8ea8', skyMid: '#e0b893', skyHorizon: '#f7c27c', haze: '#d8b69a', sunlight: '#ffc982', shadow: '#4f4458', ambient: '#e0a070', ambientAmount: 0.1, sunColor: '#ffcf8a', rays: 0.9, glow: 0.3, stars: 0, water: '#9c968e', waterLight: '#ffcf8a', mist: '#efd5bb', cloudLight: '#ffd4a1', cloudShade: '#a98a92' },
  { h: 18.6, skyTop: '#3e4c6e', skyMid: '#a8788a', skyHorizon: '#e39a73', haze: '#8d7484', sunlight: '#f0a278', shadow: '#2e2a40', ambient: '#6a5a84', ambientAmount: 0.26, sunColor: '#f6a978', rays: 0.5, glow: 0.7, stars: 0.15, water: '#5a5670', waterLight: '#f0a878', mist: '#a78d9c', cloudLight: '#d9958b', cloudShade: '#5a4c66' },
  { h: 19.8, skyTop: '#16203a', skyMid: '#323e62', skyHorizon: '#5b5a78', haze: '#3c4562', sunlight: '#7b82a8', shadow: '#121828', ambient: '#283a6a', ambientAmount: 0.58, sunColor: '#e9e2cc', rays: 0, glow: 1, stars: 0.75, water: '#26354f', waterLight: '#d8c58f', mist: '#46516e', cloudLight: '#48536f', cloudShade: '#222b40' },
  { h: 24, skyTop: '#0b1220', skyMid: '#16223a', skyHorizon: '#26324c', haze: '#26324a', sunlight: '#6f7fa6', shadow: '#0c1220', ambient: '#203466', ambientAmount: 0.66, sunColor: '#e9e2cc', rays: 0, glow: 1, stars: 1, water: '#1d2c44', waterLight: '#d8c58f', mist: '#3a4762', cloudLight: '#3c4a66', cloudShade: '#1c2638' },
];

/** 時刻（0〜24）から光を求める。キーとなる時刻の間をなめらかにつなぐ */
export function lightAt(hour: number): Light {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t0 = (h - a.h) / (b.h - a.h || 1);
  const t = t0 * t0 * (3 - 2 * t0);
  const c = (k: keyof Key) => mix(hex(a[k] as string), hex(b[k] as string), t);
  const n = (k: keyof Key) => lerp(a[k] as number, b[k] as number, t);
  // 太陽は 6時に東の地平線、12時に南中、18.5時に西へ沈む。夜は月
  const day = (h - 5.6) / (18.9 - 5.6);
  const isDay = day >= 0 && day <= 1;
  const sunX = isDay ? 0.12 + day * 0.76 : 0.72;
  const sunY = isDay ? 0.36 - Math.sin(day * Math.PI) * 0.26 : 0.12;
  const sunVisible = isDay ? Math.min(1, Math.sin(day * Math.PI) * 3) : 0;
  return {
    hour: h,
    skyTop: c('skyTop'),
    skyMid: c('skyMid'),
    skyHorizon: c('skyHorizon'),
    haze: c('haze'),
    sunlight: c('sunlight'),
    shadow: c('shadow'),
    ambient: c('ambient'),
    ambientAmount: n('ambientAmount'),
    sunX,
    sunY,
    sunColor: c('sunColor'),
    sunVisible,
    moonVisible: isDay ? 0 : 1,
    stars: n('stars'),
    rays: n('rays'),
    glow: n('glow'),
    water: c('water'),
    waterLight: c('waterLight'),
    mist: c('mist'),
    cloudLight: c('cloudLight'),
    cloudShade: c('cloudShade'),
  };
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export function seasonOf(date: string): Season {
  const m = +date.slice(5, 7);
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

export interface Flora {
  /** 広葉樹の葉の色の候補（木ごとに選ぶ） */
  leaves: string[];
  conifer: string;
  grassLight: string;
  grassDark: string;
  meadow: string;
  hillNear: string;
  hillFar: string;
  /** 草原の花の色 */
  blossoms: string[];
  /** 舞う葉・花びらの色 */
  drift: string[];
  snow: number;
}

export const FLORA: Record<Season, Flora> = {
  spring: {
    leaves: ['#7d9a5a', '#8fae66', '#e6b8c2', '#d9a3b3', '#6f8e52'],
    conifer: '#3d5a46',
    grassLight: '#b7c486',
    grassDark: '#6f8a58',
    meadow: '#a9b97c',
    hillNear: '#6f8c62',
    hillFar: '#8aa085',
    blossoms: ['#f1d6dc', '#f4ecd6', '#e8c7d3', '#f6e3a8'],
    drift: ['#f2d3db', '#f7e6ea'],
    snow: 0.05,
  },
  summer: {
    leaves: ['#4f7a45', '#5d8a4c', '#3f6a3c', '#6a9150'],
    conifer: '#2f4c3c',
    grassLight: '#a5b874',
    grassDark: '#5c7a48',
    meadow: '#93ab68',
    hillNear: '#5a7d55',
    hillFar: '#7c977c',
    blossoms: ['#f3ecd2', '#e9c86a', '#d6e2f0'],
    drift: ['#f4efd8'],
    snow: 0,
  },
  autumn: {
    leaves: ['#c27a3a', '#d6a64a', '#a8532f', '#8a8f45', '#b8913f', '#6c7d43'],
    conifer: '#34503f',
    grassLight: '#c8b779',
    grassDark: '#7d7a4c',
    meadow: '#b5a96c',
    hillNear: '#7a7b52',
    hillFar: '#9a977c',
    blossoms: ['#e2b45c', '#d9875a', '#efe1bf'],
    drift: ['#c9772f', '#d9a441', '#a8532f'],
    snow: 0.15,
  },
  winter: {
    leaves: ['#8b8676', '#9c9887', '#7d7a6c'],
    conifer: '#2f4639',
    grassLight: '#c9c7b4',
    grassDark: '#8a8a78',
    meadow: '#c5c4b0',
    hillNear: '#8d968c',
    hillFar: '#a9b1ab',
    blossoms: ['#f4f2ea'],
    drift: ['#ffffff', '#eef2f4'],
    snow: 0.6,
  },
};
