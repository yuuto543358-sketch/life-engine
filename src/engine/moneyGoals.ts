import type { FinancialProfile, Goal, GoalPlan, Scenario } from '../data/types';
import { addMonths, isValidDate, monthIndex, monthsUntilInclusive, num } from './units';

/** お金の目標（貯める・買う）かどうか */
export function isMoneyGoal(goal: Pick<Goal, 'kind'>): boolean {
  return goal.kind === 'money';
}

export interface MoneyGoalNeed {
  /** 目標金額（円） */
  target: number;
  /** すでに貯まっている額（円） */
  saved: number;
  /** あと必要な額（円）= max(0, 目標金額 − 貯まっている額) */
  remaining: number;
  /** 今月から目標日の月までの積立回数（今月と目標日の月を含む）。目標日が未設定なら null */
  months: number | null;
  /**
   * 毎月貯める必要がある額（円/月）= あと必要な額 ÷ 積立回数（1円単位で切り上げ）。
   * 目標日が未設定・過去の場合は null（無理に計算しない）
   */
  monthlyNeed: number | null;
  /** 進捗（%）= 貯まっている額 ÷ 目標金額 */
  progress: number;
  status: 'done' | 'ok' | 'no-date' | 'passed' | 'no-target';
}

/**
 * お金の目標で、目標日までに毎月いくら貯める必要があるかを計算する。
 *
 * 入力: 目標金額（円）、目標日（YYYY-MM-DD）、貯まっている額（円）、今日の日付
 * 出力: あと必要な額、積立回数、毎月必要な額
 * 前提: 毎月末に同じ額を貯めると仮定し、今月と目標日の月を含めて数える。運用益は含めない。
 */
export function calculateMoneyGoalNeed(target: number, deadline: string, saved: number, today: string): MoneyGoalNeed {
  const t = Math.max(0, num(target));
  const s = Math.max(0, num(saved));
  const remaining = Math.max(0, t - s);
  const progress = t > 0 ? Math.min(100, (s / t) * 100) : 0;
  if (t <= 0) return { target: t, saved: s, remaining: 0, months: null, monthlyNeed: null, progress: 0, status: 'no-target' };
  if (remaining === 0) return { target: t, saved: s, remaining, months: null, monthlyNeed: 0, progress: 100, status: 'done' };
  if (!isValidDate(deadline)) return { target: t, saved: s, remaining, months: null, monthlyNeed: null, progress, status: 'no-date' };
  const months = monthsUntilInclusive(today, deadline);
  if (months <= 0) return { target: t, saved: s, remaining, months: 0, monthlyNeed: null, progress, status: 'passed' };
  return { target: t, saved: s, remaining, months, monthlyNeed: Math.ceil(remaining / months), progress, status: 'ok' };
}

export interface AutoSavingsTarget {
  /** 貯金の目標額（円）= 計画に含めた未達成のお金の目標の目標金額の合計 */
  target: number;
  /** 期限の年月 = いちばん遅い目標日の月 */
  month: string;
  /** 毎月必要な貯金額（円/月）= 目標ごとの毎月必要な額の合計 */
  monthlyNeed: number;
  /** 対象の目標 */
  goals: { goal: Goal; plan: GoalPlan; need: MoneyGoalNeed }[];
}

/** 貯金の目標額を、お金の目標から自動で計算する */
export function calculateAutoSavingsTarget(scenario: Scenario, goals: Goal[], today: string): AutoSavingsTarget {
  const list = goals
    .filter((g) => isMoneyGoal(g) && scenario.goalPlans[g.id]?.included)
    .map((goal) => {
      const plan = scenario.goalPlans[goal.id];
      return { goal, plan, need: calculateMoneyGoalNeed(plan.budget, plan.deadline, goal.savedAmount ?? 0, today) };
    })
    .filter((x) => x.need.status !== 'no-target');
  const active = list.filter((x) => x.need.status !== 'done');
  const months = active.map((x) => x.plan.deadline.slice(0, 7)).filter((m) => Number.isFinite(monthIndex(m)));
  return {
    target: active.reduce((s, x) => s + x.need.target, 0),
    month: months.length ? months.sort()[months.length - 1] : '',
    monthlyNeed: active.reduce((s, x) => s + (x.need.monthlyNeed ?? 0), 0),
    goals: list,
  };
}

/** 貯金目標の決め方。未設定の古いデータは、目標額が入っていれば手動、なければ自動 */
export function savingsTargetMode(fin: FinancialProfile): 'auto' | 'manual' {
  return fin.savingsTargetMode ?? (fin.savingsTarget > 0 ? 'manual' : 'auto');
}

/**
 * 将来の残高の計算に使うお金の計画。自動のときは、貯金の目標額と期限をお金の目標から決める。
 */
export function resolveFinance(scenario: Scenario, goals: Goal[], today: string): FinancialProfile {
  const fin = scenario.finance;
  if (savingsTargetMode(fin) === 'manual') return fin;
  const auto = calculateAutoSavingsTarget(scenario, goals, today);
  return { ...fin, savingsTarget: auto.target, targetMonth: auto.target > 0 ? auto.month || addMonths(today.slice(0, 7), 0) : '' };
}
