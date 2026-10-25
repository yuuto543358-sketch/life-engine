import type { FinancialProfile, Goal, GoalPlan, OneOffItem, Scenario } from '../data/types';
import { addMonths, clamp, isValidDate, monthFromIndex, monthIndex, monthsUntilInclusive, num } from './units';

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
  /** ボーナスから貯める額の合計（円）。ボーナスを使わないときは 0 */
  fromBonus: number;
  /** ボーナスから貯める回数と、その内訳（いつ・いくら） */
  bonusUses: BonusUse[];
}

/** ボーナスから貯める1回分 */
export interface BonusUse {
  /** 入る年月 "YYYY-MM" */
  month: string;
  label: string;
  /** その回にこの目標へ回す額（円） */
  amount: number;
}

/**
 * お金の目標で、目標日までに毎月いくら貯める必要があるかを計算する。
 *
 * 入力: 目標金額（円）、目標日（YYYY-MM-DD）、貯まっている額（円）、今日の日付
 * 出力: あと必要な額、積立回数、毎月必要な額
 * 前提: 毎月末に同じ額を貯めると仮定し、今月と目標日の月を含めて数える。運用益は含めない。
 */
export function calculateMoneyGoalNeed(target: number, deadline: string, saved: number, today: string, bonus: BonusSlot[] = []): MoneyGoalNeed {
  const t = Math.max(0, num(target));
  const s = Math.max(0, num(saved));
  const remaining = Math.max(0, t - s);
  const progress = t > 0 ? Math.min(100, (s / t) * 100) : 0;
  const base = { target: t, saved: s, remaining, progress, fromBonus: 0, bonusUses: [] as BonusUse[] };
  if (t <= 0) return { ...base, remaining: 0, months: null, monthlyNeed: null, progress: 0, status: 'no-target' };
  if (remaining === 0) return { ...base, months: null, monthlyNeed: 0, progress: 100, status: 'done' };
  if (!isValidDate(deadline)) return { ...base, months: null, monthlyNeed: null, status: 'no-date' };
  const months = monthsUntilInclusive(today, deadline);
  if (months <= 0) return { ...base, months: 0, monthlyNeed: null, status: 'passed' };
  // ボーナス: 目標日の月までに入るボーナスの「貯金に回す分」を、早い順に使う（残りの枠から）
  const last = monthIndex(deadline);
  let left = remaining;
  const bonusUses: BonusUse[] = [];
  for (const slot of bonus) {
    if (left <= 0) break;
    if (monthIndex(slot.month) > last || slot.left <= 0) continue;
    const use = Math.min(left, slot.left);
    slot.left -= use;
    left -= use;
    bonusUses.push({ month: slot.month, label: slot.label, amount: use });
  }
  const fromBonus = remaining - left;
  return { ...base, months, monthlyNeed: Math.ceil(left / months), fromBonus, bonusUses, status: 'ok' };
}

// ------------------------------------------------------------------
// ボーナス
// ------------------------------------------------------------------

/** ボーナスのうち、お金の目標の貯金に回す割合の初期値（%） */
export const DEFAULT_BONUS_SAVINGS_RATE = 50;

/** ボーナスのうち貯金に回す割合（%、0〜100） */
export function bonusSavingsRate(fin: Pick<FinancialProfile, 'bonusSavingsRate'>): number {
  return clamp(num(fin.bonusSavingsRate, DEFAULT_BONUS_SAVINGS_RATE), 0, 100);
}

/** 臨時収入のうち、ボーナスとして扱うもの。未設定なら「毎年くり返す収入」をボーナスとみなす */
export function isBonusItem(o: OneOffItem): boolean {
  return o.type === 'income' && (o.bonus ?? o.repeatYearly);
}

/** これから入るボーナス1回分（目標に回せる残りの額 left を、目標ごとに使っていく） */
export interface BonusSlot {
  month: string;
  label: string;
  /** ボーナスの額（円） */
  amount: number;
  /** 貯金に回す額（円）= ボーナスの額 × 貯金に回す割合（1円未満切り捨て） */
  save: number;
  /** まだ目標に割り当てていない額（円） */
  left: number;
}

/**
 * 今月から toMonth（"YYYY-MM"）までに入るボーナスの一覧（早い順）。
 * 毎年くり返すものは、登録した月から毎年同じ月に入るものとして数える。
 */
