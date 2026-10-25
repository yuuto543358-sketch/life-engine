import type { BreakdownKind, FinancialProfile, MoneyItem, OneOffItem } from '../data/types';
import { MONTHS_PER_YEAR, addMonths, monthIndex, monthsUntilInclusive, num } from './units';

export interface MonthlyBalanceResult {
  /** 手取り収入（円/月） */
  income: number;
  fixedCosts: number;
  variableCosts: number;
  /** 月間収支（円/月）= 収入 − 固定費 − 変動費 */
  surplus: number;
  /** 予定している貯金額（円/月） */
  plannedSavings: number;
  /** 実際に貯金できる額（円/月）= min(予定貯金額, 月間収支)。収支がマイナスなら貯金が減る */
  effectiveSavings: number;
  /** 貯金に回さず残る額（円/月）= 月間収支 − 予定貯金額。マイナスなら貯金額が収支を超えている */
  unallocated: number;
  /** 予定貯金額に対して足りない額（円/月） */
  savingsShortfall: number;
  /** 年間収支（円/年）= 月間収支 × 12 + 今後12か月の臨時収支 */
  annualSurplus: number;
  /** 年間の貯金の増加額（円/年）= 実際に貯金できる額 × 12 + 今後12か月の臨時収支（利回りを含まない） */
  annualSavings: number;
  /** 今後12か月の臨時収支の合計（円） */
  oneOffNext12: number;
  /** 貯蓄率（%）= 実際に貯金できる額 ÷ 収入。収入 0 なら null */
  savingsRate: number | null;
}

/** 金額の入力を 0 以上の数に補正する */
function money(v: unknown): number {
  const n = num(v, 0);
  return n < 0 ? 0 : n;
}

const BREAKDOWN_KEYS = {
  income: ['incomeItems', 'monthlyIncome'],
  fixed: ['fixedItems', 'fixedCosts'],
  variable: ['variableItems', 'variableCosts'],
  savings: ['savingsItems', 'monthlySavings'],
} as const satisfies Record<BreakdownKind, readonly [keyof FinancialProfile, keyof FinancialProfile]>;

/**
 * 内訳の合計（円/月）。内訳があれば内訳の合計（負の金額は 0 とする）、なければ合計の値をそのまま使う。
 */
export function breakdownTotal(fin: Partial<FinancialProfile>, kind: BreakdownKind): number {
  const [itemsKey, totalKey] = BREAKDOWN_KEYS[kind];
  const items = fin?.[itemsKey] as MoneyItem[] | undefined;
  if (items && items.length > 0) return items.reduce((s, i) => s + money(i.amount), 0);
  return money(fin?.[totalKey]);
}

/** 固定費の合計（円/月） */
export function fixedTotal(fin: Partial<FinancialProfile>): number {
  return breakdownTotal(fin, 'fixed');
}

/** 指定月に発生する臨時収支の合計（円、収入は正・支出は負） */
export function oneOffNetForMonth(items: OneOffItem[], ym: string): number {
  const idx = monthIndex(ym);
  let total = 0;
  for (const item of items ?? []) {
    const start = monthIndex(item.month);
    if (!Number.isFinite(start)) continue;
    const hit = item.repeatYearly ? idx >= start && (idx - start) % 12 === 0 : idx === start;
    if (hit) total += (item.type === 'income' ? 1 : -1) * money(item.amount);
  }
  return total;
}

/**
 * 月間収支を計算する。
 *
 * 入力: FinancialProfile（月額は円/月）、今日の日付（臨時収支を数える基準）
 * 出力: 月間収支・年間収支・実際に貯金できる額など
 * 前提: 臨時収支は「今月を含む今後12か月」に発生するものを年間収支に含める。
 */
export function calculateMonthlyBalance(fin: FinancialProfile, today: string): MonthlyBalanceResult {
  const income = breakdownTotal(fin, 'income');
  const fixedCosts = breakdownTotal(fin, 'fixed');
  const variableCosts = breakdownTotal(fin, 'variable');
  const plannedSavings = breakdownTotal(fin, 'savings');
  const surplus = income - fixedCosts - variableCosts;
  const effectiveSavings = Math.min(plannedSavings, surplus);
  const unallocated = surplus - plannedSavings;

  const thisMonth = today.slice(0, 7);
  let oneOffNext12 = 0;
  for (let i = 0; i < MONTHS_PER_YEAR; i++) {
    oneOffNext12 += oneOffNetForMonth(fin?.oneOffs ?? [], addMonths(thisMonth, i));
  }

  return {
    income,
    fixedCosts,
    variableCosts,
    surplus,
    plannedSavings,
    effectiveSavings,
    unallocated,
    savingsShortfall: unallocated < 0 ? -unallocated : 0,
    annualSurplus: surplus * MONTHS_PER_YEAR + oneOffNext12,
    annualSavings: effectiveSavings * MONTHS_PER_YEAR + oneOffNext12,
    oneOffNext12,
    savingsRate: income > 0 ? (effectiveSavings / income) * 100 : null,
  };
}

export interface SavingsPoint {
  /** 何か月後か（1 = 今月末） */
  month: number;
  ym: string;
  /** その月末の貯金残高（円） */
  balance: number;
  /** その月の積立（円） */
  contribution: number;
  /** その月の臨時収支（円） */
  oneOff: number;
  /** その月の運用益（円、仮定の利回りによる計算値） */
  interest: number;
}

