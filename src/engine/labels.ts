import type { ExpenseCategory, TimeCategoryKey, TimeSource } from '../data/types';

export const TIME_LABELS: Record<TimeCategoryKey, string> = {
  sleep: '睡眠',
  work: '仕事',
  commute: '通勤',
  housework: '家事',
  study: '勉強',
  hobby: '趣味',
  other: 'その他',
};

export const TIME_SOURCE_LABELS: Record<TimeSource, string> = {
  ...TIME_LABELS,
  free: '自由時間',
};

export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  fixed: '固定費',
  variable: '変動費',
  goal: '目標の費用',
};
