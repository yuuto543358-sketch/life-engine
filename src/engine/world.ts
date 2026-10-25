/**
 * VERDANTH の世界のエンジン。
 *
 * 世界の状態は、現実の記録・目標・設定から、ここに書かれた決まったルールだけで計算する。
 * - 乱数・現在時刻を使わない（今日の日付は引数で受け取る）。同じ入力なら必ず同じ世界になる。
 * - ログイン回数やボタンを押した回数では変化しない。
 * - 休息の法則: 記録の積み重ね（累計）だけで育つので、休んでも建物や森は失われない。
 * - 記憶の法則: 達成した目標や節目は記念碑として残り続ける。
 * - 健康や仕事の良し悪しは判定しない。データがなければ「不明（未開）」のまま扱う。
 *
 * 描画（画面）はこの結果だけを見て絵を描く。描画側でルールを持たない。
 */
import type { ActualRecord, ChronicleEntry, Dependency, Goal, LifeDomain, Scenario, TimeCategoryKey } from '../data/types';
import { breakdownTotal } from './money';
import { isMoneyGoal } from './moneyGoals';
import { addDays, dateToDay, daysBetween, isValidDate, num } from './units';

export type RegionKey = 'wild' | 'nature' | 'paths' | 'civ';
export type LawKey = 'sprout' | 'layer' | 'link' | 'milestone' | 'rest' | 'memory';
export type EraKey = 'dawn' | 'sprout' | 'waymark' | 'symbiosis';

export const REGION_LABELS: Record<RegionKey, { name: string; meaning: string }> = {
  wild: { name: '原生域', meaning: 'まだ知らない自分・将来の可能性' },
  nature: { name: '自然域', meaning: '日々の暮らし・休息・生活の基盤' },
  paths: { name: '道と集落', meaning: '行動と経験' },
  civ: { name: '文明域', meaning: '築き上げてきたもの' },
};

export const LAW_LABELS: Record<LawKey, string> = {
  sprout: '芽吹きの法則',
  layer: '積層の法則',
  link: '連結の法則',
  milestone: '節目の法則',
  rest: '休息の法則',
  memory: '記憶の法則',
};

export const ERA_LABELS: Record<EraKey, { name: string; meaning: string }> = {
  dawn: { name: '淡明の時代', meaning: '世界の始まり。すべてが可能性として眠っている' },
  sprout: { name: '芽吹きの時代', meaning: '新しい営みや経験が芽を出しはじめている' },
  waymark: { name: '道標の時代', meaning: '行動と経験が道となって、つながりはじめている' },
  symbiosis: { name: '共生の時代', meaning: '自然の営みと築いたものが、ともに息づいている' },
};

/** 領域ごとの拠点（建物）の種類 */
export type StructureKind = 'workshop' | 'library' | 'atelier' | 'plaza' | 'spring' | 'house' | 'storehouse' | 'tower';

const DOMAIN_STRUCTURE: Record<string, { kind: StructureKind; name: string; region: RegionKey }> = {
  'd-work': { kind: 'workshop', name: '工房', region: 'paths' },
  'd-learning': { kind: 'library', name: '図書館', region: 'civ' },
  'd-hobby': { kind: 'atelier', name: 'アトリエの庭', region: 'paths' },
  'd-relations': { kind: 'plaza', name: '集いの広場', region: 'paths' },
  'd-health': { kind: 'spring', name: '生命の泉', region: 'nature' },
  'd-living': { kind: 'house', name: '暮らしの家', region: 'nature' },
  'd-money': { kind: 'storehouse', name: '蓄えの蔵', region: 'civ' },
};

/** 記録の時間カテゴリから領域を推定する（目標に紐づいていない記録のみ） */
const CATEGORY_DOMAIN: Record<TimeCategoryKey, string | null> = {
  sleep: 'd-health',
  housework: 'd-living',
  study: 'd-learning',
  work: 'd-work',
  commute: 'd-work',
  hobby: 'd-hobby',
  other: null,
};

