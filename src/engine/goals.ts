import type { ActualRecord, Goal, GoalPlan, Scenario, TimeSource } from '../data/types';
import { calculateWeeklyTimeBudget, type WeeklyTimeBudgetResult } from './time';
import { calculateMonthlyBalance, type MonthlyBalanceResult } from './money';
import { addDays, clamp, daysBetween, isValidDate, monthsUntilInclusive, num, round, DAYS_PER_WEEK } from './units';

export type DeadlineStatus =
  /** 期限までに完了する見込み（総時間が設定されている場合） */
  | 'on-track'
  /** 今の週間時間では期限に間に合わない */
  | 'late'
  /** 時間が割り当てられず、完了日を計算できない */
  | 'stalled'
  /** 期限が過ぎている */
  | 'passed'
  /** 総時間または期限が未設定で判定できない */
  | 'unknown'
  /** 完了済み */
  | 'done';

export interface GoalFeasibility {
  goalId: string;
  name: string;
  priority: number;
  /** 割り当ての順番（0 から） */
  order: number;
  completed: boolean;

  // --- 時間（h/週） ---
  timeSource: TimeSource;
  weeklyHours: number;
  /** 指定した枠から確保できた時間 */
  fromCategory: number;
  /** 枠を超えた分として自由時間から確保した時間 */
  fromFree: number;
  /** 確保できなかった時間 */
  timeShort: number;

  // --- 予算 ---
  /** 予算の総額（円） */
  budget: number;
  /** 実績として記録された支出（円） */
  spent: number;
  /** 残りの予算（円）= max(0, 予算 − 支出) */
  remainingBudget: number;
  /** 期限までの月数（今月と期限の月を含む） */
  monthsLeft: number | null;
  /** 毎月必要な額（円/月）= 残りの予算 ÷ 期限までの月数。計算できなければ null */
  monthlyNeed: number | null;
  /** 毎月確保できた額（円/月） */
  monthlyFunded: number;
  /** 毎月足りない額（円/月） */
  monthlyShort: number;
  /** 予算が必要なのに期限が未設定・期限切れで月額を計算できない */
  budgetUncomputable: boolean;

  // --- 期限 ---
  deadline: string;
  /** 残りの作業時間（h）= 総時間 × (1 − 進捗) */
  remainingHours: number | null;
  /** 見込みの完了日（確保できた時間で進めた場合） */
  estimatedFinish: string | null;
  deadlineStatus: DeadlineStatus;
  /** 期限より何日遅れる見込みか */
  daysLate: number | null;

  /** 時間・予算ともに計画の範囲に収まっているか */
  fits: boolean;
}

export interface Conflict {
  kind: 'time' | 'budget';
  /** 不足量（時間は h/週、予算は 円/月） */
  amount: number;
  /** 不足に関係する目標ID（優先順位の高い順） */
  goalIds: string[];
  message: string;
}

export interface FeasibilityResult {
  goals: GoalFeasibility[];
  time: WeeklyTimeBudgetResult;
  money: MonthlyBalanceResult;
  /** 目標に必要な時間の合計（h/週、未完了かつ計画に含む目標のみ） */
  timeDemand: number;
  /** 目標のために自由時間から使う時間（h/週） */
  freeUsedByGoals: number;
  /** 目標に使った後に残る自由時間（h/週）。マイナスにはならない */
  freeAfterGoals: number;
  /** 時間の不足（h/週）= 配分の不足 + 目標の不足 */
  timeShortage: number;
  /** 目標に必要な予算の月額合計（円/月、計算できるもののみ） */
  budgetDemandMonthly: number;
  /** 目標に使える額（円/月）= max(0, 月間収支 − 予定貯金額) */
  budgetAvailableMonthly: number;
  /** 予算の不足（円/月） */
  budgetShortageMonthly: number;
  conflicts: Conflict[];
  /** 計画に含めた未完了の目標の数 */
  activeCount: number;
  /** そのうち時間・予算の範囲に収まっている数 */
  fitCount: number;
}

/** 目標ごとの実績の支出（円）を集計する */
export function spentByGoal(actuals: ActualRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of actuals ?? []) {
    if (a.type === 'expense' && a.goalId) out[a.goalId] = (out[a.goalId] ?? 0) + Math.max(0, num(a.amount));
  }
  return out;
}

