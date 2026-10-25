import { describe, expect, it } from 'vitest';
import { defaultDomains, emptyScenario } from '../data/defaults';
import type { ActualRecord, ChronicleEntry, Goal } from '../data/types';
import { buildSample } from '../data/sample';
import { computeWorld, nextSteps, recentEvents, THRESHOLDS, type WorldInput } from './world';
import { addDays } from './units';

const TODAY = '2026-10-25';
const NOW = '2026-10-01T00:00:00.000Z';

function input(over: Partial<WorldInput> = {}): WorldInput {
  return { goals: [], domains: defaultDomains(), actuals: [], dependencies: [], chronicle: [], current: emptyScenario(NOW), ...over };
}
const time = (id: string, date: string, category: 'study' | 'sleep' | 'work' | 'hobby' | 'housework' | 'other', hours: number, goalId: string | null = null): ActualRecord => ({ id, date, type: 'time', category, hours, goalId, memo: '', createdAt: NOW });
const goal = (id: string, over: Partial<Goal> = {}): Goal => ({ id, name: id, domainId: 'd-learning', completionCriteria: '', progress: 0, totalHours: null, note: '', createdAt: NOW, updatedAt: NOW, ...over });
const entry = (id: string, date: string, over: Partial<ChronicleEntry> = {}): ChronicleEntry => ({ id, kind: 'journal', date, title: '', body: '', photos: [], goalId: null, createdAt: NOW, updatedAt: NOW, ...over });

describe('世界の基本', () => {
  it('何も記録がなければ淡明の時代。森は最初から存在し、霧は深い', () => {
    const w = computeWorld(input(), TODAY);
    expect(w.era).toBe('dawn');
    expect(w.nature.trees).toBe(14);
    expect(w.mist).toBe(1);
    expect(w.structures.every((s) => s.level === 0)).toBe(true);
    expect(w.events).toHaveLength(0);
  });

  it('同じ入力なら、常に同じ世界になる（決定論）', () => {
    const s = buildSample(TODAY, NOW);
    const inp = input({ goals: s.goals, actuals: s.actuals, chronicle: s.chronicle, dependencies: s.dependencies, current: { ...emptyScenario(NOW), finance: s.finance, goalPlans: s.goalPlans } });
    expect(computeWorld(inp, TODAY)).toEqual(computeWorld(structuredClone(inp), TODAY));
  });
});

describe('積層の法則', () => {
  it('学びの記録の累計時間で図書館が段階的に育ち、育った日が記録される', () => {
    const actuals = [time('a', '2026-10-01', 'study', 4), time('b', '2026-10-05', 'study', 7), time('c', '2026-10-10', 'study', 30)];
    const w = computeWorld(input({ actuals }), TODAY);
    const lib = w.structures.find((s) => s.kind === 'library')!;
    expect(lib.level).toBe(3); // 41h → 1, 10, 40 を越える
    const ev = w.events.filter((e) => e.id.startsWith('layer:d-learning'));
    expect(ev.map((e) => [e.date, e.law])).toEqual([
      ['2026-10-10', 'layer'],
      ['2026-10-05', 'layer'],
      ['2026-10-01', 'sprout'],
    ]);
  });

  it('蓄えの蔵は、貯金が生活費の何か月分かで決まる', () => {
    const cur = emptyScenario(NOW);
    cur.finance = { ...cur.finance, fixedCosts: 100000, variableCosts: 100000, currentSavings: 1300000 }; // 6.5か月分
    expect(computeWorld(input({ current: cur }), TODAY).structures.find((s) => s.kind === 'storehouse')!.level).toBe(4);
  });

  it('生活費が未入力なら、蓄えの大きさは不明として扱う', () => {
    const cur = emptyScenario(NOW);
    cur.finance = { ...cur.finance, currentSavings: 500000 };
    const s = computeWorld(input({ current: cur }), TODAY).structures.find((x) => x.kind === 'storehouse')!;
    expect(s.basis).toContain('未入力');
    expect(s.next).toBeNull();
  });
});

describe('休息の法則', () => {
  it('記録しない日が続いても、森・道・建物は減らない', () => {
    const actuals = [time('a', '2026-09-01', 'study', 20), time('b', '2026-09-02', 'sleep', 7), time('c', '2026-09-03', 'work', 8)];
    const before = computeWorld(input({ actuals }), '2026-09-10');
    const after = computeWorld(input({ actuals }), addDays('2026-09-10', 200));
    expect(after.nature.trees).toBe(before.nature.trees);
    expect(after.paths).toEqual(before.paths);
    expect(after.structures.map((s) => s.level)).toEqual(before.structures.map((s) => s.level));
    expect(after.era).toBe(before.era);
  });

  it('静寂の地の記録は、花や蛍として自然域に残る', () => {
    const chronicle = [entry('q1', '2026-10-20', { kind: 'quiet', quietKind: 'nothing', minutes: 65 }), entry('q2', '2026-10-21', { kind: 'quiet', quietKind: 'reflection' })];
    const w = computeWorld(input({ chronicle }), TODAY);
    expect(w.nature).toMatchObject({ flowers: 2, fireflies: 2, nothingMinutes: 65, days: 2 });
    expect(w.events.some((e) => e.law === 'rest')).toBe(true);
  });
});