/** 自然域の営みとして数える時間カテゴリ */
const NATURE_CATEGORIES: TimeCategoryKey[] = ['sleep', 'housework', 'other'];

/** 積層の法則のしきい値 */
export const THRESHOLDS = {
  /** 拠点の段階: 領域に紐づく記録の累計時間（h） */
  structureHours: [1, 10, 40, 120, 300],
  /** 生命の泉・暮らしの家の段階: 記録した日数（時間の量ではなく、記録した日の数で育つ） */
  structureDays: [1, 7, 21, 60, 150],
  /** 道の段階: 足跡（記録）を残した日数の累計 */
  pathDays: [1, 7, 30, 90, 200],
  /** 森の広がり: 自然域の営みを記録した日数の累計 */
  forestDays: [7, 30, 100],
  /** 蓄えの蔵の段階: 現在の貯金額が毎月の生活費（固定費＋変動費）の何か月分か */
  storeMonths: [0.5, 1, 3, 6, 12],
};

export interface WorldStructure {
  domainId: string;
  domainName: string;
  kind: StructureKind;
  name: string;
  region: RegionKey;
  /** 段階 0〜5。0 は「まだ形になっていない可能性」 */
  level: number;
  /** 計画中の開拓計画がある（足場がかかっている） */
  planned: boolean;
  /** 根拠となる値と説明 */
  basis: string;
  /** 次の段階までの残り（なければ null） */
  next: string | null;
}

export interface WorldMonument {
  id: string;
  date: string;
  title: string;
  goalId: string | null;
}

export interface WorldEvent {
  id: string;
  date: string;
  law: LawKey;
  region: RegionKey;
  title: string;
  /** 変化の根拠（どのデータによるか） */
  basis: string;
}

export interface WorldState {
  asOf: string;
  era: EraKey;
  /** 原生域: 霧の濃さ 0〜1（まだ記録も計画もない領域の割合） */
  mist: number;
  unexploredDomains: string[];
  /** 原生域に立つ、まだ歩き出していない開拓計画の旗 */
  flags: { goalId: string; name: string }[];
  /** 自然域 */
  nature: {
    /** 森の木の本数（最初から 14 本あり、減ることはない） */
    trees: number;
    /** 自然域の営みを記録した日数 */
    days: number;
    /** 草原の花（静寂の地の記録の数） */
    flowers: number;
    /** 水辺の蛍（何もしない時間の合計 30 分ごとに 1 つ） */
    fireflies: number;
    quietCount: number;
    nothingMinutes: number;
  };
  /** 道と集落 */
  paths: {
    /** 道の段階 0〜5 */
    level: number;
    /** 足跡を残した日数 */
    days: number;
    /** 橋（目標・領域どうしのつながり） */
    bridges: number;
  };
  structures: WorldStructure[];
  monuments: WorldMonument[];
  /** 今日ともった灯り（今日の足跡と記録の数） */
  lanterns: number;
  events: WorldEvent[];
}

export interface WorldInput {
  goals: Goal[];
  domains: LifeDomain[];
  actuals: ActualRecord[];
  dependencies: Dependency[];
  chronicle: ChronicleEntry[];
  /** 現在の計画（蓄えの蔵の計算に使う） */
  current: Scenario;
}

function levelOf(value: number, thresholds: number[]): number {
  let l = 0;
  for (const t of thresholds) if (value >= t) l++;
  return l;
}

function hoursOf(r: ActualRecord): number {
  if (r.type === 'time') return Math.max(0, num(r.hours));
  if (r.type === 'task') return Math.max(0, num(r.actualHours));
  return 0;
}

