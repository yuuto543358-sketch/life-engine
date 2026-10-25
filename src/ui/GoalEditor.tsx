import { useState } from 'react';
import { newId, nowIso, useStore } from '../data/store';
import { defaultGoalPlan } from '../data/defaults';
import { TIME_CATEGORY_KEYS, type AppData, type Goal, type GoalPlan, type TimeSource } from '../data/types';
import { TIME_SOURCE_LABELS, isValidDate } from '../engine';
import { NumberField, SelectField, Sheet, Stepper, TextField, Toggle } from './controls';

export const TIME_SOURCE_OPTIONS: { value: TimeSource; label: string }[] = [
  { value: 'free', label: '自由時間から' },
  ...TIME_CATEGORY_KEYS.filter((k) => !['sleep', 'commute'].includes(k)).map((k) => ({ value: k as TimeSource, label: `${TIME_SOURCE_LABELS[k]}の時間から` })),
];

/** 目標の計画値（シナリオごと）の入力欄 */
export function GoalPlanFields({ plan, onChange }: { plan: GoalPlan; onChange: (p: Partial<GoalPlan>) => void }) {
  return (
    <div className="stack-m">
      <NumberField label="必要な週間時間" value={plan.weeklyHours} onChange={(weeklyHours) => onChange({ weeklyHours })} min={0} max={168} step={0.5} unit="時間/週" slider={{ min: 0, max: 30, step: 0.5 }} color="var(--c-study)" />
      <SelectField label="時間をどこから使うか" value={plan.timeSource} onChange={(timeSource) => onChange({ timeSource })} options={TIME_SOURCE_OPTIONS} />
      <NumberField label="必要な予算（総額）" value={plan.budget} onChange={(budget) => onChange({ budget })} min={0} max={1e11} step={1000} unit="円" slider={{ min: 0, max: 1000000, step: 5000 }} color="var(--c-housework)" hint="期限までの月数で割った額を、毎月の貯金後の残りから確保する計算です" />
      <TextField label="期限" type="date" value={plan.deadline} onChange={(v) => onChange({ deadline: v === '' || isValidDate(v) ? v : plan.deadline })} />
      <div className="field">
        <span className="field-label">優先順位（1 が最優先）</span>
        <div className="field-row">
          <Stepper label="優先順位" value={plan.priority} min={1} max={9} onChange={(priority) => onChange({ priority })} format={(v) => `${v}位`} />
          <span className="field-hint">時間と予算は、この順番で割り当てて検証します。順番はあなたが決めます。</span>
        </div>
      </div>
    </div>
  );
}

/** 目標そのものの情報（全シナリオ共通）の入力欄 */
export function GoalInfoFields({ goal, onChange }: { goal: Goal; onChange: (g: Partial<Goal>) => void }) {
  const { data } = useStore();
  return (
    <div className="stack-m">
      <TextField label="目標名" value={goal.name} onChange={(name) => onChange({ name })} required maxLength={60} placeholder="例: 資格を取る" />
      <SelectField
        label="人生の領域"
        value={goal.domainId ?? ''}
        onChange={(v) => onChange({ domainId: v || null })}
        options={[{ value: '', label: '未分類' }, ...data.domains.map((d) => ({ value: d.id, label: d.name }))]}
      />
      <TextField label="完了条件" value={goal.completionCriteria} onChange={(completionCriteria) => onChange({ completionCriteria })} placeholder="例: 試験に合格する" maxLength={120} />
      <NumberField label="現在の進捗" value={goal.progress} onChange={(progress) => onChange({ progress })} min={0} max={100} step={1} unit="%" slider={{ min: 0, max: 100, step: 5 }} />
      <Toggle
        label="完了までの総時間を設定する"
        hint="設定すると、今の週間時間で期限に間に合うかを計算します"
        checked={goal.totalHours !== null}
        onChange={(on) => onChange({ totalHours: on ? 50 : null })}
      />
      {goal.totalHours !== null && (
        <NumberField label="完了までの総時間" value={goal.totalHours} onChange={(totalHours) => onChange({ totalHours })} min={0} max={100000} step={1} unit="時間" slider={{ min: 0, max: 500, step: 5 }} hint="進捗を考慮し、残り = 総時間 ×（100% − 進捗）で計算します" />
      )}
    </div>
  );
}

/** 新しい目標を作る。作成した目標は指定したシナリオに計画値付きで追加する */
export function NewGoalSheet({ open, onClose, scenarioId, domainId, onCreated }: { open: boolean; onClose: () => void; scenarioId: string; domainId?: string | null; onCreated?: (id: string) => void }) {
  const { update, data } = useStore();
  const [goal, setGoal] = useState<Goal>(() => blankGoal(domainId ?? null));
  const [plan, setPlan] = useState<GoalPlan>(() => defaultGoalPlan(nextPriority(data, scenarioId)));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGoal(blankGoal(domainId ?? null));
      setPlan(defaultGoalPlan(nextPriority(data, scenarioId)));
    }
  }
  const valid = goal.name.trim() !== '';
  const scenarioName = data.scenarios.find((s) => s.id === scenarioId)?.name ?? '';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="目標を追加"
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!valid}
          onClick={() => {
            const now = nowIso();
            const g = { ...goal, name: goal.name.trim(), createdAt: now, updatedAt: now };
            update(
              (d) => ({
                ...d,
                goals: [...d.goals, g],
                scenarios: d.scenarios.map((s) => (s.id === scenarioId ? { ...s, goalPlans: { ...s.goalPlans, [g.id]: plan }, updatedAt: now } : s)),
              }),
              { success: `目標「${g.name}」を追加しました` },
            );
            onCreated?.(g.id);
            onClose();
          }}
        >
          追加する
        </button>
      }
    >
      <div className="stack-l">
        <GoalInfoFields goal={goal} onChange={(p) => setGoal({ ...goal, ...p })} />
        <div>
          <h3 className="subhead">「{scenarioName}」での計画</h3>
          <GoalPlanFields plan={plan} onChange={(p) => setPlan({ ...plan, ...p })} />
        </div>
      </div>
    </Sheet>
  );
}

function blankGoal(domainId: string | null): Goal {
  const now = nowIso();
  return { id: newId('g-'), name: '', domainId, completionCriteria: '', progress: 0, totalHours: null, note: '', createdAt: now, updatedAt: now };
}

function nextPriority(d: AppData, scenarioId: string): number {
  const s = d.scenarios.find((x) => x.id === scenarioId);
  const ps = Object.values(s?.goalPlans ?? {}).map((p) => p.priority);
  return Math.min(9, (ps.length ? Math.max(...ps) : 0) + 1);
}

/** 目標を削除する（全シナリオの計画値・つながりも取り除き、実績は目標なしとして残す） */
export function deleteGoal(d: AppData, goalId: string): AppData {
  return {
    ...d,
    goals: d.goals.filter((g) => g.id !== goalId),
    scenarios: d.scenarios.map((s) => {
      if (!(goalId in s.goalPlans)) return s;
      const goalPlans = { ...s.goalPlans };
      delete goalPlans[goalId];
      return { ...s, goalPlans };
    }),
    dependencies: d.dependencies.filter((x) => !(x.from.kind === 'goal' && x.from.id === goalId) && !(x.to.kind === 'goal' && x.to.id === goalId)),
    actuals: d.actuals.map((a) => (a.goalId === goalId ? { ...a, goalId: null } : a)),
  };
}
