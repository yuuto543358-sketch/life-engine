import { useMemo, useState } from 'react';
import { newId, useStore } from '../../data/store';
import { CURRENT_SCENARIO_ID, type FinancialProfile, type OneOffItem, type Scenario } from '../../data/types';
import { addMonths, isValidMonth, projectSavings } from '../../engine';
import { AnimatedNumber, ConfirmSheet, Disclosure, NumberField, Segmented, Sheet, TextField, Toggle, StatusTag } from '../../ui/controls';
import { fmtMonth, fmtMonths, fmtYen, splitYen } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { useScenarioModel } from '../../ui/model';
import { FlowBar, Legend, ProjectionChart } from '../../ui/viz';
import type { EditScenario } from '../Simulator';

const HORIZONS = [
  { value: '12', label: '1年' },
  { value: '36', label: '3年' },
  { value: '60', label: '5年' },
  { value: '120', label: '10年' },
] as const;

export const MONEY_COLORS = {
  fixed: 'var(--c-sleep)',
  variable: 'var(--c-work)',
  savings: 'var(--c-commute)',
  goals: 'var(--c-housework)',
};

export function MoneyTab({ scenario, edit }: { scenario: Scenario; edit: EditScenario }) {
  const { data, today, current } = useStore();
  const compact = data.settings.compactMoney;
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]['value']>('60');
  const months = +horizon;
  const { feasibility: f, projection: p0 } = useScenarioModel(scenario, months);
  const m = f.money;
  const fin = scenario.finance;
  const p = p0;
  const ghost = useMemo(
    () => (scenario.id !== CURRENT_SCENARIO_ID ? projectSavings(current.finance, today, months) : null),
    [scenario.id, current.finance, today, months],
  );
  const setFin = (patch: Partial<FinancialProfile>) => edit((s) => ({ ...s, finance: { ...s.finance, ...patch } }));
  const goalFunded = f.goals.reduce((s, g) => s + g.monthlyFunded, 0);
  const remain = m.surplus - Math.max(0, m.effectiveSavings) - goalFunded;
  const over = m.plannedSavings + f.budgetDemandMonthly - Math.max(0, m.surplus);

  const [ooEdit, setOoEdit] = useState<OneOffItem | null>(null);

  return (
    <div className="stack-l">
      <section className="panel panel-hero" aria-label="毎月のお金の流れ">
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
              目標の費用が、貯金後の残りを月 <strong>{fmtYen(f.budgetShortageMonthly)}</strong> 超えています。「目標」タブで内訳を確認できます。
            </p>
          </div>
        )}
      </section>

      <section className="stack-m" aria-label="毎月の収支">
        <NumberField label="月の手取り収入" value={fin.monthlyIncome} onChange={(v) => setFin({ monthlyIncome: v })} min={0} max={1e10} step={1000} unit="円/月" slider={{ min: 0, max: 1000000, step: 5000 }} color={MONEY_COLORS.savings} />
        <NumberField label="固定費" hint="家賃・通信費・保険・サブスクなど毎月ほぼ同じ支出" value={fin.fixedCosts} onChange={(v) => setFin({ fixedCosts: v })} min={0} max={1e10} step={1000} unit="円/月" slider={{ min: 0, max: 500000, step: 1000 }} color={MONEY_COLORS.fixed} />
        <NumberField label="変動費" hint="食費・日用品・交際費など月によって変わる支出" value={fin.variableCosts} onChange={(v) => setFin({ variableCosts: v })} min={0} max={1e10} step={1000} unit="円/月" slider={{ min: 0, max: 500000, step: 1000 }} color={MONEY_COLORS.variable} />
        <NumberField label="毎月の貯金額" hint="月間収支のうち、貯金に回す予定の額" value={fin.monthlySavings} onChange={(v) => setFin({ monthlySavings: v })} min={0} max={1e10} step={1000} unit="円/月" slider={{ min: 0, max: Math.max(300000, Math.ceil(Math.max(0, m.surplus) / 10000) * 10000), step: 1000 }} color={MONEY_COLORS.savings} />
      </section>

      <section className="panel" aria-label="将来の貯金残高">
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
          deadline={fin.targetMonth || null}
        />
        {ghost && <Legend items={[{ label: scenario.name, color: 'var(--c-sleep)', kind: 'line' }, { label: '現在の計画', color: 'var(--ink-3)', kind: 'line' }]} />}
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

      <section className="panel" aria-label="貯金の目標">
        <h2 className="section-title">貯金の目標</h2>
        <div className="stack-m">
          <NumberField label="現在の貯金額" value={fin.currentSavings} onChange={(v) => setFin({ currentSavings: v })} min={-1e10} max={1e11} step={10000} unit="円" slider={{ min: 0, max: 10000000, step: 10000 }} />
          <NumberField label="貯金の目標額" value={fin.savingsTarget} onChange={(v) => setFin({ savingsTarget: v })} min={0} max={1e11} step={10000} unit="円" slider={{ min: 0, max: 20000000, step: 50000 }} hint="0 にすると目標なしとして扱います" />
          <TextField label="目標達成期限（年月）" type="month" value={fin.targetMonth} onChange={(v) => setFin({ targetMonth: v === '' || isValidMonth(v) ? v : fin.targetMonth })} />
        </div>
        {p.target > 0 ? (
          <div className="goal-result">
            <GoalLine
              label="目標達成まで"
              value={p.alreadyReached ? '達成済み' : p.monthsToTarget ? fmtMonths(p.monthsToTarget) : '50年以内に届きません'}
              sub={p.reachYm && !p.alreadyReached ? `${fmtMonth(p.reachYm)}末に到達する計算` : p.monthsToTarget === null ? '今の収支のままでは残高が目標に届きません' : undefined}
              tone={p.alreadyReached ? 'good' : p.monthsToTarget === null ? 'bad' : 'neutral'}
            />
            {fin.targetMonth && (
              <GoalLine
                label="期限までに"
                value={p.deadlinePassed ? '期限が過ぎています' : p.reachableByDeadline ? '間に合う' : '間に合わない'}
                sub={
                  p.deadlinePassed
                    ? '期限を未来の年月に変更してください'
                    : `${fmtMonth(fin.targetMonth)}末の残高 ${fmtYen(p.balanceAtDeadline ?? 0, compact)}（積立 ${p.monthsToDeadline}回）`
                }
                tone={p.deadlinePassed ? 'warn' : p.reachableByDeadline ? 'good' : 'bad'}
              />
            )}
            {fin.targetMonth && !p.deadlinePassed && p.requiredMonthly !== null && (
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
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => setFin({ monthlySavings: p.requiredMonthly! })}>
                      この額にする
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
        ) : (
          <p className="muted small">目標額を入れると、達成までの期間と必要な月額を計算します。</p>
        )}
      </section>

      <section className="panel" aria-label="臨時収入・臨時支出">
        <div className="panel-head">
          <h2 className="section-title">臨時収入・臨時支出</h2>
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => setOoEdit({ id: newId('oo-'), label: '', amount: 0, type: 'income', month: today.slice(0, 7), repeatYearly: false })}
          >
            <Icon name="plus" size={16} /> 追加
          </button>
        </div>
        {fin.oneOffs.length === 0 ? (
          <p className="muted small">ボーナスや旅行など、毎月ではないお金の出入りを登録すると、将来の残高に反映されます。</p>
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
                      </span>
                    </span>
                    <span className={`num list-value ${o.type === 'expense' ? 'is-neg' : ''}`}>{fmtYen(o.type === 'income' ? o.amount : -o.amount, compact, true)}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

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
