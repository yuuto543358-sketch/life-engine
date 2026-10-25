import { useMemo, useState } from 'react';
import { newId, useStore } from '../../data/store';
import { CURRENT_SCENARIO_ID, type FinancialProfile, type OneOffItem, type Scenario } from '../../data/types';
import { addMonths, bonusSavingsRate, calculateAutoSavingsTarget, isBonusItem, isValidMonth, projectSavings, resolveFinance, savingsTargetMode } from '../../engine';
import { AnimatedNumber, ConfirmSheet, Disclosure, Meter, NumberField, Segmented, Sheet, TextField, Toggle, StatusTag } from '../../ui/controls';
import { fmtMonth, fmtMonths, fmtYen, splitYen } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { useScenarioModel } from '../../ui/model';
import { BreakdownEditor } from '../../ui/BreakdownEditor';
import { SectionNav } from '../../ui/SectionNav';
import { NewGoalSheet } from '../../ui/GoalEditor';
import { setSavingsTotal } from '../../data/breakdowns';
import { FlowBar, Legend, ProjectionChart } from '../../ui/viz';
import type { EditScenario } from '../Simulator';

const HORIZONS = [
  { value: '12', label: '1年' },
  { value: '36', label: '3年' },
  { value: '60', label: '5年' },
  { value: '120', label: '10年' },
] as const;

import { MONEY_COLORS } from '../../ui/recordViews';
export { MONEY_COLORS };

