import {
  TIME_CATEGORY_KEYS,
  type ActualRecord,
  type ExpenseCategory,
  type Goal,
  type Scenario,
  type TaskActual,
  type TimeCategoryKey,
} from '../data/types';
import { calculateWeeklyTimeBudget } from './time';
import {
  addDays,
  addMonths,
  dateToDay,
  monthlyToPeriod,
  num,
  round,
  startOfMonth,
  startOfWeek,
  weeklyToPeriod,
  type PeriodKind,
} from './units';

export interface Period {
  kind: PeriodKind;
  /** 開始日（含む） */
  start: string;
  /** 終了日（含む） */
  end: string;
}

/** 基準日を含む日・週（月曜始まり）・月の期間 */
export function periodFor(kind: PeriodKind, anchor: string): Period {
  if (kind === 'day') return { kind, start: anchor, end: anchor };
  if (kind === 'week') {
    const start = startOfWeek(anchor);
    return { kind, start, end: addDays(start, 6) };
  }
  const start = startOfMonth(anchor);
  const next = `${addMonths(start.slice(0, 7), 1)}-01`;
  return { kind, start, end: addDays(next, -1) };
}

/** 期間を前後にずらす */
export function shiftPeriod(p: Period, n: number): Period {
  if (p.kind === 'day') return periodFor('day', addDays(p.start, n));
  if (p.kind === 'week') return periodFor('week', addDays(p.start, n * 7));
  return periodFor('month', `${addMonths(p.start.slice(0, 7), n)}-01`);
}

export function inPeriod(date: string, p: Period): boolean {
  const d = dateToDay(date);
  return d >= dateToDay(p.start) && d <= dateToDay(p.end);
}

export interface CompareRow<K extends string> {
  key: K;
  /** 計画値（期間あたり） */
  planned: number;
  /** 実績値 */
  actual: number;
  /** 差 = 実績 − 計画 */
  diff: number;
  /** 計画に対する実績の割合（%）。計画が 0 なら null */
  ratio: number | null;
  /** この期間に記録があるか。記録がない項目は差を判断しない */
  recorded: boolean;
  count: number;
}

export interface TaskAccuracy {
  count: number;
  /** 見積もり時間の合計（h） */
  estimate: number;
  /** 実際の時間の合計（h） */
  actual: number;
  /** 差（h）= 実際 − 見積もり */
  diff: number;
  /** 実際 ÷ 見積もり（倍）。見積もり 0 なら null */
  ratio: number | null;
  /** 1件ごとの誤差率の平均（%）= 平均(|実際 − 見積もり| ÷ 見積もり) */
  meanAbsPctError: number | null;
  /** 見積もりの ±20% 以内に収まった割合（%） */
  withinTolerancePct: number | null;
  /** 傾向を示すのに十分な件数か（5件以上） */
  sufficient: boolean;
}

export interface PlanDeviation {
  period: Period;
  time: CompareRow<TimeCategoryKey>[];
  money: CompareRow<Exclude<ExpenseCategory, 'goal'>>[];
  /** 目標ごとの実績（時間は h、支出は円） */
  goals: { goalId: string; name: string; plannedHours: number; actualHours: number; spent: number; hasRecords: boolean }[];
  /** 目標の費用として記録した支出の合計（円） */
  goalSpending: number;
  tasks: TaskAccuracy;
  recordCount: number;
}

export const MIN_TASKS_FOR_TREND = 5;
const TOLERANCE = 0.2;

/** 作業の見積もり精度。単純な合計・平均だけで計算する */
export function calculateTaskAccuracy(tasks: TaskActual[]): TaskAccuracy {
  const valid = tasks.filter((t) => num(t.estimateHours) >= 0 && num(t.actualHours) >= 0);
  const estimate = round(valid.reduce((s, t) => s + num(t.estimateHours), 0), 4);
  const actual = round(valid.reduce((s, t) => s + num(t.actualHours), 0), 4);
  const withEstimate = valid.filter((t) => num(t.estimateHours) > 0);
  const errors = withEstimate.map((t) => Math.abs(num(t.actualHours) - num(t.estimateHours)) / num(t.estimateHours));
  return {
    count: valid.length,
    estimate,
    actual,
    diff: round(actual - estimate, 4),
    ratio: estimate > 0 ? actual / estimate : null,
    meanAbsPctError: errors.length ? (errors.reduce((s, e) => s + e, 0) / errors.length) * 100 : null,
    withinTolerancePct: errors.length ? (errors.filter((e) => e <= TOLERANCE + 1e-9).length / errors.length) * 100 : null,
    sufficient: valid.length >= MIN_TASKS_FOR_TREND,
  };
}

function row<K extends string>(key: K, planned: number, actual: number, count: number): CompareRow<K> {
  return {
    key,
    planned: round(planned, 4),
    actual: round(actual, 4),
    diff: round(actual - planned, 4),
    ratio: planned > 0 ? (actual / planned) * 100 : null,
    recorded: count > 0,
    count,
  };
}

/**
 * 期間内の計画と実績の差を計算する。
 *
 * 入力: 実績の記録、比較するシナリオ（通常は現在の計画）、目標、期間
 * 出力: 時間の項目別・支出の項目別・目標別の計画値と実績値、作業の見積もり精度
 * 前提:
 * - 計画値は週・月の値を期間に換算する（1年 = 12か月 = 52週 = 365日）。
 * - 記録がない項目は「0時間だった」とは見なさず、recorded = false として区別する。
 */
