import { TIME_CATEGORY_KEYS, type TimeBudget, type TimeCategoryKey } from '../data/types';
import { HOURS_PER_DAY, HOURS_PER_WEEK, DAYS_PER_WEEK, num, round } from './units';

export interface TimeIssue {
  field: TimeCategoryKey | 'totalHours';
  message: string;
}

export interface TimeItemResult {
  key: TimeCategoryKey;
  hoursPerDay: number;
  daysPerWeek: number;
  /** 週間時間（h/週）= hoursPerDay × daysPerWeek */
  weeklyHours: number;
}

export interface WeeklyTimeBudgetResult {
  /** 1週間の総時間（h/週） */
  totalHours: number;
  items: TimeItemResult[];
  /** 配分済みの時間（h/週）= 各項目の週間時間の合計 */
  allocatedHours: number;
  /** 自由に配分できる時間（h/週）= 総時間 − 配分済み。マイナスは時間不足 */
  freeHours: number;
  /** 不足している時間（h/週）。不足がなければ 0 */
  shortageHours: number;
  /** 入力の問題（計算には補正した値を使う） */
  issues: TimeIssue[];
}

/**
 * 週の時間配分を計算する。
 *
 * 入力: TimeBudget（各項目は h/日 と 日/週）
 * 出力: 項目ごとの週間時間と、配分済み・自由時間・不足（すべて h/週）
 * 前提:
 * - 各項目は重ならない（同じ時間を2つの項目に数えない）。
 * - 1日あたり時間は 0〜24、日数は 0〜7 の整数に補正し、補正した場合は issues に記録する。
 * - 総時間は 0〜168 に補正する。
 */
export function calculateWeeklyTimeBudget(budget: TimeBudget): WeeklyTimeBudgetResult {
  const issues: TimeIssue[] = [];
  let totalHours = num(budget?.totalHours, HOURS_PER_WEEK);
  if (totalHours < 0 || totalHours > HOURS_PER_WEEK) {
    issues.push({ field: 'totalHours', message: `総時間は 0〜${HOURS_PER_WEEK} 時間で入力してください` });
    totalHours = Math.min(HOURS_PER_WEEK, Math.max(0, totalHours));
  }

  const items: TimeItemResult[] = TIME_CATEGORY_KEYS.map((key) => {
    const raw = budget?.items?.[key];
    let h = num(raw?.hoursPerDay, 0);
    let d = num(raw?.daysPerWeek, 0);
    if (h < 0 || h > HOURS_PER_DAY) {
      issues.push({ field: key, message: '1日あたりの時間は 0〜24 時間で入力してください' });
      h = Math.min(HOURS_PER_DAY, Math.max(0, h));
    }
    if (d < 0 || d > DAYS_PER_WEEK || !Number.isInteger(d)) {
      issues.push({ field: key, message: '日数は 0〜7 の整数で入力してください' });
      d = Math.round(Math.min(DAYS_PER_WEEK, Math.max(0, d)));
    }
    return { key, hoursPerDay: h, daysPerWeek: d, weeklyHours: round(h * d, 4) };
  });

  const allocatedHours = round(items.reduce((s, i) => s + i.weeklyHours, 0), 4);
  const freeHours = round(totalHours - allocatedHours, 4);
  return {
    totalHours,
    items,
    allocatedHours,
    freeHours,
    shortageHours: freeHours < 0 ? -freeHours : 0,
    issues,
  };
}

export function weeklyHoursOf(result: WeeklyTimeBudgetResult, key: TimeCategoryKey): number {
  return result.items.find((i) => i.key === key)?.weeklyHours ?? 0;
}
