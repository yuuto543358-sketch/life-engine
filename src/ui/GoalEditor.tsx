import { useState } from 'react';
import { newId, nowIso, useStore } from '../data/store';
import { defaultGoalPlan } from '../data/defaults';
import { TIME_CATEGORY_KEYS, type AppData, type ChronicleEntry, type Goal, type GoalKind, type GoalPlan, type TimeSource } from '../data/types';
import { TIME_SOURCE_LABELS, bonusSavingsRate, calculateMoneyGoalNeed, isBonusItem, isValidDate, moneyGoalNeeds } from '../engine';
import { fmtMonth, fmtYen } from './format';
import { Disclosure, NumberField, Segmented, SelectField, Sheet, StatusTag, Stepper, TextField, Toggle } from './controls';

export const TIME_SOURCE_OPTIONS: { value: TimeSource; label: string }[] = [
  { value: 'free', label: '自由時間から' },
  ...TIME_CATEGORY_KEYS.filter((k) => !['sleep', 'commute'].includes(k)).map((k) => ({ value: k as TimeSource, label: `${TIME_SOURCE_LABELS[k]}の時間から` })),
];

/**
 * お金の目標の「毎月いくら貯める必要があるか」をその場で表示する。
 * ボーナスを登録していれば、ほかの目標との優先順位も考えて「ボーナスで貯める額」と「それ以外に毎月貯める額」に分ける。
 */
export function MoneyNeedPreview({ target, deadline, saved, goal, plan, scenarioId }: { target: number; deadline: string; saved: number; goal?: Goal; plan?: GoalPlan; scenarioId?: string }) {
  const { today, data, current } = useStore();
  const compact = data.settings.compactMoney;
  let n = calculateMoneyGoalNeed(target, deadline, saved, today);
  const scenario = data.scenarios.find((s) => s.id === scenarioId) ?? current;
  const hasBonus = scenario.finance.oneOffs.some(isBonusItem) && bonusSavingsRate(scenario.finance) > 0;
  if (goal && plan) {
    const draft: Goal = { ...goal, kind: 'money', savedAmount: saved };
    const goals = [...data.goals.filter((g) => g.id !== goal.id), draft];
    const temp = { ...scenario, goalPlans: { ...scenario.goalPlans, [goal.id]: { ...plan, budget: target, deadline, included: true } } };
    n = moneyGoalNeeds(temp, goals, today).get(goal.id) ?? n;
  }
  return (
    <div className="need-preview" aria-live="polite">
      {n.status === 'ok' && n.fromBonus > 0 && (
        <>
          <p className="need-label">目標日までに貯める額の内訳</p>
          <div className="need-split">
            <div>
              <p className="need-sub-label">ボーナスで</p>
              <p className="need-value num">
                {fmtYen(n.fromBonus, compact)}
                <span className="unit">（{n.bonusUses.length}回）</span>
              </p>
            </div>
            {(n.monthlyNeed ?? 0) > 0 ? (
              <>
                <span className="need-plus" aria-hidden="true">
                  ＋
                </span>
                <div>
                  <p className="need-sub-label">それ以外に毎月</p>
                  <p className="need-value num">
                    {fmtYen(n.monthlyNeed ?? 0)}
                    <span className="unit">/月</span>
                  </p>
                </div>
              </>
            ) : (
              <p className="need-sub-label">ボーナスだけで間に合います（毎月の積み立ては 0円）</p>
            )}
          </div>
          <p className="need-formula num">
            ボーナス: {n.bonusUses.map((u) => `${fmtMonth(u.month)} ${fmtYen(u.amount, compact)}`).join('・')}
          </p>
          <p className="need-formula num">
            毎月: （{fmtYen(n.target, compact)} − 貯まっている {fmtYen(n.saved, compact)} − ボーナス {fmtYen(n.fromBonus, compact)}）÷ {n.months}か月（今月〜{fmtMonth(deadline.slice(0, 7))}）
          </p>
        </>
      )}
      {n.status === 'ok' && n.fromBonus === 0 && (
        <>
          <p className="need-label">目標日までに毎月貯める額</p>
          <p className="need-value num">
            {fmtYen(n.monthlyNeed ?? 0)}
            <span className="unit">/月</span>
          </p>
          <p className="need-formula num">
            （{fmtYen(n.target, compact)} − 貯まっている {fmtYen(n.saved, compact)}）÷ {n.months}か月（今月〜{fmtMonth(deadline.slice(0, 7))}）
          </p>
          {hasBonus && goal && (
            <p className="need-formula">目標日までのボーナスは、優先順位が上の目標に使われています。この目標を先に貯めたいときは、優先順位を上げてください。</p>
          )}
          {!hasBonus && <p className="need-formula">ボーナスを「蓄え・お金」の臨時収入に登録すると、ボーナスで貯める分も計算します。</p>}
        </>
      )}
      {n.status === 'done' && <StatusTag tone="good">目標金額に達しています</StatusTag>}
      {n.status === 'no-target' && <p className="small muted">目標金額を入れると、毎月いくら貯めればよいかを計算します。</p>}
      {n.status === 'no-date' && <p className="small muted">目標日を入れると、毎月いくら貯めればよいかを計算します。</p>}
      {n.status === 'passed' && <StatusTag tone="warn">目標日が過ぎています。未来の日付にしてください</StatusTag>}
    </div>
  );
}

