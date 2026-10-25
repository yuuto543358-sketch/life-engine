import type { ActualRecord } from '../data/types';
import { EXPENSE_LABELS, TIME_LABELS } from '../engine';
import { fmtH, fmtYen } from './format';
import { Bullet, CAT_COLOR } from './viz';

export const MONEY_COLORS = {
  fixed: 'var(--c-sleep)',
  variable: 'var(--c-work)',
  savings: 'var(--c-commute)',
  goals: 'var(--c-housework)',
};

/** 計画（目印）と実績（帯）を比べる1行 */
export function DevRow({ label, color, planned, actual, format, diff }: { label: string; color: string; planned: number; actual: number; format: (v: number) => string; diff: string }) {
  return (
    <div className="dev-row">
      <div className="dev-row-top">
        <span className="dev-label">
          <span className="swatch" style={{ background: color }} />
          {label}
        </span>
        <span className="dev-values num">
          {format(actual)} <span className="muted">/ 計画 {format(planned)}</span>
        </span>
      </div>
      <Bullet planned={planned} actual={actual} color={color} />
      <span className="dev-diff num">差 {diff}</span>
    </div>
  );
}

/** 記録の表示用の題・値・色 */
export function describeRecord(a: ActualRecord, goalName: (id: string | null) => string | null, compact: boolean): { title: string; value: string; color: string } {
  const g = goalName(a.goalId);
  switch (a.type) {
    case 'time':
      return { title: `${TIME_LABELS[a.category]}${g ? `・${g}` : ''}`, value: `${fmtH(a.hours, 2)}h`, color: CAT_COLOR[a.category] };
    case 'expense':
      return { title: `${EXPENSE_LABELS[a.expenseCategory]}${g ? `・${g}` : ''}${a.memo ? `・${a.memo}` : ''}`, value: fmtYen(a.amount, compact), color: MONEY_COLORS.variable };
    case 'task':
      return { title: `作業: ${a.title || '名前なし'}`, value: `${fmtH(a.actualHours, 2)}h / 見積 ${fmtH(a.estimateHours, 2)}h`, color: 'var(--ink-3)' };
    case 'progress':
      return { title: `進捗: ${g ?? '目標なし'}`, value: `${a.progress}%`, color: 'var(--c-study)' };
  }
}
