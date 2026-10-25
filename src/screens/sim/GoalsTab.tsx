import { useState } from 'react';
import { nowIso, useStore } from '../../data/store';
import { defaultGoalPlan } from '../../data/defaults';
import type { Goal, GoalPlan, Scenario } from '../../data/types';
import { TIME_SOURCE_LABELS, type GoalFeasibility } from '../../engine';
import { ConfirmSheet, Empty, Meter, StatusTag, Toggle, type Tone } from '../../ui/controls';
import { fmtDate, fmtDays, fmtH, fmtYen } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { GoalInfoFields, GoalPlanFields, NewGoalSheet, deleteGoal } from '../../ui/GoalEditor';
import { useScenarioModel } from '../../ui/model';
import type { EditScenario } from '../Simulator';

export function GoalsTab({ scenario, edit }: { scenario: Scenario; edit: EditScenario }) {
  const { data } = useStore();
  const compact = data.settings.compactMoney;
  const { feasibility: f } = useScenarioModel(scenario);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const goalById = new Map(data.goals.map((g) => [g.id, g]));
  const excluded = data.goals.filter((g) => scenario.goalPlans[g.id] && !scenario.goalPlans[g.id].included);
  const notAdded = data.goals.filter((g) => !scenario.goalPlans[g.id]);
  const nameOf = (id: string) => goalById.get(id)?.name ?? '';
  const timeAvail = Math.max(0, f.time.freeHours) + f.goals.reduce((s, g) => s + g.fromCategory, 0);

  if (data.goals.length === 0) {
    return (
      <>
        <Empty
          icon="target"
          title="目標がまだありません"
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} /> 目標を追加
            </button>
          }
        >
          目標に必要な時間と予算を登録すると、今の時間配分とお金の計画で両立できるかを検証します。
        </Empty>
        <NewGoalSheet open={adding} onClose={() => setAdding(false)} scenarioId={scenario.id} />
      </>
    );
  }

  return (
    <div className="stack-l">
      <section className="panel" aria-label="目標の両立チェック">
        <p className="hero-label">目標の両立チェック</p>
        {f.conflicts.length === 0 ? (
          <div className="callout callout-good">
            <Icon name="check" size={18} />
            <p>{f.activeCount > 0 ? `計画に含めた${f.activeCount}件の目標は、時間と予算の範囲に収まっています。` : '計画に含めた目標はありません。'}</p>
          </div>
        ) : (
          <ul className="conflicts">
            {f.conflicts.map((c, i) => (
              <li key={i} className={`callout ${c.kind === 'time' ? 'callout-bad' : 'callout-warn'}`}>
                <Icon name="alert" size={18} />
                <div>
                  <p>
                    <strong>{c.message}</strong>
                  </p>
                  {c.goalIds.length > 0 && <p className="small">関係する目標: {c.goalIds.map(nameOf).join('、')}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="capacity">
          <div className="capacity-row">
            <span className="capacity-label">時間</span>
            <Meter value={Math.min(f.timeDemand, timeAvail)} max={Math.max(f.timeDemand, timeAvail, 1)} label="目標に必要な時間" color={f.timeShortage > 0 ? 'var(--bad)' : 'var(--c-study)'} />
            <span className="capacity-num num">
              {fmtH(f.timeDemand)} / {fmtH(timeAvail)}h
            </span>
          </div>
          <div className="capacity-row">
            <span className="capacity-label">予算</span>
            <Meter value={Math.min(f.budgetDemandMonthly, f.budgetAvailableMonthly)} max={Math.max(f.budgetDemandMonthly, f.budgetAvailableMonthly, 1)} label="目標に必要な月額" color={f.budgetShortageMonthly > 0 ? 'var(--bad)' : 'var(--c-housework)'} />
            <span className="capacity-num num">
              {fmtYen(f.budgetDemandMonthly, true)} / {fmtYen(f.budgetAvailableMonthly, true)}
            </span>
          </div>
          <p className="fineprint">
            時間: 目標に必要な週間時間 / 使える時間（指定した枠＋自由時間）。予算: 目標に必要な月額 / 貯金後の残り（{fmtYen(f.budgetAvailableMonthly, compact)}/月）。優先順位の高い目標から順に割り当てます。
          </p>
        </div>
      </section>

      <section aria-label="目標の一覧">
        <div className="section-head">
          <h2 className="section-title">優先順位の順</h2>
          <button type="button" className="btn btn-small btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> 目標
          </button>
        </div>
        <div className="goal-list">
          {f.goals.map((r) => (
            <GoalCard key={r.goalId} goal={goalById.get(r.goalId)!} plan={scenario.goalPlans[r.goalId]} result={r} open={openId === r.goalId} onToggle={() => setOpenId(openId === r.goalId ? null : r.goalId)} scenario={scenario} edit={edit} />
          ))}
        </div>
      </section>

      {(excluded.length > 0 || notAdded.length > 0) && (
        <section aria-label="計画に含めていない目標">
          <h2 className="section-title">このシナリオに含めていない目標</h2>
          <ul className="list">
            {[...excluded, ...notAdded].map((g) => (
              <li key={g.id} className="list-row list-row-static">
                <span>
                  <span className="list-title">{g.name}</span>
                  <span className="list-sub">{scenario.goalPlans[g.id] ? '計画から外しています' : 'このシナリオには未追加'}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() =>
                    edit((s) => ({
                      ...s,
                      goalPlans: { ...s.goalPlans, [g.id]: { ...(s.goalPlans[g.id] ?? defaultGoalPlan(5)), included: true } },
                    }))
                  }
                >
                  含める
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NewGoalSheet open={adding} onClose={() => setAdding(false)} scenarioId={scenario.id} onCreated={setOpenId} />
    </div>
  );
}

function deadlineTag(r: GoalFeasibility): { tone: Tone; text: string } | null {
  switch (r.deadlineStatus) {
    case 'done':
      return { tone: 'good', text: '完了' };
    case 'on-track':
      return { tone: 'good', text: `${fmtDate(r.estimatedFinish!, false)}ごろ完了見込み` };
    case 'late':
      return { tone: 'bad', text: `期限より約${fmtDays(r.daysLate ?? 0)}遅れる見込み` };
    case 'stalled':
      return { tone: 'bad', text: '時間が確保できず完了しない' };
    case 'passed':
      return { tone: 'warn', text: '期限が過ぎています' };
    default:
      return null;
  }
}

function GoalCard({ goal, plan, result: r, open, onToggle, scenario, edit }: { goal: Goal; plan: GoalPlan; result: GoalFeasibility; open: boolean; onToggle: () => void; scenario: Scenario; edit: EditScenario }) {
  const { data, update } = useStore();
  const compact = data.settings.compactMoney;
  const [confirm, setConfirm] = useState(false);
  const domain = data.domains.find((d) => d.id === goal.domainId);
  const setPlan = (p: Partial<GoalPlan>) => edit((s) => ({ ...s, goalPlans: { ...s.goalPlans, [goal.id]: { ...s.goalPlans[goal.id], ...p } } }));
  const setGoal = (p: Partial<Goal>) =>
    update((d) => ({ ...d, goals: d.goals.map((g) => (g.id === goal.id ? { ...g, ...p, updatedAt: nowIso() } : g)) }), { debounce: true });
  const dl = deadlineTag(r);
  const otherScenarios = data.scenarios.filter((s) => s.id !== scenario.id && s.goalPlans[goal.id]).length;

  return (
    <article className={`goal-card${open ? ' is-open' : ''}`}>
      <button type="button" className="goal-card-head" aria-expanded={open} onClick={onToggle}>
        <span className="goal-rank num" aria-label={`優先順位${plan.priority}位`}>
          {plan.priority}
        </span>
        <span className="goal-card-main">
          <span className="goal-card-title">{goal.name}</span>
          <span className="goal-card-meta">
            {domain?.name ?? '未分類'} · 期限 {plan.deadline ? fmtDate(plan.deadline) : '未設定'}
          </span>
          <span className="goal-card-tags">
            {r.completed ? (
              <StatusTag tone="good">完了</StatusTag>
            ) : (
              <>
                {r.weeklyHours > 0 && (
                  <StatusTag tone={r.timeShort > 0 ? 'bad' : 'good'}>
                    時間 {r.timeShort > 0 ? `週${fmtH(r.timeShort)}h不足` : `週${fmtH(r.weeklyHours)}h確保`}
                  </StatusTag>
                )}
                {r.remainingBudget > 0 && (
                  <StatusTag tone={r.budgetUncomputable ? 'warn' : r.monthlyShort > 0 ? 'bad' : 'good'}>
                    予算 {r.budgetUncomputable ? '期限を設定してください' : r.monthlyShort > 0 ? `月${fmtYen(r.monthlyShort, true)}不足` : `月${fmtYen(r.monthlyNeed ?? 0, true)}確保`}
                  </StatusTag>
                )}
                {dl && dl.text !== '完了' && <StatusTag tone={dl.tone}>{dl.text}</StatusTag>}
              </>
            )}
          </span>
          <Meter value={goal.progress} label={`${goal.name}の進捗`} />
        </span>
        <span className="goal-card-pct num">{goal.progress}%</span>
      </button>
      {open && (
        <div className="goal-card-body">
          <dl className="breakdown">
            {r.weeklyHours > 0 && (
              <>
                <dt>時間の内訳</dt>
                <dd>
                  {r.timeSource !== 'free' && <>{TIME_SOURCE_LABELS[r.timeSource]}の枠から {fmtH(r.fromCategory)}h、</>}
                  自由時間から {fmtH(r.fromFree)}h
                  {r.timeShort > 0 && <strong className="is-bad">、不足 {fmtH(r.timeShort)}h</strong>}
                </dd>
              </>
            )}
            {r.budget > 0 && (
              <>
                <dt>予算</dt>
                <dd>
                  {fmtYen(r.budget, compact)}（実績の支出 {fmtYen(r.spent, compact)}・残り {fmtYen(r.remainingBudget, compact)}）
                  {r.monthsLeft && r.monthlyNeed ? ` ÷ ${r.monthsLeft}か月 = 月${fmtYen(r.monthlyNeed, compact)}` : ''}
                </dd>
              </>
            )}
            {r.remainingHours !== null && (
              <>
                <dt>残りの作業</dt>
                <dd>
                  {fmtH(r.remainingHours)}時間{r.estimatedFinish && r.remainingHours > 0 ? ` → ${fmtDate(r.estimatedFinish)}ごろ完了` : ''}
                </dd>
              </>
            )}
          </dl>

          <h3 className="subhead">「{scenario.name}」での計画</h3>
          <Toggle label="この目標を計画に含める" checked={plan.included} onChange={(included) => setPlan({ included })} />
          <GoalPlanFields plan={plan} onChange={setPlan} />

          <h3 className="subhead">
            目標の情報 <span className="subhead-note">全シナリオ共通{otherScenarios > 0 ? `・ほか${otherScenarios}件のシナリオにも反映` : ''}</span>
          </h3>
          <GoalInfoFields goal={goal} onChange={setGoal} />

          <button type="button" className="btn btn-ghost btn-danger-text btn-block" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={18} /> 目標を削除
          </button>
          <ConfirmSheet
            open={confirm}
            onClose={() => setConfirm(false)}
            title="目標を削除"
            danger
            confirmLabel="削除する"
            message={
              <p>
                「{goal.name}」を削除します。すべてのシナリオの計画値と、人生マップのつながりからも取り除かれます。実績の記録は「目標なし」として残ります。
              </p>
            }
            onConfirm={() => update((d) => deleteGoal(d, goal.id), { undo: `「${goal.name}」を削除しました` })}
          />
        </div>
      )}
    </article>
  );
}