describe('節目と記憶の法則', () => {
  it('達成した目標は記念碑になり、年代記に節目があれば目標を消しても残る', () => {
    const g = goal('g1', { progress: 100, completedAt: '2026-10-10' });
    const w1 = computeWorld(input({ goals: [g] }), TODAY);
    expect(w1.monuments.map((m) => m.title)).toEqual(['g1を達成']);
    const milestone = entry('m1', '2026-10-10', { kind: 'milestone', title: 'g1を達成', goalId: null });
    const w2 = computeWorld(input({ goals: [], chronicle: [milestone] }), TODAY);
    expect(w2.monuments.map((m) => m.title)).toEqual(['g1を達成']);
  });

  it('過去の日付で計算すると、その時点の世界になる', () => {
    const actuals = [time('a', '2026-10-01', 'study', 12), time('b', '2026-10-20', 'study', 40)];
    expect(computeWorld(input({ actuals }), '2026-10-05').structures.find((s) => s.kind === 'library')!.level).toBe(2);
    expect(computeWorld(input({ actuals }), TODAY).structures.find((s) => s.kind === 'library')!.level).toBe(3); // 52h
  });
});

describe('原生域と連結の法則', () => {
  it('記録も計画もない領域が多いほど霧が深い', () => {
    const w = computeWorld(input({ goals: [goal('g1', { domainId: 'd-work' })], actuals: [time('a', '2026-10-01', 'study', 1)] }), TODAY);
    expect(w.unexploredDomains).not.toContain('d-work');
    expect(w.unexploredDomains).not.toContain('d-learning');
    expect(w.mist).toBeCloseTo(5 / 7, 3);
  });

  it('つながりは橋になり、道標の時代に入る', () => {
    const w = computeWorld(input({ goals: [goal('a'), goal('b')], dependencies: [{ id: 'd1', from: { kind: 'goal', id: 'a' }, to: { kind: 'goal', id: 'b' }, label: '', createdAt: '2026-10-12T00:00:00Z' }] }), TODAY);
    expect(w.paths.bridges).toBe(1);
    expect(w.era).toBe('waymark');
    expect(w.events.find((e) => e.law === 'link')?.date).toBe('2026-10-12');
  });
});

describe('時代', () => {
  it('道を7日以上歩けば道標の時代、自然と文明がともに育てば共生の時代', () => {
    const days = Array.from({ length: 30 }, (_, i) => addDays('2026-09-01', i));
    const actuals = days.flatMap((d, i) => [time(`s${i}`, d, 'sleep', 7), time(`w${i}`, d, 'study', 1)]);
    const w = computeWorld(input({ actuals }), TODAY);
    expect(w.paths.days).toBe(30);
    expect(w.era).toBe('symbiosis');
    expect(computeWorld(input({ actuals: actuals.slice(0, 16) }), TODAY).era).toBe('waymark');
    expect(computeWorld(input({ actuals: actuals.slice(0, 2) }), TODAY).era).toBe('sprout');
  });
  it('しきい値は公開されている', () => {
    expect(THRESHOLDS.pathDays[0]).toBe(1);
  });
});

describe('最近の変化と次の一歩', () => {
  it('直近14日の変化だけを返す', () => {
    const actuals = [time('a', '2026-09-01', 'study', 2), time('b', '2026-10-20', 'study', 9)];
    const w = computeWorld(input({ actuals }), TODAY);
    expect(recentEvents(w).every((e) => e.date >= '2026-10-12')).toBe(true);
  });
  it('静寂の地で用意した明日の一歩を最初に出し、足跡がなければそっとすすめる', () => {
    const chronicle = [entry('t', addDays(TODAY, -1), { kind: 'quiet', quietKind: 'tomorrow', steps: ['散歩', '', '本を読む'] })];
    const steps = nextSteps(input({ chronicle }), TODAY, []);
    expect(steps.map((s) => s.text)).toEqual(['散歩', '本を読む', '今日の足跡を、ひとつだけ残してみる（休む日もそれでよい）']);
  });
});