/** 記録の領域（目標に紐づいていればその目標の領域、なければ時間カテゴリから推定） */
function domainOfRecord(r: ActualRecord, goalDomain: Map<string, string | null>): string | null {
  if (r.goalId && goalDomain.has(r.goalId)) return goalDomain.get(r.goalId) ?? null;
  if (r.type === 'time') return CATEGORY_DOMAIN[r.category];
  return null;
}

/** しきい値を越えた日を、日付順の累計から求める */
function crossings(points: { date: string; value: number }[], thresholds: number[]): { threshold: number; date: string; level: number }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const out: { threshold: number; date: string; level: number }[] = [];
  let sum = 0;
  let idx = 0;
  for (const p of sorted) {
    sum += p.value;
    while (idx < thresholds.length && sum >= thresholds[idx]) {
      out.push({ threshold: thresholds[idx], date: p.date, level: idx + 1 });
      idx++;
    }
  }
  return out;
}

const fmtNum = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ja-JP');

/**
 * 指定した日（asOf）時点の世界を計算する。asOf より後の記録は使わない。
 * 蓄えの蔵だけは、貯金額の履歴がないため現在の値で計算する。
 */
export function computeWorld(input: WorldInput, asOf: string): WorldState {
  const asOfDay = dateToDay(asOf);
  const upTo = (d: string) => isValidDate(d) && dateToDay(d) <= asOfDay;
  const actuals = input.actuals.filter((a) => upTo(a.date));
  const chronicle = input.chronicle.filter((c) => upTo(c.date));
  const goals = input.goals.filter((g) => upTo(g.createdAt.slice(0, 10)) || !isValidDate(g.createdAt.slice(0, 10)));
  const deps = input.dependencies.filter((d) => upTo(d.createdAt.slice(0, 10)) || !isValidDate(d.createdAt.slice(0, 10)));
  const goalDomain = new Map(input.goals.map((g) => [g.id, g.domainId]));
  const domainName = new Map(input.domains.map((d) => [d.id, d.name]));
  const events: WorldEvent[] = [];

  // --- 足跡（記録）を残した日 ---
  const footprintDates = new Set<string>([...actuals.map((a) => a.date), ...chronicle.filter((c) => c.kind === 'journal').map((c) => c.date)]);
  const pathDays = footprintDates.size;
  const pathLevel = levelOf(pathDays, THRESHOLDS.pathDays);
  for (const c of crossings([...footprintDates].map((d) => ({ date: d, value: 1 })), THRESHOLDS.pathDays)) {
    events.push({
      id: `layer:path:${c.threshold}`,
      date: c.date,
      law: c.level === 1 ? 'sprout' : 'layer',
      region: 'paths',
      title: c.level === 1 ? '最初の足跡から、小道が生まれた' : `道がのびた（第${c.level}段階）`,
      basis: `足跡を残した日が ${c.threshold}日 になった`,
    });
  }

  // --- 自然域: 暮らしの営み ---
  const natureDates = new Set<string>([
    ...actuals.filter((a) => a.type === 'time' && NATURE_CATEGORIES.includes(a.category)).map((a) => a.date),
    ...chronicle.filter((c) => c.kind === 'quiet').map((c) => c.date),
  ]);
  const natureDays = natureDates.size;
  for (const c of crossings([...natureDates].map((d) => ({ date: d, value: 1 })), THRESHOLDS.forestDays)) {
    events.push({ id: `layer:forest:${c.threshold}`, date: c.date, law: 'layer', region: 'nature', title: '森が広がった', basis: `暮らしの営みを記録した日が ${c.threshold}日 になった` });
  }
  const quiet = chronicle.filter((c) => c.kind === 'quiet');
  const nothingMinutes = quiet.filter((c) => c.quietKind === 'nothing').reduce((s, c) => s + Math.max(0, num(c.minutes)), 0);
  const firstQuiet = [...quiet].sort((a, b) => a.date.localeCompare(b.date))[0];
  if (firstQuiet) events.push({ id: 'rest:first', date: firstQuiet.date, law: 'rest', region: 'nature', title: '静かな水辺に、花が咲いた', basis: '静寂の地で最初の記録を残した' });
  const firstNothing = [...quiet].filter((c) => c.quietKind === 'nothing').sort((a, b) => a.date.localeCompare(b.date))[0];
  if (firstNothing) events.push({ id: 'rest:nothing', date: firstNothing.date, law: 'rest', region: 'nature', title: '水辺に蛍が飛びはじめた', basis: '何もしない時間を記録した' });

  // --- 拠点（領域ごと） ---
  const hoursByDomain = new Map<string, { date: string; value: number }[]>();
  const daysByDomain = new Map<string, Set<string>>();
  for (const a of actuals) {
    const d = domainOfRecord(a, goalDomain);
    if (!d) continue;
    const h = hoursOf(a);
    if (h > 0) hoursByDomain.set(d, [...(hoursByDomain.get(d) ?? []), { date: a.date, value: h }]);
    daysByDomain.set(d, new Set([...(daysByDomain.get(d) ?? []), a.date]));
  }
  const fixedPlusVariable = breakdownTotal(input.current.finance, 'fixed') + breakdownTotal(input.current.finance, 'variable');
  const savings = num(input.current.finance.currentSavings);
  const activeGoals = goals.filter((g) => !g.completedAt || dateToDay(g.completedAt) > asOfDay);

  const structures: WorldStructure[] = input.domains.map((dom) => {
    const def = DOMAIN_STRUCTURE[dom.id] ?? { kind: 'tower' as StructureKind, name: `${dom.name}の塔`, region: 'civ' as RegionKey };
    const planned = activeGoals.some((g) => g.domainId === dom.id && (input.current.goalPlans[g.id]?.included ?? false));
    if (def.kind === 'storehouse') {
      if (fixedPlusVariable <= 0) {
        return { domainId: dom.id, domainName: dom.name, ...def, level: savings > 0 ? 1 : 0, planned, basis: '毎月の生活費が未入力のため、蓄えの大きさは測れていません', next: null };
      }
      const months = Math.max(0, savings) / fixedPlusVariable;
      const level = levelOf(months, THRESHOLDS.storeMonths);
      const nextT = THRESHOLDS.storeMonths[level];
      return {
        domainId: dom.id,
        domainName: dom.name,
        ...def,
        level,
        planned,
        basis: `現在の貯金額は、毎月の生活費（固定費＋変動費）の 約${fmtNum(months)}か月分`,
        next: nextT !== undefined ? `生活費の ${nextT}か月分で次の段階` : null,
      };
    }
    if (def.kind === 'spring' || def.kind === 'house') {
      const days = daysByDomain.get(dom.id)?.size ?? 0;
      const level = levelOf(days, THRESHOLDS.structureDays);
      for (const c of crossings([...(daysByDomain.get(dom.id) ?? [])].map((d) => ({ date: d, value: 1 })), THRESHOLDS.structureDays)) {
        events.push({
          id: `layer:${dom.id}:${c.threshold}`,
          date: c.date,
          law: c.level === 1 ? 'sprout' : 'layer',
          region: def.region,
          title: c.level === 1 ? `${def.name}が湧きはじめた` : `${def.name}が育った（第${c.level}段階）`,
          basis: `${dom.name}の記録をした日が ${c.threshold}日 になった`,
        });
      }
      const nextT = THRESHOLDS.structureDays[level];
      return { domainId: dom.id, domainName: dom.name, ...def, level, planned, basis: `${dom.name}の記録をした日 ${days}日`, next: nextT !== undefined ? `あと ${nextT - days}日 の記録で次の段階` : null };
    }
    const pts = hoursByDomain.get(dom.id) ?? [];
    const hours = pts.reduce((s, p) => s + p.value, 0);
    const level = levelOf(hours, THRESHOLDS.structureHours);
    for (const c of crossings(pts, THRESHOLDS.structureHours)) {
      events.push({
        id: `layer:${dom.id}:${c.threshold}`,
        date: c.date,
        law: c.level === 1 ? 'sprout' : 'layer',
        region: def.region,
        title: c.level === 1 ? `${def.name}の礎が置かれた` : `${def.name}が大きくなった（第${c.level}段階）`,
        basis: `${dom.name}に関わる記録が累計 ${c.threshold}時間 になった`,
      });
    }
    const nextT = THRESHOLDS.structureHours[level];
    return {
      domainId: dom.id,
      domainName: dom.name,
      ...def,
      level,
      planned,
      basis: `${dom.name}に関わる記録の累計 ${fmtNum(hours)}時間`,
      next: nextT !== undefined ? `あと ${fmtNum(nextT - hours)}時間 で次の段階` : null,
    };
  });

  // --- 開拓計画の旗（芽吹き）と原生域 ---
  for (const g of goals) {
    const d = g.createdAt.slice(0, 10);
    if (isValidDate(d)) events.push({ id: `sprout:goal:${g.id}`, date: d, law: 'sprout', region: 'wild', title: `開拓計画「${g.name}」の旗が立った`, basis: '目標を登録した' });
  }
  const goalHasRecords = new Set(actuals.filter((a) => a.goalId).map((a) => a.goalId as string));
  const flags = activeGoals
    .filter((g) => (input.current.goalPlans[g.id]?.included ?? false) && !goalHasRecords.has(g.id) && (isMoneyGoal(g) ? (g.savedAmount ?? 0) === 0 : g.progress === 0))
    .map((g) => ({ goalId: g.id, name: g.name }));
  const touched = new Set<string>([...goals.map((g) => g.domainId).filter((x): x is string => !!x), ...hoursByDomain.keys(), ...daysByDomain.keys()]);
  const unexplored = input.domains.filter((d) => !touched.has(d.id)).map((d) => d.id);
  const mist = input.domains.length ? unexplored.length / input.domains.length : 1;

  // --- 連結の法則 ---
  const nodeName = (r: { kind: 'goal' | 'domain'; id: string }) => (r.kind === 'goal' ? input.goals.find((g) => g.id === r.id)?.name : domainName.get(r.id)) ?? '';
  for (const d of deps) {
    const date = d.createdAt.slice(0, 10);
    if (isValidDate(date)) events.push({ id: `link:${d.id}`, date, law: 'link', region: 'paths', title: `「${nodeName(d.from)}」と「${nodeName(d.to)}」が橋でつながった`, basis: 'つながりを登録した' });
  }

  // --- 節目と記憶の法則 ---
  const milestones = chronicle.filter((c) => c.kind === 'milestone');
  const monuments: WorldMonument[] = milestones.map((c) => ({ id: c.id, date: c.date, title: c.title || '節目', goalId: c.goalId }));
  for (const g of input.goals) {
    if (g.completedAt && upTo(g.completedAt) && !milestones.some((c) => c.goalId === g.id)) {
      monuments.push({ id: `goal:${g.id}`, date: g.completedAt, title: `${g.name}を達成`, goalId: g.id });
    }
  }
  monuments.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const m of monuments) events.push({ id: `milestone:${m.id}`, date: m.date, law: 'milestone', region: 'civ', title: `記念碑「${m.title}」が建った`, basis: m.goalId ? '開拓計画を達成した' : '節目を年代記に残した' });

  // --- 時代（順位ではなく、いまの世界のようすを表す名前） ---
  const civGrown = structures.some((s) => s.region !== 'nature' && s.level >= 2) || monuments.length > 0;
  let era: EraKey;
  if (pathDays === 0 && goals.length === 0 && chronicle.length === 0) era = 'dawn';
  else if (natureDays >= 14 && civGrown && pathDays >= 30) era = 'symbiosis';
  else if (pathDays >= 7 || deps.length > 0) era = 'waymark';
  else era = 'sprout';

  const lanterns = actuals.filter((a) => a.date === asOf).length + chronicle.filter((c) => c.date === asOf).length;

  events.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return {
    asOf,
    era,
    mist: Math.round(mist * 1000) / 1000,
    unexploredDomains: unexplored,
    flags,
    nature: {
      trees: 14 + Math.min(26, natureDays),
      days: natureDays,
      flowers: Math.min(24, quiet.length),
      fireflies: Math.min(12, Math.floor(nothingMinutes / 30)),
      quietCount: quiet.length,
      nothingMinutes,
    },
    paths: { level: pathLevel, days: pathDays, bridges: Math.min(4, deps.length) },
    structures,
    monuments,
    lanterns,
    events,
  };
}

