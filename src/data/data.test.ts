import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup } from './backup';
import { defaultDomains, defaultProfile, defaultSettings, emptyScenario } from './defaults';
import { buildSample } from './sample';
import { diffData } from './store';
import type { AppData } from './types';

const NOW = '2026-10-25T00:00:00.000Z';
const TODAY = '2026-10-25';

function sampleData(): AppData {
  const s = buildSample(TODAY, NOW);
  const current = { ...emptyScenario(NOW), time: s.time, finance: s.finance, goalPlans: s.goalPlans };
  return {
    profile: { ...defaultProfile(NOW), onboarded: true },
    settings: defaultSettings(),
    domains: defaultDomains(),
    goals: s.goals,
    scenarios: [current, ...s.scenarios],
    actuals: s.actuals,
    dependencies: s.dependencies,
  };
}

describe('バックアップ', () => {
  it('書き出したデータをそのまま復元できる', () => {
    const data = sampleData();
    const text = JSON.stringify(createBackup(data, NOW));
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.goals).toEqual(data.goals);
    expect(r.data.scenarios).toEqual(data.scenarios);
    expect(r.data.actuals).toEqual(data.actuals);
    expect(r.data.dependencies).toEqual(data.dependencies);
    expect(r.warnings).toHaveLength(0);
  });

  it('JSON でないファイルは受け付けない', () => {
    const r = parseBackup('not json');
    expect(r.ok).toBe(false);
  });

  it('ほかのアプリのファイルや新しすぎる形式は受け付けない', () => {
    expect(parseBackup(JSON.stringify({ app: 'other', schemaVersion: 1, data: {} })).ok).toBe(false);
    const b = createBackup(sampleData(), NOW);
    expect(parseBackup(JSON.stringify({ ...b, schemaVersion: 99 })).ok).toBe(false);
  });

  it('1か所でも不正な値があれば全体を受け付けない', () => {
    const b = createBackup(sampleData(), NOW);
    const broken = structuredClone(b);
    (broken.data.scenarios[0].time.items.sleep as { hoursPerDay: unknown }).hoursPerDay = 'たくさん';
    const r = parseBackup(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('hoursPerDay');

    const negative = structuredClone(b);
    negative.data.scenarios[0].finance.monthlyIncome = -1;
    expect(parseBackup(JSON.stringify(negative)).ok).toBe(false);

    const badDate = structuredClone(b);
    badDate.data.actuals[0].date = '2026-02-30';
    expect(parseBackup(JSON.stringify(badDate)).ok).toBe(false);
  });

  it('現在の計画がない・IDが重複しているファイルは受け付けない', () => {
    const b = createBackup(sampleData(), NOW);
    const noCurrent = structuredClone(b);
    noCurrent.data.scenarios = noCurrent.data.scenarios.filter((s) => s.id !== 'current');
    expect(parseBackup(JSON.stringify(noCurrent)).ok).toBe(false);
    const dup = structuredClone(b);
    dup.data.goals.push(structuredClone(dup.data.goals[0]));
    expect(parseBackup(JSON.stringify(dup)).ok).toBe(false);
  });

  it('存在しない目標を指すつながりは除外して警告する', () => {
    const b = createBackup(sampleData(), NOW);
    b.data.dependencies.push({ id: 'x', from: { kind: 'goal', id: 'nope' }, to: { kind: 'domain', id: 'd-money' }, label: '', createdAt: NOW });
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.dependencies.find((d) => d.id === 'x')).toBeUndefined();
      expect(r.warnings.length).toBe(1);
    }
  });
});

describe('保存する差分', () => {
  it('変更・追加・削除したものだけを保存対象にする', () => {
    const a = sampleData();
    const b: AppData = {
      ...a,
      goals: a.goals.slice(1).map((g, i) => (i === 0 ? { ...g, name: '変更' } : g)),
      settings: { ...a.settings, theme: 'dark' },
    };
    const ops = diffData(a, b);
    expect(ops.find((o) => o.store === 'meta')?.put).toHaveLength(1);
    const goals = ops.find((o) => o.store === 'goals')!;
    expect(goals.remove).toEqual([a.goals[0].id]);
    expect(goals.put?.map((g) => g.id)).toEqual([a.goals[1].id]);
    expect(ops.find((o) => o.store === 'actuals')).toBeUndefined();
  });

  it('同じ状態なら何も保存しない', () => {
    const a = sampleData();
    expect(diffData(a, { ...a })).toHaveLength(0);
  });
});

describe('サンプルデータ', () => {
  it('同じ日付なら常に同じ内容になる', () => {
    expect(buildSample(TODAY, NOW)).toEqual(buildSample(TODAY, NOW));
  });
  it('サンプルのシナリオは互いに参照を共有しない', () => {
    const s = buildSample(TODAY, NOW);
    s.scenarios[0].time.items.sleep.hoursPerDay = 1;
    expect(s.scenarios[1].time.items.sleep.hoursPerDay).toBe(7);
    expect(s.time.items.sleep.hoursPerDay).toBe(7);
  });
});

describe('固定費の内訳のバックアップ', () => {
  it('内訳は復元され、合計は内訳から計算し直す', () => {
    const b = createBackup(sampleData(), NOW);
    b.data.scenarios[0].finance.fixedCosts = 1; // 食い違った合計
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.scenarios[0].finance.fixedItems).toHaveLength(8);
      expect(r.data.scenarios[0].finance.fixedCosts).toBe(110000);
    }
  });
  it('内訳のない古いバックアップもそのまま読み込める', () => {
    const b = createBackup(sampleData(), NOW);
    delete b.data.scenarios[0].finance.fixedItems;
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.data.scenarios[0].finance.fixedItems).toBe(undefined);
    expect(r.ok && r.data.scenarios[0].finance.fixedCosts).toBe(110000);
  });
  it('内訳の金額が不正なら読み込まない', () => {
    const b = createBackup(sampleData(), NOW);
    b.data.scenarios[0].finance.fixedItems![0].amount = -1;
    expect(parseBackup(JSON.stringify(b)).ok).toBe(false);
  });
});