/** 目標の計画値（シナリオごと）の入力欄 */
export function GoalPlanFields({ plan, onChange, kind = 'general', saved = 0, goal, scenarioId }: { plan: GoalPlan; onChange: (p: Partial<GoalPlan>) => void; kind?: GoalKind; saved?: number; goal?: Goal; scenarioId?: string }) {
  const priority = (
    <div className="field">
      <span className="field-label">優先順位（1 が最優先）</span>
      <div className="field-row">
        <Stepper label="優先順位" value={plan.priority} min={1} max={9} onChange={(priority) => onChange({ priority })} format={(v) => `${v}位`} />
        <span className="field-hint">時間とお金は、この順番で割り当てて検証します。順番はあなたが決めます。</span>
      </div>
    </div>
  );
  const time = (
    <>
      <NumberField label="必要な週間時間" value={plan.weeklyHours} onChange={(weeklyHours) => onChange({ weeklyHours })} min={0} max={168} step={0.5} unit="時間/週" slider={{ min: 0, max: 30, step: 0.5 }} color="var(--c-study)" />
      <SelectField label="時間をどこから使うか" value={plan.timeSource} onChange={(timeSource) => onChange({ timeSource })} options={TIME_SOURCE_OPTIONS} />
    </>
  );
  if (kind === 'money') {
    return (
      <div className="stack-m">
        <NumberField label="目標金額" value={plan.budget} onChange={(budget) => onChange({ budget })} min={0} max={1e11} step={1000} unit="円" slider={{ min: 0, max: 5000000, step: 10000 }} color="var(--c-commute)" />
        <TextField label="目標日（いつまでに）" type="date" value={plan.deadline} onChange={(v) => onChange({ deadline: v === '' || isValidDate(v) ? v : plan.deadline })} />
        <MoneyNeedPreview target={plan.budget} deadline={plan.deadline} saved={saved} goal={goal} plan={plan} scenarioId={scenarioId} />
        {priority}
        <Disclosure summary={plan.weeklyHours > 0 ? `時間も使う（週${plan.weeklyHours}時間）` : '時間も必要な場合'}>
          <div className="stack-m">{time}</div>
        </Disclosure>
      </div>
    );
  }
  return (
    <div className="stack-m">
      {time}
      <NumberField label="必要な予算（総額）" value={plan.budget} onChange={(budget) => onChange({ budget })} min={0} max={1e11} step={1000} unit="円" slider={{ min: 0, max: 1000000, step: 5000 }} color="var(--c-housework)" hint="期限までの月数で割った額を、毎月の貯金後の残りから確保する計算です" />
      <TextField label="期限" type="date" value={plan.deadline} onChange={(v) => onChange({ deadline: v === '' || isValidDate(v) ? v : plan.deadline })} />
      {priority}
    </div>
  );
}