/** 最近の世界の変化（今日を含む直近 days 日） */
export function recentEvents(state: WorldState, days = 14): WorldEvent[] {
  const from = addDays(state.asOf, -(days - 1));
  return state.events.filter((e) => e.date >= from && e.date <= state.asOf);
}

export interface NextStep {
  id: string;
  text: string;
  /** 移動先（画面とタブ） */
  to: { tab: 'home' | 'sim' | 'map' | 'log' | 'quiet'; sub?: string };
  kind: 'prepared' | 'plan' | 'gentle';
}

/**
 * 次の一歩。明示的なルールだけで選ぶ（最大3つ）。
 * 1. 静寂の地で用意した「明日の小さな一歩」（昨日か今日に書いたもの）
 * 2. 期限が近い開拓計画（30日以内）
 * 3. 両立しない開拓計画があれば、計画の見直し
 * 4. 今日の足跡がまだなければ、そっと記録をすすめる（休む日があってもよいことを前提に）
 */
export function nextSteps(
  input: WorldInput,
  today: string,
  conflicts: { kind: string; goalIds: string[] }[],
): NextStep[] {
  const out: NextStep[] = [];
  const prepared = input.chronicle
    .filter((c) => c.kind === 'quiet' && c.quietKind === 'tomorrow' && (c.date === today || c.date === addDays(today, -1)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  for (const [i, s] of (prepared?.steps ?? []).filter((x) => x.trim()).entries()) {
    out.push({ id: `prep:${i}`, text: s.trim(), to: { tab: 'quiet' }, kind: 'prepared' });
  }
  const soon = input.goals
    .map((g) => ({ g, plan: input.current.goalPlans[g.id] }))
    .filter(({ g, plan }) => plan?.included && !g.completedAt && isValidDate(plan.deadline) && daysBetween(today, plan.deadline) >= 0 && daysBetween(today, plan.deadline) <= 30)
    .sort((a, b) => a.plan.deadline.localeCompare(b.plan.deadline));
  for (const { g, plan } of soon.slice(0, 1)) {
    out.push({ id: `soon:${g.id}`, text: `「${g.name}」の期限まで あと${daysBetween(today, plan.deadline)}日`, to: { tab: 'sim', sub: 'goals' }, kind: 'plan' });
  }
  const conflict = conflicts.find((c) => c.goalIds.length > 0);
  if (conflict) {
    const name = input.goals.find((g) => g.id === conflict.goalIds[0])?.name ?? '';
    out.push({
      id: `conflict:${conflict.kind}`,
      text: conflict.kind === 'time' ? `「${name}」の時間の配分を見直す` : `「${name}」のお金の計画を見直す`,
      to: { tab: 'sim', sub: conflict.kind === 'time' ? 'time' : 'goals' },
      kind: 'plan',
    });
  }
  const hasToday = input.actuals.some((a) => a.date === today) || input.chronicle.some((c) => c.date === today);
  if (!hasToday) out.push({ id: 'gentle:footprint', text: '今日の足跡を、ひとつだけ残してみる（休む日もそれでよい）', to: { tab: 'home' }, kind: 'gentle' });
  return out.slice(0, 3);
}
