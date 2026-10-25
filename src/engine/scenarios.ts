import { TIME_CATEGORY_KEYS, type ActualRecord, type Goal, type Scenario } from '../data/types';
import { calculateGoalFeasibility } from './goals';
import { projectSavings } from './money';
import { TIME_LABELS, TIME_SOURCE_LABELS } from './labels';
import { round } from './units';

/**
 * シナリオを複製する。
 * 参照を共有しないよう、時間・お金・目標の計画値をすべて深くコピーする。
 */
export function cloneScenario(source: Scenario, opts: { id: string; name: string; now: string }): Scenario {
  const copy: Scenario = structuredCloneSafe(source);
  copy.id = opts.id;
  copy.name = opts.name;
  copy.sourceId = source.id;
  copy.createdAt = opts.now;
  copy.updatedAt = opts.now;
  delete copy.isSample;
  // 臨時収支のIDもシナリオ内で独立させる
  copy.finance.oneOffs = copy.finance.oneOffs.map((o, i) => ({ ...o, id: `${opts.id}-oo${i}` }));
  return copy;
}

export function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export type ChangeUnit = 'h/日' | '日/週' | 'h/週' | '円/月' | '円' | '%' | '' | '位';

export interface ScenarioChange {
  /** 変更の分類 */
  group: 'time' | 'money' | 'goal';
  label: string;
  from: string | number;
  to: string | number;
  unit: ChangeUnit;
}

/**
 * 2つのシナリオの違いを列挙する（base → target）。
 * 名前とメモ、作成日時などの管理情報は比較しない。
 */
export function diffScenarios(base: Scenario, target: Scenario, goals: Goal[]): ScenarioChange[] {
  const changes: ScenarioChange[] = [];
  if (base.time.totalHours !== target.time.totalHours) {
    changes.push({ group: 'time', label: '1週間の総時間', from: base.time.totalHours, to: target.time.totalHours, unit: 'h/週' });
  }
  for (const key of TIME_CATEGORY_KEYS) {
    const a = base.time.items[key];
    const b = target.time.items[key];
    if (a.hoursPerDay !== b.hoursPerDay) {
      changes.push({ group: 'time', label: `${TIME_LABELS[key]}（1日）`, from: a.hoursPerDay, to: b.hoursPerDay, unit: 'h/日' });
    }
    if (a.daysPerWeek !== b.daysPerWeek) {
      changes.push({ group: 'time', label: `${TIME_LABELS[key]}（日数）`, from: a.daysPerWeek, to: b.daysPerWeek, unit: '日/週' });
    }
  }

  const moneyFields: [keyof Scenario['finance'], string, ChangeUnit][] = [
    ['monthlyIncome', '手取り収入', '円/月'],
    ['fixedCosts', '固定費', '円/月'],
    ['variableCosts', '変動費', '円/月'],
    ['monthlySavings', '毎月の貯金額', '円/月'],
    ['currentSavings', '現在の貯金額', '円'],
    ['savingsTarget', '貯金の目標額', '円'],
    ['targetMonth', '貯金の期限', ''],
    ['annualReturnRate', '想定年利', '%'],
  ];
  for (const [field, label, unit] of moneyFields) {
    const a = base.finance[field];
    const b = target.finance[field];
    if (a !== b) changes.push({ group: 'money', label, from: a as string | number, to: b as string | number, unit });
  }
  const sig = (s: Scenario) =>
    s.finance.oneOffs.map((o) => `${o.label}|${o.type}|${o.amount}|${o.month}|${o.repeatYearly}`).sort().join(';');
  if (sig(base) !== sig(target)) {
    changes.push({ group: 'money', label: '臨時収支', from: `${base.finance.oneOffs.length}件`, to: `${target.finance.oneOffs.length}件`, unit: '' });
  }

  for (const goal of goals) {
    const a = base.goalPlans[goal.id];
    const b = target.goalPlans[goal.id];
    const ai = !!a?.included;
    const bi = !!b?.included;
    if (ai !== bi) {
      changes.push({ group: 'goal', label: goal.name, from: ai ? '含む' : '含まない', to: bi ? '含む' : '含まない', unit: '' });
      continue;
    }
    if (!a || !b || !bi) continue;
    if (a.weeklyHours !== b.weeklyHours) changes.push({ group: 'goal', label: `${goal.name}・週間時間`, from: a.weeklyHours, to: b.weeklyHours, unit: 'h/週' });
    if (a.timeSource !== b.timeSource) changes.push({ group: 'goal', label: `${goal.name}・時間の枠`, from: TIME_SOURCE_LABELS[a.timeSource], to: TIME_SOURCE_LABELS[b.timeSource], unit: '' });
    if (a.budget !== b.budget) changes.push({ group: 'goal', label: `${goal.name}・予算`, from: a.budget, to: b.budget, unit: '円' });
    if (a.deadline !== b.deadline) changes.push({ group: 'goal', label: `${goal.name}・期限`, from: a.deadline || '未設定', to: b.deadline || '未設定', unit: '' });
    if (a.priority !== b.priority) changes.push({ group: 'goal', label: `${goal.name}・優先順位`, from: a.priority, to: b.priority, unit: '位' });
  }
  return changes;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  /** 週間の自由時間（h/週）= 総時間 − 配分済み。マイナスは不足 */
  freeHours: number;
  /** 目標に使った後の自由時間（h/週） */
  freeAfterGoals: number;
  /** 時間の不足（h/週） */
  timeShortage: number;
  /** 月間収支（円/月） */
  monthlySurplus: number;
  /** 年間の貯金の増加額（円/年） */
  annualSavings: number;
  /** 貯金目標に到達するまでの月数（null は到達しない／未設定） */
  monthsToTarget: number | null;
  targetSet: boolean;
  reachableByDeadline: boolean | null;
  /** 予算の不足（円/月）= 目標予算の不足 + 貯金額が収支を超える分 */
  budgetShortage: number;
  /** 目標のうち範囲に収まる数 / 計画に含めた数 */
  goalsFit: number;
  goalsActive: number;
  /** 期限に間に合わない見込みの目標の数 */
  goalsLate: number;
  /** 比較の基準から変更した項目 */
  changes: ScenarioChange[];
}