export function bonusSlots(fin: FinancialProfile, today: string, toMonth: string): BonusSlot[] {
  const from = monthIndex(today);
  const to = monthIndex(toMonth);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const rate = bonusSavingsRate(fin) / 100;
  const out: BonusSlot[] = [];
  for (const o of fin.oneOffs ?? []) {
    if (!isBonusItem(o)) continue;
    const start = monthIndex(o.month);
    const amount = Math.max(0, num(o.amount));
    if (!Number.isFinite(start) || amount <= 0) continue;
    const save = Math.floor(amount * rate);
    if (save <= 0) continue;
    for (let m = start; m <= to; m += o.repeatYearly ? 12 : Infinity) {
      if (m >= from) out.push({ month: monthFromIndex(m), label: o.label || 'ボーナス', amount, save, left: save });
      if (!o.repeatYearly) break;
    }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month) || a.label.localeCompare(b.label));
}

/**
 * 計画に含めたお金の目標ごとに、ボーナスから貯める額と、それ以外に毎月貯める額を求める。
 * ボーナスは、優先順位の高い目標から順に、目標日までに入る分を早い順に割り当てる（同じボーナスを二重に数えない）。
 */
export function moneyGoalNeeds(scenario: Scenario, goals: Goal[], today: string): Map<string, MoneyGoalNeed> {
  const list = goals.filter((g) => isMoneyGoal(g) && scenario.goalPlans[g.id]?.included).map((goal) => ({ goal, plan: scenario.goalPlans[goal.id] }));
  const ordered = [...list].sort(
    (a, b) => num(a.plan.priority, 99) - num(b.plan.priority, 99) || a.goal.createdAt.localeCompare(b.goal.createdAt) || a.goal.id.localeCompare(b.goal.id),
  );
  const lastMonth = ordered.map((x) => x.plan.deadline.slice(0, 7)).filter((m) => Number.isFinite(monthIndex(m))).sort().pop() ?? '';
  const slots = lastMonth ? bonusSlots(scenario.finance, today, lastMonth) : [];
  const out = new Map<string, MoneyGoalNeed>();
  for (const { goal, plan } of ordered) out.set(goal.id, calculateMoneyGoalNeed(plan.budget, plan.deadline, goal.savedAmount ?? 0, today, slots));
  return out;
}

export interface AutoSavingsTarget {
  /** 貯金の目標額（円）= 計画に含めた未達成のお金の目標の目標金額の合計 */
  target: number;
  /** 期限の年月 = いちばん遅い目標日の月 */
  month: string;
  /** 毎月必要な貯金額（円/月）= 目標ごとの「ボーナス以外で毎月貯める額」の合計 */
  monthlyNeed: number;
  /** ボーナスから貯める額の合計（円） */
  fromBonus: number;
  /** ボーナスのうち貯金に回す割合（%） */
  bonusRate: number;
  /** 対象の目標 */
  goals: { goal: Goal; plan: GoalPlan; need: MoneyGoalNeed }[];
}

/** 貯金の目標額を、お金の目標から自動で計算する */
export function calculateAutoSavingsTarget(scenario: Scenario, goals: Goal[], today: string): AutoSavingsTarget {
  const needs = moneyGoalNeeds(scenario, goals, today);
  const list = goals
    .filter((g) => isMoneyGoal(g) && scenario.goalPlans[g.id]?.included)
    .map((goal) => {
      const plan = scenario.goalPlans[goal.id];
      return { goal, plan, need: needs.get(goal.id)! };
    })
    .filter((x) => x.need.status !== 'no-target');
  const active = list.filter((x) => x.need.status !== 'done');
  const months = active.map((x) => x.plan.deadline.slice(0, 7)).filter((m) => Number.isFinite(monthIndex(m)));
  return {
    target: active.reduce((s, x) => s + x.need.target, 0),
    month: months.length ? months.sort()[months.length - 1] : '',
    monthlyNeed: active.reduce((s, x) => s + (x.need.monthlyNeed ?? 0), 0),
    fromBonus: active.reduce((s, x) => s + x.need.fromBonus, 0),
    bonusRate: bonusSavingsRate(scenario.finance),
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
