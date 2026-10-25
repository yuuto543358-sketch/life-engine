/**
 * 単位換算と日付の共通ルール。
 * すべての計算はここで定めた換算だけを使い、画面ごとに独自の換算をしない。
 *
 * - 1週間 = 7日
 * - 1年 = 12か月 = 52週 = 365日
 * - 週 → 月の換算: × 52 / 12（約 4.33）
 * - 月 → 週の換算: × 12 / 52
 * - 月 → 日の換算: × 12 / 365
 */

export const DAYS_PER_WEEK = 7;
export const HOURS_PER_DAY = 24;
export const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK; // 168
export const MONTHS_PER_YEAR = 12;
export const WEEKS_PER_YEAR = 52;
export const DAYS_PER_YEAR = 365;
export const WEEKS_PER_MONTH = WEEKS_PER_YEAR / MONTHS_PER_YEAR;

export type PeriodKind = 'day' | 'week' | 'month';

/** 週あたりの量を、指定した期間あたりの量に換算する */
export function weeklyToPeriod(perWeek: number, period: PeriodKind): number {
  if (period === 'day') return perWeek / DAYS_PER_WEEK;
  if (period === 'week') return perWeek;
  return (perWeek * WEEKS_PER_YEAR) / MONTHS_PER_YEAR;
}

/** 月あたりの量を、指定した期間あたりの量に換算する */
export function monthlyToPeriod(perMonth: number, period: PeriodKind): number {
  if (period === 'day') return (perMonth * MONTHS_PER_YEAR) / DAYS_PER_YEAR;
  if (period === 'week') return (perMonth * MONTHS_PER_YEAR) / WEEKS_PER_YEAR;
  return perMonth;
}

/** 有限の数でなければ fallback を返す */
export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 範囲に収める（NaN は min 扱い） */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 小数の誤差をならす（表示・比較用） */
export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

// ---------- 日付（ローカル日付の文字列で扱う） ----------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function isValidMonth(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = MONTH_RE.exec(s);
  return !!m && +m[2] >= 1 && +m[2] <= 12;
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Date をローカル日付 "YYYY-MM-DD" に */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 日付文字列を日数（エポック日）に。計算はすべて UTC で行い、時差の影響を受けない */
export function dateToDay(s: string): number {
  const m = DATE_RE.exec(s);
  if (!m) return NaN;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

export function dayToDate(day: number): string {
  const d = new Date(day * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function addDays(s: string, n: number): string {
  return dayToDate(dateToDay(s) + n);
}

export function daysBetween(from: string, to: string): number {
  return dateToDay(to) - dateToDay(from);
}

/** "YYYY-MM" を通し月番号（年×12 + 月-1）に */
export function monthIndex(ym: string): number {
  const m = MONTH_RE.exec(ym.slice(0, 7));
  if (!m) return NaN;
  return +m[1] * 12 + (+m[2] - 1);
}

export function monthFromIndex(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function addMonths(ym: string, n: number): string {
  return monthFromIndex(monthIndex(ym) + n);
}

/**
 * 今月から期限の月までに、月末が何回来るか（今月と期限の月を含む）。
 * 例: 今日 2026-10-25、期限 2026-12 → 10月・11月・12月 = 3。期限が過去なら 0 以下。
 */
export function monthsUntilInclusive(todayDate: string, targetYm: string): number {
  return monthIndex(targetYm) - monthIndex(todayDate) + 1;
}

/** 週の始まり（月曜日）の日付 */
export function startOfWeek(s: string): string {
  const day = dateToDay(s);
  // 1970-01-01 は木曜日。月曜=0 になるように調整
  const dow = (((day + 3) % 7) + 7) % 7;
  return dayToDate(day - dow);
}

export function startOfMonth(s: string): string {
  return `${s.slice(0, 7)}-01`;
}