export interface SavingsProjection {
  points: SavingsPoint[];
  /** 毎月の積立額（円/月）= 実際に貯金できる額 */
  monthlyContribution: number;
  /** 目標額（0 は未設定） */
  target: number;
  /** 目標に到達するまでの月数（今月末 = 1）。到達しない・未設定なら null */
  monthsToTarget: number | null;
  /** 到達する年月 */
  reachYm: string | null;
  /** すでに目標額以上か */
  alreadyReached: boolean;
  /** 期限までの積立回数（今月と期限の月を含む）。期限未設定なら null */
  monthsToDeadline: number | null;
  /** 期限の月末時点の残高。期限未設定・期限切れなら null */
  balanceAtDeadline: number | null;
  /** 期限までに達成できるか。目標・期限が未設定なら null */
  reachableByDeadline: boolean | null;
  /** 期限までに達成するのに必要な毎月の貯金額（円/月）。計算できなければ null */
  requiredMonthly: number | null;
  /** 期限が過去になっている */
  deadlinePassed: boolean;
  /** 探索した最大月数 */
  horizon: number;
}

/** 到達月を探す上限（50年） */
export const SAVINGS_SEARCH_LIMIT = 600;

function simulate(
  fin: FinancialProfile,
  startYm: string,
  contribution: number,
  months: number,
): SavingsPoint[] {
  const rate = Math.max(0, num(fin?.annualReturnRate, 0)) / 100 / MONTHS_PER_YEAR;
  let balance = num(fin?.currentSavings, 0);
  const points: SavingsPoint[] = [];
  for (let m = 1; m <= months; m++) {
    const ym = addMonths(startYm, m - 1);
    // 運用益は前月末の残高がプラスの場合のみ（マイナス残高に利息は付けない）
    const interest = balance > 0 ? balance * rate : 0;
    const oneOff = oneOffNetForMonth(fin?.oneOffs ?? [], ym);
    balance = balance + interest + contribution + oneOff;
    points.push({ month: m, ym, balance, contribution, oneOff, interest });
  }
  return points;
}

/**
 * 将来の貯金残高を計算する。
 *
 * 入力: FinancialProfile、今日の日付、表示する月数
 * 出力: 月末ごとの残高、目標到達までの月数、期限までに必要な月額
 * 前提:
 * - 入力された収支が毎月変わらず続くと仮定した計算値であり、将来を保証しない。
 * - 毎月の積立は「実際に貯金できる額」= min(予定貯金額, 月間収支)。収支がマイナスなら残高は減る。
 * - 臨時収支はその月の残高に加減する。
 * - 年利は月利 = 年利 ÷ 12 の月複利。初期値は 0%。
 * - 今月末を1か月目とし、期限の月末までに積み立てる回数で必要額を求める。
 */
export function projectSavings(
  fin: FinancialProfile,
  today: string,
  displayMonths = 60,
): SavingsProjection {
  const balanceResult = calculateMonthlyBalance(fin, today);
  const contribution = balanceResult.effectiveSavings;
  const startYm = today.slice(0, 7);
  const target = Math.max(0, num(fin?.savingsTarget, 0));
  const current = num(fin?.currentSavings, 0);

  const search = simulate(fin, startYm, contribution, SAVINGS_SEARCH_LIMIT);
  const alreadyReached = target > 0 && current >= target;
  let monthsToTarget: number | null = null;
  if (target > 0 && !alreadyReached) {
    const hit = search.find((p) => p.balance >= target);
    monthsToTarget = hit ? hit.month : null;
  } else if (alreadyReached) {
    monthsToTarget = 0;
  }

  let monthsToDeadline: number | null = null;
  let balanceAtDeadline: number | null = null;
  let reachableByDeadline: boolean | null = null;
  let requiredMonthly: number | null = null;
  let deadlinePassed = false;

  if (fin?.targetMonth && Number.isFinite(monthIndex(fin.targetMonth))) {
    monthsToDeadline = monthsUntilInclusive(today, fin.targetMonth);
    if (monthsToDeadline <= 0) {
      deadlinePassed = true;
      monthsToDeadline = 0;
    } else {
      const n = Math.min(monthsToDeadline, SAVINGS_SEARCH_LIMIT);
      balanceAtDeadline = search[n - 1].balance;
      if (target > 0) {
        reachableByDeadline = alreadyReached || balanceAtDeadline >= target;
        requiredMonthly = requiredMonthlyFor(fin, startYm, n, target);
      }
    }
  }

  const horizon = Math.max(1, Math.min(SAVINGS_SEARCH_LIMIT, Math.round(displayMonths)));
  return {
    points: search.slice(0, horizon),
    monthlyContribution: contribution,
    target,
    monthsToTarget,
    reachYm: monthsToTarget && monthsToTarget > 0 ? addMonths(startYm, monthsToTarget - 1) : monthsToTarget === 0 ? startYm : null,
    alreadyReached,
    monthsToDeadline,
    balanceAtDeadline,
    reachableByDeadline,
    requiredMonthly,
    deadlinePassed,
    horizon,
  };
}

/**
 * n か月後の月末に目標額へ届く最小の毎月積立額（円/月、1円単位で切り上げ）。
 * 積立 0 の場合の残高を基準に、残りを年金現価係数で割って求め、シミュレーションで確認する。
 */
function requiredMonthlyFor(fin: FinancialProfile, startYm: string, n: number, target: number): number {
  const rate = Math.max(0, num(fin?.annualReturnRate, 0)) / 100 / MONTHS_PER_YEAR;
  const base = simulate(fin, startYm, 0, n)[n - 1].balance;
  if (base >= target) return 0;
  const factor = rate === 0 ? n : ((1 + rate) ** n - 1) / rate;
  let p = Math.ceil((target - base) / factor);
  // マイナス残高には利息を付けないため、閉じた式とわずかにずれる場合がある。確認して調整する
  for (let guard = 0; guard < 50 && simulate(fin, startYm, p, n)[n - 1].balance < target; guard++) {
    p += Math.max(1, Math.ceil((target - simulate(fin, startYm, p, n)[n - 1].balance) / n));
  }
  return p;
}