export function MoneyTab({ scenario, edit }: { scenario: Scenario; edit: EditScenario }) {
  const { data, today, current } = useStore();
  const compact = data.settings.compactMoney;
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]['value']>('60');
  const months = +horizon;
  const { feasibility: f, projection: p, finance: rf } = useScenarioModel(scenario, months);
  const m = f.money;
  const fin = scenario.finance;
  const mode = savingsTargetMode(fin);
  const auto = useMemo(() => calculateAutoSavingsTarget(scenario, data.goals, today), [scenario, data.goals, today]);
  const ghost = useMemo(
    () => (scenario.id !== CURRENT_SCENARIO_ID ? projectSavings(resolveFinance(current, data.goals, today), today, months) : null),
    [scenario.id, current, data.goals, today, months],
  );
  const [addingGoal, setAddingGoal] = useState(false);
  const setFin = (patch: Partial<FinancialProfile>) => edit((s) => ({ ...s, finance: { ...s.finance, ...patch } }));
  const goalFunded = f.goals.reduce((s, g) => s + g.monthlyFunded, 0);
  const remain = m.surplus - Math.max(0, m.effectiveSavings) - goalFunded;
  const over = m.plannedSavings + f.budgetDemandMonthly - Math.max(0, m.surplus);

  const [ooEdit, setOoEdit] = useState<OneOffItem | null>(null);

  return (
    <div className="stack-l">
      <SectionNav
        label="お金のページの目次"
        items={[
          { id: 'm-flow', label: '月の収支' },
          { id: 'm-breakdown', label: '収入と支出の内訳' },
          { id: 'm-target', label: '貯金の目標' },
          { id: 'm-oneoffs', label: 'ボーナス・臨時' },
          { id: 'm-projection', label: '将来の残高' },
          { id: 'm-rate', label: '利回り' },
        ]}
      />
      <section className="panel panel-hero anchor" id="m-flow" aria-label="毎月のお金の流れ">
        <p className="hero-label">月間収支（収入 − 固定費 − 変動費）</p>
        <p className={`hero-num ${m.surplus < 0 ? 'is-bad' : ''}`}>
          {m.surplus < 0 && <Icon name="alert" size={28} />}
          <AnimatedNumber value={m.surplus} format={(v) => splitYen(v, compact, true)[0]} className="num" />
          <span className="hero-unit">{splitYen(m.surplus, compact)[1]} / 月</span>
        </p>
        <p className="hero-sub">年間 {fmtYen(m.annualSurplus, compact, true)}（臨時収支 {fmtYen(m.oneOffNext12, compact, true)} を含む）</p>

        <FlowBar
          total={m.income}
          ariaLabel={`収入${fmtYen(m.income)}の内訳`}
          segments={[
            { key: 'fixed', label: '固定費', value: m.fixedCosts, color: MONEY_COLORS.fixed },
            { key: 'variable', label: '変動費', value: m.variableCosts, color: MONEY_COLORS.variable },
            { key: 'savings', label: '貯金', value: m.plannedSavings, color: MONEY_COLORS.savings },
            { key: 'goals', label: '目標の費用', value: f.budgetDemandMonthly, color: MONEY_COLORS.goals },
            { key: 'free', label: '残り', value: Math.max(0, remain), color: 'var(--c-free)' },
          ]}
        />
        <Legend
          items={[
            { label: '固定費', color: MONEY_COLORS.fixed, value: fmtYen(m.fixedCosts, compact) },
            { label: '変動費', color: MONEY_COLORS.variable, value: fmtYen(m.variableCosts, compact) },
            { label: '貯金', color: MONEY_COLORS.savings, value: fmtYen(m.plannedSavings, compact) },
            ...(f.budgetDemandMonthly > 0 ? [{ label: '目標の費用', color: MONEY_COLORS.goals, value: fmtYen(f.budgetDemandMonthly, compact) }] : []),
            over > 0 ? { label: '収入を超える分', kind: 'over' as const, value: fmtYen(over, compact) } : { label: '残り', kind: 'free' as const, value: fmtYen(Math.max(0, remain), compact) },
          ]}
        />
        {m.savingsShortfall > 0 && (
          <div className="callout callout-bad" role="alert">
            <Icon name="alert" size={18} />
            <p>
              毎月の貯金額が月間収支を <strong>{fmtYen(m.savingsShortfall)}</strong> 超えています。将来の残高は、実際に残る {fmtYen(m.effectiveSavings)}/月 で計算しています。
            </p>
          </div>
        )}
        {f.budgetShortageMonthly > 0 && (
          <div className="callout callout-warn">
            <Icon name="alert" size={18} />
            <p>
              目標の費用が、貯金後の残りを月 <strong>{fmtYen(f.budgetShortageMonthly)}</strong> 超えています。上の「目標」で内訳を確認できます。
            </p>
          </div>
        )}
      </section>

      <section className="stack-m anchor" id="m-breakdown" aria-label="毎月の収支">
        <BreakdownEditor kind="income" fin={fin} onChange={setFin} color={MONEY_COLORS.savings} compactMoney={compact} hint="税金・社会保険料が引かれた後の、毎月使えるお金" />
        <BreakdownEditor kind="fixed" fin={fin} onChange={setFin} color={MONEY_COLORS.fixed} compactMoney={compact} hint="家賃・光熱費・保険など、毎月ほぼ同じ支出" />
        <BreakdownEditor kind="variable" fin={fin} onChange={setFin} color={MONEY_COLORS.variable} compactMoney={compact} hint="食費・日用品・交際費など、月によって変わる支出" />
        <BreakdownEditor kind="savings" fin={fin} onChange={setFin} color={MONEY_COLORS.savings} compactMoney={compact} hint="預金・つみたてNISA・iDeCo など、毎月貯める・積み立てるお金。お金の目標はここから積み立てる計算です" />
      </section>

      <section className="panel anchor" id="m-target" aria-label="貯金の目標">
        <h2 className="section-title">貯金の目標</h2>
        <div className="stack-m">
          <NumberField label="現在の貯金額" value={fin.currentSavings} onChange={(v) => setFin({ currentSavings: v })} min={-1e10} max={1e11} step={10000} unit="円" slider={{ min: 0, max: 10000000, step: 10000 }} hint="預金・NISA などの合計" />
          <div className="field">
            <span className="field-label">目標額の決め方</span>
            <Segmented
              label="目標額の決め方"
              options={[
                { value: 'auto', label: 'お金の目標から自動' },
                { value: 'manual', label: '自分で入力' },
              ]}
              value={mode}
              onChange={(savingsTargetMode) => setFin({ savingsTargetMode })}
            />
          </div>
          {mode === 'manual' ? (
            <>
              <NumberField label="貯金の目標額" value={fin.savingsTarget} onChange={(v) => setFin({ savingsTarget: v })} min={0} max={1e11} step={10000} unit="円" slider={{ min: 0, max: 20000000, step: 50000 }} hint="0 にすると目標なしとして扱います" />
              <TextField label="目標達成期限（年月）" type="month" value={fin.targetMonth} onChange={(v) => setFin({ targetMonth: v === '' || isValidMonth(v) ? v : fin.targetMonth })} />
            </>
          ) : (
            <AutoTargetPanel
              auto={auto}
              f={f}
              fin={fin}
              compact={compact}
              onAdd={() => setAddingGoal(true)}
              onApply={(total) => setFin(setSavingsTotal(fin, total))}
              onRate={(bonusSavingsRate) => setFin({ bonusSavingsRate })}
              onAddBonus={() => setOoEdit({ id: newId('oo-'), label: 'ボーナス', amount: 0, type: 'income', month: today.slice(0, 7), repeatYearly: true, bonus: true })}
            />
          )}
        </div>
        {p.target > 0 ? (
          <div className="goal-result">
            <GoalLine
              label="残高が目標額に届くまで"
              value={p.alreadyReached ? '達成済み' : p.monthsToTarget ? fmtMonths(p.monthsToTarget) : '50年以内に届きません'}
              sub={p.reachYm && !p.alreadyReached ? `${fmtMonth(p.reachYm)}末に ${fmtYen(p.target, compact)} に到達する計算` : p.monthsToTarget === null ? '今の収支のままでは残高が目標に届きません' : undefined}
              tone={p.alreadyReached ? 'good' : p.monthsToTarget === null ? 'bad' : 'neutral'}
            />
            {rf.targetMonth && (
              <GoalLine
                label="期限までに"
                value={p.deadlinePassed ? '期限が過ぎています' : p.reachableByDeadline ? '間に合う' : '間に合わない'}
                sub={
                  p.deadlinePassed
                    ? '期限を未来の日付に変更してください'
                    : `${fmtMonth(rf.targetMonth)}末の残高 ${fmtYen(p.balanceAtDeadline ?? 0, compact)}（積立 ${p.monthsToDeadline}回）`
                }
                tone={p.deadlinePassed ? 'warn' : p.reachableByDeadline ? 'good' : 'bad'}
              />
            )}
            {mode === 'manual' && rf.targetMonth && !p.deadlinePassed && p.requiredMonthly !== null && (
              <GoalLine
                label="期限に必要な月の貯金額"
                value={fmtYen(p.requiredMonthly)}
                sub={
                  p.requiredMonthly > Math.max(0, m.surplus)
                    ? `月間収支（${fmtYen(m.surplus)}）を超えるため、収入を増やすか支出を減らす必要があります`
                    : p.requiredMonthly > m.plannedSavings
                      ? `いまの設定より月 ${fmtYen(p.requiredMonthly - m.plannedSavings)} 多く必要です`
                      : 'いまの貯金額で足りています'
                }
                tone={p.requiredMonthly > Math.max(0, m.surplus) ? 'bad' : p.requiredMonthly > m.plannedSavings ? 'warn' : 'good'}
                action={
                  p.requiredMonthly <= Math.max(0, m.surplus) && p.requiredMonthly > m.plannedSavings ? (
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => setFin(setSavingsTotal(fin, p.requiredMonthly!))}>
                      この額にする
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
        ) : mode === 'manual' ? (
          <p className="muted small">目標額を入れると、達成までの期間と必要な月額を計算します。</p>
        ) : null}
      </section>
      <NewGoalSheet open={addingGoal} onClose={() => setAddingGoal(false)} scenarioId={scenario.id} initialKind="money" />

      <section className="panel anchor" id="m-oneoffs" aria-label="ボーナス・臨時収入・臨時支出">
        <div className="panel-head">
          <h2 className="section-title">ボーナス・臨時収入・臨時支出</h2>
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => setOoEdit({ id: newId('oo-'), label: '', amount: 0, type: 'income', month: today.slice(0, 7), repeatYearly: false })}
          >
            <Icon name="plus" size={16} /> 追加
          </button>
        </div>
        {fin.oneOffs.length === 0 ? (
          <p className="muted small">ボーナスや旅行など、毎月ではないお金の出入りを登録すると、将来の残高と、お金の目標の計算に反映されます。</p>
        ) : (
          <ul className="list">
            {[...fin.oneOffs]
              .sort((a, b) => a.month.localeCompare(b.month))
              .map((o) => (
                <li key={o.id}>
                  <button type="button" className="list-row" onClick={() => setOoEdit(o)}>
                    <span>
                      <span className="list-title">{o.label || (o.type === 'income' ? '臨時収入' : '臨時支出')}</span>
                      <span className="list-sub">
                        {fmtMonth(o.month)}
                        {o.repeatYearly ? '・毎年' : ''}
                        {isBonusItem(o) ? '・ボーナスとして貯金の計算に使う' : ''}
                      </span>
                    </span>
                    <span className={`num list-value ${o.type === 'expense' ? 'is-neg' : ''}`}>{fmtYen(o.type === 'income' ? o.amount : -o.amount, compact, true)}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="panel anchor" id="m-projection" aria-label="将来の貯金残高">
        <div className="panel-head">
          <h2 className="section-title">将来の貯金残高</h2>
          <Segmented small label="表示する期間" options={HORIZONS.map((h) => ({ ...h }))} value={horizon} onChange={setHorizon} />
        </div>
        <ProjectionChart
          series={[
            { id: 'main', label: scenario.name, values: p.points.map((x) => ({ ym: x.ym, v: x.balance })), color: 'var(--c-sleep)' },
            ...(ghost ? [{ id: 'ghost', label: '現在の計画', values: ghost.points.map((x) => ({ ym: x.ym, v: x.balance })), color: 'var(--ink-3)', ghost: true }] : []),
          ]}
          target={p.target}
          deadline={rf.targetMonth || null}
        />
        {ghost && <Legend items={[{ label: scenario.name, color: 'var(--c-sleep)', kind: 'line' }, { label: '現在の計画', color: 'var(--ink-3)', kind: 'line' }]} />}
        {p.target > 0 && mode === 'auto' && <p className="small muted">目標の線は、お金の目標から自動で計算した貯金の目標額（{fmtYen(p.target, compact)}）です。</p>}
        <p className="fineprint">
          入力した収支が毎月変わらず続くと仮定した計算値です{fin.annualReturnRate > 0 ? `（年利 ${fin.annualReturnRate}% を仮定）` : '（運用益は含めていません）'}。将来の残高を保証するものではありません。
        </p>
        <dl className="stats">
          <Stat label="現在の貯金額" value={fmtYen(fin.currentSavings, compact)} />
          <Stat label="毎月の積立" value={fmtYen(p.monthlyContribution, compact, true)} tone={p.monthlyContribution < 0 ? 'bad' : undefined} />
          <Stat label={`${months / 12}年後の残高`} value={fmtYen(p.points[p.points.length - 1]?.balance ?? 0, compact)} sub={`${fmtMonth(p.points[p.points.length - 1]?.ym ?? '')}末`} />
          <Stat label="年間の貯金の増加" value={fmtYen(m.annualSavings, compact, true)} />
        </dl>
      </section>

      <div className="anchor" id="m-rate">
      <Disclosure summary="想定利回り（任意）">
        <NumberField
          label="想定年利"
          value={fin.annualReturnRate}
          onChange={(v) => setFin({ annualReturnRate: v })}
          min={0}
          max={20}
          step={0.1}
          unit="%"
          slider={{ min: 0, max: 10, step: 0.1 }}
          hint="初期値は 0% です。入力した値は仮定であり、利回りを保証するものではありません。月利 = 年利 ÷ 12 の複利で計算します。"
        />
      </Disclosure>
      </div>

      <OneOffSheet
        item={ooEdit}
        onClose={() => setOoEdit(null)}
        exists={!!ooEdit && fin.oneOffs.some((o) => o.id === ooEdit.id)}
        onSave={(item) => setFin({ oneOffs: fin.oneOffs.some((o) => o.id === item.id) ? fin.oneOffs.map((o) => (o.id === item.id ? item : o)) : [...fin.oneOffs, item] })}
        onDelete={(id) => setFin({ oneOffs: fin.oneOffs.filter((o) => o.id !== id) })}
        defaultMonth={addMonths(today.slice(0, 7), 0)}
      />
    </div>
  );
}

function AutoTargetPanel({
  auto,
  f,
  fin,
  compact,
  onAdd,
  onApply,
  onRate,
  onAddBonus,
}: {
  auto: ReturnType<typeof calculateAutoSavingsTarget>;
  f: ReturnType<typeof useScenarioModel>['feasibility'];
  fin: FinancialProfile;
  compact: boolean;
  onAdd: () => void;
  onApply: (total: number) => void;
  onRate: (rate: number) => void;
  onAddBonus: () => void;
}) {
  const m = f.money;
  if (auto.goals.length === 0) {
    return (
      <div className="auto-empty">
        <p className="small">「〇〇円を貯める」「〇〇を買う」といったお金の目標を登録すると、貯金の目標額と、毎月いくら貯める必要があるかを自動で計算します。</p>
        <button type="button" className="btn btn-small btn-primary" onClick={onAdd}>
          <Icon name="plus" size={16} /> お金の目標を追加
        </button>
      </div>
    );
  }
  const need = auto.monthlyNeed;
  const planned = m.plannedSavings;
  const short = Math.max(0, need - Math.max(0, m.effectiveSavings));
  const result = new Map(f.goals.map((g) => [g.goalId, g]));
  const bonuses = fin.oneOffs.filter(isBonusItem);
  return (
    <div className="auto-target">
      <div className="bonus-plan">
        <p className="bonus-plan-title">
          <Icon name="spark" size={16} /> ボーナスも見込んで計算
        </p>
        {bonuses.length === 0 ? (
          <>
            <p className="small muted">ボーナスを登録すると、「ボーナスで貯める額」と「それ以外に毎月貯める額」に分けて計算します。</p>
            <button type="button" className="btn btn-small btn-ghost" onClick={onAddBonus}>
              <Icon name="plus" size={16} /> ボーナスを登録
            </button>
          </>
        ) : (
          <>
            <p className="small muted">
              {bonuses.map((b) => `${b.label || 'ボーナス'}（${+b.month.slice(5)}月${b.repeatYearly ? '・毎年' : ''} ${fmtYen(b.amount, compact)}）`).join('、')}
            </p>
            <NumberField
              label="ボーナスのうち貯金に回す割合"
              value={bonusSavingsRate(fin)}
              onChange={onRate}
              min={0}
              max={100}
              step={5}
              unit="%"
              slider={{ min: 0, max: 100, step: 5 }}
              hint="0% にすると、ボーナスを使わずに毎月の貯金だけで計算します。"
            />
          </>
        )}
      </div>
      <ul className="money-goals">
        {auto.goals.map(({ goal, plan, need: n }) => {
          const r = result.get(goal.id);
          return (
            <li key={goal.id} className="money-goal">
              <div className="money-goal-top">
                <span className="money-goal-name">
                  {goal.name}
                  <span className="badge">{goal.moneyPurpose === 'buy' ? '買う' : '貯める'}</span>
                </span>
                <span className="num money-goal-need">{n.monthlyNeed !== null ? `${fmtYen(n.monthlyNeed)}/月` : '—'}</span>
              </div>
              {n.status === 'ok' && n.fromBonus > 0 && (
                <p className="money-goal-split num">
                  <span className="split-chip split-bonus">ボーナスで {fmtYen(n.fromBonus, compact)}（{n.bonusUses.length}回）</span>
                  {(n.monthlyNeed ?? 0) > 0 ? (
                    <>
                      <span className="split-plus">＋</span>
                      <span className="split-chip">毎月 {fmtYen(n.monthlyNeed ?? 0, compact)} × {n.months}か月</span>
                    </>
                  ) : (
                    <span className="split-chip">ボーナスだけで間に合います</span>
                  )}
                </p>
              )}
              <Meter value={n.saved} max={n.target || 1} label={`${goal.name}の貯まっている額`} color="var(--c-commute)" />
              <p className="money-goal-sub num">
                {fmtYen(n.saved, compact)} / {fmtYen(n.target, compact)}
                {plan.deadline ? ` · ${plan.deadline.replace(/-/g, '/')}まで（${n.months ?? 0}か月）` : ' · 目標日 未設定'}
              </p>
              {n.status === 'no-date' && <StatusTag tone="warn">目標日を設定すると毎月の額を計算します</StatusTag>}
              {n.status === 'passed' && <StatusTag tone="warn">目標日が過ぎています</StatusTag>}
              {n.status === 'done' && <StatusTag tone="good">達成</StatusTag>}
              {r && r.monthlyShort > 0 && <StatusTag tone="bad">毎月の貯金から月 {fmtYen(r.monthlyShort, compact)} 足りない</StatusTag>}
            </li>
          );
        })}
      </ul>
      <dl className="auto-sum">
        <div>
          <dt>貯金の目標額（自動）</dt>
          <dd className="num">{fmtYen(auto.target, compact)}</dd>
          <dd className="stat-sub">{auto.month ? `いちばん遅い目標日 ${fmtMonth(auto.month)}` : '目標日 未設定'}</dd>
        </div>
        {auto.fromBonus > 0 && (
          <div>
            <dt>ボーナスで貯める額</dt>
            <dd className="num">{fmtYen(auto.fromBonus, compact)}</dd>
            <dd className="stat-sub">ボーナスの {auto.bonusRate}% を目標日までに</dd>
          </div>
        )}
        <div>
          <dt>{auto.fromBonus > 0 ? 'ボーナス以外に毎月貯める額' : '毎月必要な貯金額'}</dt>
          <dd className={`num ${short > 0 ? 'is-bad' : ''}`}>{fmtYen(need)}/月</dd>
          <dd className="stat-sub">いまの毎月の貯金・積立 {fmtYen(planned)}</dd>
        </div>
      </dl>
      {auto.fromBonus > 0 && <BonusSchedule auto={auto} compact={compact} />}
      {short > 0 ? (
        <div className="callout callout-warn">
          <Icon name="alert" size={18} />
          <div>
            <p>
              目標日までに間に合わせるには、毎月の貯金をあと <strong>{fmtYen(short)}</strong> 増やす必要があります。
            </p>
            {need <= Math.max(0, m.surplus) ? (
              <button type="button" className="btn btn-small btn-ghost" onClick={() => onApply(need)}>
                毎月の貯金を {fmtYen(need, compact)} にする（差額は預金に入れる）
              </button>
            ) : (
              <p className="small">必要な額が月間収支（{fmtYen(m.surplus, compact)}）を超えています。収入を増やすか、支出を減らすか、目標日を遅らせてください。</p>
            )}
          </div>
        </div>
      ) : need > 0 ? (
        <div className="callout callout-good">
          <Icon name="check" size={18} />
          <p>いまの毎月の貯金で、すべてのお金の目標に間に合う計算です。</p>
        </div>
      ) : null}
      <p className="fineprint">
        計算のしかた: まず、目標日までに入るボーナスのうち「貯金に回す割合」の分を、優先順位の高い目標から順に、早く入るボーナスから使います（同じボーナスを二重には数えません）。残りの額を、今月から目標日の月までの月数で割ったものが「毎月貯める額」です。今月に入るボーナスも数えます。お金の目標は、上の「目標」で追加・編集できます。
      </p>
    </div>
  );
}

/** ボーナスごとの、目標への割り振り（いつ・いくら・どの目標に） */
function BonusSchedule({ auto, compact }: { auto: ReturnType<typeof calculateAutoSavingsTarget>; compact: boolean }) {
  const rows = new Map<string, { month: string; label: string; items: { name: string; amount: number }[] }>();
  for (const { goal, need } of auto.goals) {
    for (const u of need.bonusUses) {
      const key = `${u.month}|${u.label}`;
      const row = rows.get(key) ?? { month: u.month, label: u.label, items: [] };
      row.items.push({ name: goal.name, amount: u.amount });
      rows.set(key, row);
    }
  }
  const list = [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
  return (
    <Disclosure summary={`ボーナスの使いみち（${list.length}回分）`}>
      <ol className="bonus-schedule">
        {list.map((r) => (
          <li key={`${r.month}${r.label}`}>
            <span className="bonus-when">
              {fmtMonth(r.month)} <span className="muted">{r.label}</span>
            </span>
            <span className="bonus-what num">
              {r.items.map((it) => `${it.name} ${fmtYen(it.amount, compact)}`).join('・')}
            </span>
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className={`num ${tone === 'bad' ? 'is-bad' : ''}`}>{value}</dd>
      {sub && <dd className="stat-sub">{sub}</dd>}
    </div>
  );
}

function GoalLine({ label, value, sub, tone, action }: { label: string; value: string; sub?: string; tone: 'good' | 'warn' | 'bad' | 'neutral'; action?: React.ReactNode }) {
  return (
    <div className="goal-line">
      <div className="goal-line-main">
        <span className="goal-line-label">{label}</span>
        <StatusTag tone={tone}>{value}</StatusTag>
      </div>
      {sub && <p className="goal-line-sub">{sub}</p>}
      {action}
    </div>
  );
}

function OneOffSheet({ item, onClose, onSave, onDelete, exists, defaultMonth }: { item: OneOffItem | null; onClose: () => void; onSave: (o: OneOffItem) => void; onDelete: (id: string) => void; exists: boolean; defaultMonth: string }) {
  const [draft, setDraft] = useState<OneOffItem | null>(item);
  const [confirm, setConfirm] = useState(false);
  const [lastItem, setLastItem] = useState(item);
  if (item !== lastItem) {
    setLastItem(item);
    setDraft(item);
  }
  if (!draft) return null;
  const valid = draft.amount > 0 && isValidMonth(draft.month);
  return (
    <>
      <Sheet
        open={!!item}
        onClose={onClose}
        title={exists ? '臨時収支を編集' : '臨時収支を追加'}
        footer={
          <div className="btn-row">
            {exists && (
              <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => setConfirm(true)}>
                <Icon name="trash" size={18} /> 削除
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!valid}
              onClick={() => {
                onSave(draft);
                onClose();
              }}
            >
              保存
            </button>
          </div>
        }
      >
        <div className="stack-m">
          <Segmented
            label="種類"
            options={[
              { value: 'income', label: '臨時収入' },
              { value: 'expense', label: '臨時支出' },
            ]}
            value={draft.type}
            onChange={(type) => setDraft({ ...draft, type })}
          />
          <TextField label="名前" value={draft.label} onChange={(label) => setDraft({ ...draft, label })} placeholder={draft.type === 'income' ? '例: 夏のボーナス' : '例: 旅行・家電の買い替え'} />
          <NumberField label="金額" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} min={0} max={1e11} step={1000} unit="円" slider={false} hint={draft.amount <= 0 ? '1円以上を入力してください' : undefined} />
          <TextField label="発生する年月" type="month" value={draft.month} onChange={(month) => setDraft({ ...draft, month: month || defaultMonth })} />
          <Toggle label="毎年くり返す" hint="ボーナスなど、毎年同じ月に発生する場合" checked={draft.repeatYearly} onChange={(repeatYearly) => setDraft({ ...draft, repeatYearly })} />
          {draft.type === 'income' && (
            <Toggle
              label="ボーナスとして、お金の目標の計算に使う"
              hint="オンにすると、この収入の一部（貯金に回す割合の分）で目標のお金を貯める計算になります"
              checked={isBonusItem(draft)}
              onChange={(bonus) => setDraft({ ...draft, bonus })}
            />
          )}
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="臨時収支を削除"
        message={`「${draft.label || '名前なし'}」を削除します。`}
        confirmLabel="削除する"
        danger
        onConfirm={() => {
          onDelete(draft.id);
          onClose();
        }}
      />
    </>
  );
}