/** 割り当ての順番: 優先順位（小さいほど先）→ 作成日時 → ID。同じ入力なら常に同じ順番 */
export function orderGoals<T extends { goal: Goal; plan: GoalPlan }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      num(a.plan.priority, 99) - num(b.plan.priority, 99) ||
      a.goal.createdAt.localeCompare(b.goal.createdAt) ||
      a.goal.id.localeCompare(b.goal.id),
  );
}

/**
 * 複数の目標が時間・予算の制約に収まるかを検証する。
 *
 * 入力: シナリオ（時間・お金・目標の計画値）、目標一覧、実績、今日の日付
 * 出力: 目標ごとの確保状況、不足量と関連する目標
 * ルール:
 * - 目標の時間は、指定した枠（例: 勉強）の時間の中から使う。枠を超えた分だけ自由時間から使う。
 *   同じ時間を二重に数えないよう、枠と自由時間は1時間ずつ順番に減らしていく。
 * - 予算は、月間収支から予定貯金額を引いた残りから、毎月必要な額を確保する。
 * - 時間・予算とも、ユーザーが決めた優先順位の順に割り当てる。アプリが優先順位を決めることはない。
 * - 完了済み（進捗100%）と、計画に含めない目標は割り当てない。
 */
export function calculateGoalFeasibility(
  scenario: Scenario,
  goals: Goal[],
  actuals: ActualRecord[],
  today: string,
): FeasibilityResult {
  const time = calculateWeeklyTimeBudget(scenario.time);
  const money = calculateMonthlyBalance(scenario.finance, today);
  const spent = spentByGoal(actuals);

  // 枠ごとの残り時間
  const pool: Record<string, number> = {};
  for (const item of time.items) pool[item.key] = item.weeklyHours;
  let freePool = Math.max(0, time.freeHours);
  const budgetAvailableMonthly = Math.max(0, money.unallocated);
  let budgetPool = budgetAvailableMonthly;

  const entries = orderGoals(
    goals
      .filter((g) => scenario.goalPlans[g.id]?.included)
      .map((goal) => ({ goal, plan: scenario.goalPlans[goal.id] })),
  );

  const results: GoalFeasibility[] = entries.map(({ goal, plan }, order) => {
    const progress = clamp(num(goal.progress), 0, 100);
    const completed = progress >= 100;
    const weeklyHours = completed ? 0 : Math.max(0, num(plan.weeklyHours));

    // 時間の割り当て
    let fromCategory = 0;
    if (plan.timeSource !== 'free') {
      fromCategory = Math.min(weeklyHours, pool[plan.timeSource] ?? 0);
      pool[plan.timeSource] = (pool[plan.timeSource] ?? 0) - fromCategory;
    }
    const fromFree = Math.min(weeklyHours - fromCategory, freePool);
    freePool -= fromFree;
    const timeShort = round(weeklyHours - fromCategory - fromFree, 4);

    // 予算の割り当て
    const budget = Math.max(0, num(plan.budget));
    const goalSpent = spent[goal.id] ?? 0;
    const remainingBudget = completed ? 0 : Math.max(0, budget - goalSpent);
    const hasDeadline = isValidDate(plan.deadline);
    const monthsLeftRaw = hasDeadline ? monthsUntilInclusive(today, plan.deadline) : null;
    const monthsLeft = monthsLeftRaw === null ? null : Math.max(0, monthsLeftRaw);
    let monthlyNeed: number | null = null;
    let budgetUncomputable = false;
    if (remainingBudget > 0) {
      if (monthsLeft && monthsLeft > 0) monthlyNeed = Math.ceil(remainingBudget / monthsLeft);
      else budgetUncomputable = true;
    } else {
      monthlyNeed = 0;
    }
    const monthlyFunded = Math.min(monthlyNeed ?? 0, budgetPool);
    budgetPool -= monthlyFunded;
    const monthlyShort = (monthlyNeed ?? 0) - monthlyFunded;

    // 期限の見込み
    const fundedHours = fromCategory + fromFree;
    const total = goal.totalHours === null ? null : Math.max(0, num(goal.totalHours));
    const remainingHours = total === null ? null : round(total * (1 - progress / 100), 2);
    let estimatedFinish: string | null = null;
    let deadlineStatus: DeadlineStatus = 'unknown';
    let daysLate: number | null = null;
    if (completed) {
      deadlineStatus = 'done';
    } else if (hasDeadline && daysBetween(today, plan.deadline) < 0) {
      deadlineStatus = 'passed';
    } else if (remainingHours !== null) {
      if (remainingHours === 0) {
        estimatedFinish = today;
      } else if (fundedHours > 0) {
        estimatedFinish = addDays(today, Math.ceil((remainingHours / fundedHours) * DAYS_PER_WEEK));
      }
      if (hasDeadline) {
        if (estimatedFinish === null) deadlineStatus = 'stalled';
        else {
          const late = daysBetween(plan.deadline, estimatedFinish);
          deadlineStatus = late > 0 ? 'late' : 'on-track';
          daysLate = late > 0 ? late : 0;
        }
      } else if (estimatedFinish === null) {
        deadlineStatus = 'stalled';
      }
    }

    const fits =
      completed ||
      (timeShort <= 0 && monthlyShort <= 0 && !budgetUncomputable && deadlineStatus !== 'late' && deadlineStatus !== 'stalled' && deadlineStatus !== 'passed');

    return {
      goalId: goal.id,
      name: goal.name,
      priority: num(plan.priority, 99),
      order,
      completed,
      timeSource: plan.timeSource,
      weeklyHours,
      fromCategory,
      fromFree,
      timeShort: timeShort > 0 ? timeShort : 0,
      budget,
      spent: goalSpent,
      remainingBudget,
      monthsLeft,
      monthlyNeed,
      monthlyFunded,
      monthlyShort,
      budgetUncomputable,
      deadline: plan.deadline,
      remainingHours,
      estimatedFinish,
      deadlineStatus,
      daysLate,
      fits,
    };
  });

  const active = results.filter((r) => !r.completed);
  const timeDemand = round(active.reduce((s, r) => s + r.weeklyHours, 0), 4);
  const freeUsedByGoals = round(active.reduce((s, r) => s + r.fromFree, 0), 4);
  const goalTimeShort = round(active.reduce((s, r) => s + r.timeShort, 0), 4);
  const budgetDemandMonthly = active.reduce((s, r) => s + (r.monthlyNeed ?? 0), 0);
  const budgetShortageMonthly = active.reduce((s, r) => s + r.monthlyShort, 0);

  const conflicts: Conflict[] = [];
  if (time.shortageHours > 0) {
    conflicts.push({
      kind: 'time',
      amount: time.shortageHours,
      goalIds: [],
      message: `時間の配分が1週間の総時間を ${fmtH(time.shortageHours)} 超えています`,
    });
  }
  if (goalTimeShort > 0) {
    const ids = active.filter((r) => r.timeShort > 0).map((r) => r.goalId);
    conflicts.push({
      kind: 'time',
      amount: goalTimeShort,
      goalIds: ids,
      message: `目標に必要な時間が週 ${fmtH(goalTimeShort)} 足りません`,
    });
  }
  if (budgetShortageMonthly > 0) {
    conflicts.push({
      kind: 'budget',
      amount: budgetShortageMonthly,
      goalIds: active.filter((r) => r.monthlyShort > 0).map((r) => r.goalId),
      message: `目標に必要な予算が月 ${budgetShortageMonthly.toLocaleString('ja-JP')}円 足りません`,
    });
  }

  return {
    goals: results,
    time,
    money,
    timeDemand,
    freeUsedByGoals,
    freeAfterGoals: round(Math.max(0, time.freeHours) - freeUsedByGoals, 4),
    timeShortage: round(time.shortageHours + goalTimeShort, 4),
    budgetDemandMonthly,
    budgetAvailableMonthly,
    budgetShortageMonthly,
    conflicts,
    activeCount: active.length,
    fitCount: active.filter((r) => r.fits).length,
  };
}

function fmtH(h: number): string {
  return `${round(h, 1)}時間`;
}