/**
 * 複数のシナリオを同じ条件（同じ目標・実績・今日の日付）で計算し、比較できる形にまとめる。
 * base は「元の計画」。各シナリオの changes は base からの変更点。
 */
export function compareScenarios(
  scenarios: Scenario[],
  base: Scenario,
  goals: Goal[],
  actuals: ActualRecord[],
  today: string,
): ScenarioSummary[] {
  return scenarios.map((s) => {
    const f = calculateGoalFeasibility(s, goals, actuals, today);
    const p = projectSavings(s.finance, today);
    return {
      id: s.id,
      name: s.name,
      freeHours: f.time.freeHours,
      freeAfterGoals: f.freeAfterGoals,
      timeShortage: f.timeShortage,
      monthlySurplus: f.money.surplus,
      annualSavings: f.money.annualSavings,
      monthsToTarget: p.target > 0 ? p.monthsToTarget : null,
      targetSet: p.target > 0,
      reachableByDeadline: p.reachableByDeadline,
      budgetShortage: f.budgetShortageMonthly + f.money.savingsShortfall,
      goalsFit: f.fitCount,
      goalsActive: f.activeCount,
      goalsLate: f.goals.filter((g) => g.deadlineStatus === 'late' || g.deadlineStatus === 'stalled').length,
      changes: s.id === base.id ? [] : diffScenarios(base, s, goals),
    };
  });
}

/** 比較表で「最も良い値」を判定する（同じ値は同率） */
export function bestIndex(values: (number | null)[], better: 'high' | 'low'): number[] {
  const valid = values.map((v, i) => [v, i] as const).filter(([v]) => v !== null) as [number, number][];
  if (valid.length < 2) return [];
  const target = better === 'high' ? Math.max(...valid.map(([v]) => v)) : Math.min(...valid.map(([v]) => v));
  const all = valid.filter(([v]) => round(v, 4) === round(target, 4)).map(([, i]) => i);
  return all.length === valid.length ? [] : all;
}