export function calculatePlanDeviation(
  records: ActualRecord[],
  scenario: Scenario,
  goals: Goal[],
  period: Period,
): PlanDeviation {
  const inside = records.filter((r) => inPeriod(r.date, period));
  const time = calculateWeeklyTimeBudget(scenario.time);

  const timeRows = TIME_CATEGORY_KEYS.map((key) => {
    const recs = inside.filter((r) => r.type === 'time' && r.category === key);
    const actual = recs.reduce((s, r) => s + (r.type === 'time' ? Math.max(0, num(r.hours)) : 0), 0);
    const weekly = time.items.find((i) => i.key === key)?.weeklyHours ?? 0;
    return row(key, weeklyToPeriod(weekly, period.kind), actual, recs.length);
  });

  const moneyRows = (['fixed', 'variable'] as const).map((key) => {
    const recs = inside.filter((r) => r.type === 'expense' && r.expenseCategory === key);
    const actual = recs.reduce((s, r) => s + (r.type === 'expense' ? Math.max(0, num(r.amount)) : 0), 0);
    const monthly = key === 'fixed' ? scenario.finance.fixedCosts : scenario.finance.variableCosts;
    return row(key, monthlyToPeriod(Math.max(0, num(monthly)), period.kind), actual, recs.length);
  });

  const goalSpending = inside.reduce(
    (s, r) => s + (r.type === 'expense' && r.expenseCategory === 'goal' ? Math.max(0, num(r.amount)) : 0),
    0,
  );

  const goalRows = goals.map((g) => {
    const recs = inside.filter((r) => r.goalId === g.id);
    const actualHours =
      recs.reduce((s, r) => s + (r.type === 'time' ? num(r.hours) : r.type === 'task' ? num(r.actualHours) : 0), 0);
    const spent = recs.reduce((s, r) => s + (r.type === 'expense' ? num(r.amount) : 0), 0);
    const plan = scenario.goalPlans[g.id];
    const plannedHours = plan?.included ? weeklyToPeriod(Math.max(0, num(plan.weeklyHours)), period.kind) : 0;
    return {
      goalId: g.id,
      name: g.name,
      plannedHours: round(plannedHours, 4),
      actualHours: round(actualHours, 4),
      spent,
      hasRecords: recs.length > 0,
    };
  });

  return {
    period,
    time: timeRows,
    money: moneyRows,
    goals: goalRows,
    goalSpending,
    tasks: calculateTaskAccuracy(inside.filter((r): r is TaskActual => r.type === 'task')),
    recordCount: inside.length,
  };
}

export type SeriesMetric = { kind: 'time'; category: TimeCategoryKey | 'all' } | { kind: 'expense' };

export interface SeriesPoint {
  period: Period;
  value: number;
  count: number;
}

/** 直近 count 期間ぶんの集計値（古い順） */
export function aggregateSeries(
  records: ActualRecord[],
  kind: PeriodKind,
  anchor: string,
  count: number,
  metric: SeriesMetric,
): SeriesPoint[] {
  const last = periodFor(kind, anchor);
  const out: SeriesPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const p = shiftPeriod(last, -i);
    let value = 0;
    let n = 0;
    for (const r of records) {
      if (!inPeriod(r.date, p)) continue;
      if (metric.kind === 'time' && r.type === 'time' && (metric.category === 'all' || r.category === metric.category)) {
        value += num(r.hours);
        n++;
      } else if (metric.kind === 'expense' && r.type === 'expense') {
        value += num(r.amount);
        n++;
      }
    }
    out.push({ period: p, value: round(value, 4), count: n });
  }
  return out;
}

export interface TrendSummary {
  /** 比較に十分なデータがあるか */
  sufficient: boolean;
  /** 記録がある期間の数 */
  periodsWithData: number;
  /** 必要な期間の数 */
  required: number;
  /** 記録がある期間の平均 */
  average: number | null;
  /** 後半のうち記録がある期間の平均 */
  recentAverage: number | null;
  /** 前半のうち記録がある期間の平均 */
  earlierAverage: number | null;
  /** 後半 ÷ 前半 − 1（%）。前半が 0 なら null */
  changePct: number | null;
}

/**
 * 単純な平均で傾向を要約する。
 * 記録のない期間は「0だった」とは見なさず、平均に含めない。
 * 前半・後半それぞれに記録のある期間が minPerHalf 以上ない場合は、傾向を示さない。
 * 前半と後半の平均を並べるだけで、予測や断定はしない。
 */
export function summarizeTrend(series: SeriesPoint[], minPerHalf = 2): TrendSummary {
  const withData = series.filter((p) => p.count > 0);
  const half = Math.floor(series.length / 2);
  const earlier = series.slice(0, half).filter((p) => p.count > 0);
  const recent = series.slice(series.length - half).filter((p) => p.count > 0);
  const avg = (xs: SeriesPoint[]) => (xs.length ? xs.reduce((s, p) => s + p.value, 0) / xs.length : null);
  const sufficient = earlier.length >= minPerHalf && recent.length >= minPerHalf;
  const e = avg(earlier);
  const r = avg(recent);
  return {
    sufficient,
    periodsWithData: withData.length,
    required: minPerHalf * 2,
    average: avg(withData),
    recentAverage: sufficient ? r : null,
    earlierAverage: sufficient ? e : null,
    changePct: sufficient && e !== null && r !== null && e > 0 ? (r / e - 1) * 100 : null,
  };
}