/** 目標そのものの情報（全シナリオ共通）の入力欄 */
export function GoalInfoFields({ goal, onChange, target }: { goal: Goal; onChange: (g: Partial<Goal>) => void; target?: number }) {
  const { data } = useStore();
  const isMoney = goal.kind === 'money';
  return (
    <div className="stack-m">
      <TextField label="目標名" value={goal.name} onChange={(name) => onChange({ name })} required maxLength={60} placeholder={isMoney ? '例: 車の頭金・旅行資金・生活防衛資金' : '例: 資格を取る'} />
      {isMoney && (
        <div className="field">
          <span className="field-label">お金の使い道</span>
          <Segmented
            label="お金の使い道"
            options={[
              { value: 'save', label: '貯めておく' },
              { value: 'buy', label: '買う・使う' },
            ]}
            value={goal.moneyPurpose ?? 'save'}
            onChange={(moneyPurpose) => onChange({ moneyPurpose })}
          />
        </div>
      )}
      <SelectField
        label="人生の領域"
        value={goal.domainId ?? ''}
        onChange={(v) => onChange({ domainId: v || null })}
        options={[{ value: '', label: '未分類' }, ...data.domains.map((d) => ({ value: d.id, label: d.name }))]}
      />
      {isMoney ? (
        <NumberField
          label="今、この目標のために貯まっている額"
          value={goal.savedAmount ?? 0}
          onChange={(savedAmount) => onChange({ savedAmount, progress: target && target > 0 ? Math.min(100, Math.round((savedAmount / target) * 100)) : goal.progress })}
          min={0}
          max={1e11}
          step={1000}
          unit="円"
          slider={false}
          hint="進捗は「貯まっている額 ÷ 目標金額」で自動で計算します"
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

/** 新しい目標を作る。作成した目標は指定したシナリオに計画値付きで追加する */
export function NewGoalSheet({ open, onClose, scenarioId, domainId, onCreated, initialKind = 'general' }: { open: boolean; onClose: () => void; scenarioId: string; domainId?: string | null; onCreated?: (id: string) => void; initialKind?: GoalKind }) {
  const { update, data } = useStore();
  const [goal, setGoal] = useState<Goal>(() => blankGoal(domainId ?? null, initialKind, data));
  const [plan, setPlan] = useState<GoalPlan>(() => defaultGoalPlan(nextPriority(data, scenarioId)));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGoal(blankGoal(domainId ?? null, initialKind, data));
      setPlan(defaultGoalPlan(nextPriority(data, scenarioId)));
    }
  }
  const kind = goal.kind ?? 'general';
  const valid = goal.name.trim() !== '' && (kind !== 'money' || plan.budget > 0);
  const scenarioName = data.scenarios.find((s) => s.id === scenarioId)?.name ?? '';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="開拓計画（目標）を立てる"
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!valid}
          onClick={() => {
            const now = nowIso();
            const saved = goal.savedAmount ?? 0;
            const g: Goal = {
              ...goal,
              name: goal.name.trim(),
              createdAt: now,
              updatedAt: now,
              ...(kind === 'money' ? { progress: plan.budget > 0 ? Math.min(100, Math.round((saved / plan.budget) * 100)) : 0, moneyPurpose: goal.moneyPurpose ?? 'save' } : {}),
            };
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
        <div className="field">
          <span className="field-label">目標の種類</span>
          <Segmented
            label="目標の種類"
            options={[
              { value: 'general', label: '時間をかける目標' },
              { value: 'money', label: 'お金を貯める・買う' },
            ]}
            value={kind}
            onChange={(k) => setGoal({ ...goal, kind: k, domainId: k === 'money' && !goal.domainId ? moneyDomain(data) : goal.domainId })}
          />
          <span className="field-hint">{kind === 'money' ? '例: 旅行資金・車の購入・引っ越し費用・生活防衛資金。毎月の貯金から積み立てる計算です' : '例: 資格の勉強・ダイエット・転職活動。必要な時間と予算を登録します'}</span>
        </div>
        <GoalInfoFields goal={goal} onChange={(p) => setGoal({ ...goal, ...p })} target={plan.budget} />
        <div>
          <h3 className="subhead">「{scenarioName}」での計画</h3>
          <GoalPlanFields plan={plan} onChange={(p) => setPlan({ ...plan, ...p })} kind={kind} saved={goal.savedAmount ?? 0} goal={goal} scenarioId={scenarioId} />
        </div>
      </div>
    </Sheet>
  );
}

function moneyDomain(d: AppData): string | null {
  return d.domains.find((x) => x.id === 'd-money')?.id ?? null;
}

function blankGoal(domainId: string | null, kind: GoalKind, d: AppData): Goal {
  const now = nowIso();
  const base: Goal = { id: newId('g-'), name: '', kind, domainId, completionCriteria: '', progress: 0, totalHours: null, note: '', createdAt: now, updatedAt: now };
  return kind === 'money' ? { ...base, moneyPurpose: 'save', savedAmount: 0, domainId: domainId ?? moneyDomain(d) } : base;
}

function nextPriority(d: AppData, scenarioId: string): number {
  const s = d.scenarios.find((x) => x.id === scenarioId);
  const ps = Object.values(s?.goalPlans ?? {}).map((p) => p.priority);
  return Math.min(9, (ps.length ? Math.max(...ps) : 0) + 1);
}

/**
 * 目標を削除する（全シナリオの計画値・つながりも取り除き、実績は目標なしとして残す）。
 * 記憶の法則: 達成済みの目標は、節目がまだ年代記になければ記念碑として残す。
 */
export function deleteGoal(d: AppData, goalId: string): AppData {
  const goal = d.goals.find((g) => g.id === goalId);
  const hasMilestone = d.chronicle.some((c) => c.kind === 'milestone' && c.goalId === goalId);
  const now = nowIso();
  const keep: ChronicleEntry[] =
    goal && goal.completedAt && !hasMilestone
      ? [{ id: newId('c-'), kind: 'milestone', date: goal.completedAt, title: `${goal.name}を達成`, body: '', photos: [], goalId: null, createdAt: now, updatedAt: now }]
      : [];
  return {
    ...d,
    chronicle: [...d.chronicle.map((c) => (c.goalId === goalId ? { ...c, goalId: null, title: c.title || goal?.name || '' } : c)), ...keep],
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
