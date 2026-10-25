import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { CURRENT_SCENARIO_ID, type ActualRecord } from '../data/types';
import { EXPENSE_LABELS, TIME_LABELS, calculatePlanDeviation, compareScenarios, periodFor, round, startOfMonth, daysBetween, daysInMonth } from '../engine';
import { AnimatedNumber, Meter, SectionHead, StatusTag } from '../ui/controls';
import { fmtDate, fmtH, fmtHours, fmtMonths, fmtShortDate, fmtYen, splitYen, weekdayOf } from '../ui/format';
import { Icon } from '../ui/Icon';
import { useScenarioModel } from '../ui/model';
import { OnboardingSheet } from '../ui/Onboarding';
import { href, navigate } from '../ui/router';
import { ScreenHead } from '../ui/ScreenHead';
import { Bullet, CAT_COLOR, FlowBar, TimeDonut, TimeLegend } from '../ui/viz';
import { MONEY_COLORS } from './sim/MoneyTab';

export function HomeScreen() {
  const { data, today, current, addSample } = useStore();
  const [setup, setSetup] = useState(false);
  const name = data.profile.name;
  const dateLabel = `${fmtDate(today, false)}（${weekdayOf(today)}）`;

  if (!data.profile.onboarded) {
    return (
      <>
        <ScreenHead eyebrow={dateLabel} title="LIFE ENGINE" />
        <section className="intro">
          <div className="intro-visual" aria-hidden="true">
            <TimeDonut items={Object.entries(current.time.items).map(([key, v]) => ({ key: key as keyof typeof current.time.items, weeklyHours: v.hoursPerDay * v.daysPerWeek }))} totalHours={168} size={200} />
          </div>
          <h2 className="intro-title">
            人生を、記録するだけでなく
            <br />
            組み替えて試せるように。
          </h2>
          <p className="intro-text">
            時間・お金・目標をひとつの計画として計算します。「週10時間勉強したら？」「貯金を増やしたら？」を、スライダーを動かすだけで確かめられます。
          </p>
          <ol className="intro-steps">
            <li>
              <span className="num">1</span>1週間の時間と毎月のお金を入れる
            </li>
            <li>
              <span className="num">2</span>目標に必要な時間と予算を登録する
            </li>
            <li>
              <span className="num">3</span>シナリオを作って比べる
            </li>
          </ol>
          <div className="stack-s">
            <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => setSetup(true)}>
              はじめる（約1分）
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={addSample}>
              サンプルデータで試してみる
            </button>
          </div>
          <p className="fineprint">AIや外部サービスは使いません。データはこの端末の中だけに保存されます。</p>
        </section>
        <OnboardingSheet open={setup} onClose={() => setSetup(false)} />
      </>
    );
  }

  return (
    <>
      <ScreenHead eyebrow={dateLabel} title={name ? `${name}さんの人生の計画` : '人生の計画'} />
      <Overview />
      <GoalsSummary />
      <DeviationSummary />
      <ScenarioSummary />
      <RecentRecords />
      <a className="cta" href={href('sim')}>
        <span>
          <span className="cta-title">シミュレーターで試す</span>
          <span className="cta-sub">時間・お金・目標を動かして、計画が成り立つか確かめる</span>
        </span>
        <Icon name="arrow" size={22} />
      </a>
    </>
  );
}

function Overview() {
  const { data, current, today } = useStore();
  const compact = data.settings.compactMoney;
  const { feasibility: f, projection: p, finance: fin } = useScenarioModel(current);
  const t = f.time;
  const m = f.money;

  // 今月の変動費: 記録の合計と、計画の日割りの目安
  const monthStart = startOfMonth(today);
  const dim = daysInMonth(+today.slice(0, 4), +today.slice(5, 7));
  const elapsed = daysBetween(monthStart, today) + 1;
  const varActual = data.actuals.filter((a) => a.type === 'expense' && a.expenseCategory === 'variable' && a.date >= monthStart && a.date <= today).reduce((s, a) => s + (a.type === 'expense' ? a.amount : 0), 0);
  const varPace = (m.variableCosts * elapsed) / dim;
  const hasVarRecords = data.actuals.some((a) => a.type === 'expense' && a.expenseCategory === 'variable' && a.date >= monthStart);

  return (
    <section className="overview" aria-label="現在の生活の要約">
      <div className="ov-block">
        <div className="ov-head">
          <span className="ov-label">
            <Icon name="clock" size={16} /> 1週間 168時間
          </span>
          <a className="ov-link" href={href('sim', 'time')}>
            調整 <Icon name="chevron" size={14} />
          </a>
        </div>
        <div className="ov-donut">
          <TimeDonut items={t.items} totalHours={t.totalHours} goalFreeHours={f.freeUsedByGoals} size={150} compact />
          <TimeLegend items={t.items} freeHours={t.freeHours} goalFreeHours={f.freeUsedByGoals} />
        </div>
        <p className="ov-eq num">
          配分 {fmtH(t.allocatedHours)}h · 目標 {fmtH(f.timeDemand)}h（うち自由時間から {fmtH(f.freeUsedByGoals)}h）
        </p>
      </div>

      <div className="ov-block">
        <div className="ov-head">
          <span className="ov-label">
            <Icon name="yen" size={16} /> 毎月のお金
          </span>
          <a className="ov-link" href={href('sim', 'money')}>
            調整 <Icon name="chevron" size={14} />
          </a>
        </div>
        <p className={`ov-num ${m.surplus < 0 ? 'is-bad' : ''}`}>
          <AnimatedNumber value={m.surplus} format={(v) => splitYen(v, compact, true)[0]} className="num" />
          <span className="ov-unit">{splitYen(m.surplus, compact)[1]}/月 の収支</span>
        </p>
        <FlowBar
          total={m.income}
          ariaLabel="収入の内訳"
          segments={[
            { key: 'f', label: '固定費', value: m.fixedCosts, color: MONEY_COLORS.fixed },
            { key: 'v', label: '変動費', value: m.variableCosts, color: MONEY_COLORS.variable },
            { key: 's', label: '貯金', value: m.plannedSavings, color: MONEY_COLORS.savings },
            { key: 'g', label: '目標', value: f.budgetDemandMonthly, color: MONEY_COLORS.goals },
            { key: 'r', label: '残り', value: Math.max(0, m.unallocated - f.budgetDemandMonthly), color: 'var(--c-free)' },
          ]}
        />
        <dl className="mini-stats">
          <div>
            <dt>
              <span className="swatch" style={{ background: MONEY_COLORS.savings }} />
              今月の貯金予定
            </dt>
            <dd className="num">{fmtYen(m.effectiveSavings, compact)}</dd>
          </div>
          <div>
            <dt>
              <span className="swatch" style={{ background: MONEY_COLORS.variable }} />
              今月の変動費
            </dt>
            <dd className="num">
              {hasVarRecords ? (
                <>
                  {fmtYen(varActual, compact)} <span className="muted">/ 目安 {fmtYen(varPace, compact)}</span>
                </>
              ) : (
                <span className="muted">記録なし</span>
              )}
            </dd>
          </div>
        </dl>
        {p.target > 0 && (
          <div className="savings-goal">
            <div className="row">
              <span className="small">
                貯金目標 {fmtYen(p.target, compact)}
                {fin.targetMonth ? `（${fin.targetMonth.replace('-', '年')}月まで）` : ''}
              </span>
              <span className="num small">{Math.min(100, Math.round((fin.currentSavings / p.target) * 100))}%</span>
            </div>
            <Meter value={Math.max(0, fin.currentSavings)} max={p.target} label="貯金目標の進捗" color={MONEY_COLORS.savings} />
            <p className="small muted">
              {p.alreadyReached
                ? '目標額に達しています'
                : p.monthsToTarget
                  ? `今のペースで ${fmtMonths(p.monthsToTarget)}後に到達${p.reachableByDeadline === false ? '（期限には間に合わない計算）' : ''}`
                  : '今の収支のままでは到達しない計算です'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function GoalsSummary() {
  const { data, current } = useStore();
  const { feasibility: f } = useScenarioModel(current);
  const goalById = new Map(data.goals.map((g) => [g.id, g]));
  return (
    <section className="section">
      <SectionHead
        title="目標"
        sub={f.activeCount ? `${f.activeCount}件中 ${f.fitCount}件が時間・予算の範囲に収まっています` : undefined}
        action={
          <a className="section-link" href={href('sim', 'goals')}>
            すべて <Icon name="chevron" size={14} />
          </a>
        }
      />
      {f.goals.length === 0 ? (
        <button type="button" className="empty-row" onClick={() => navigate('sim', 'goals')}>
          <Icon name="plus" size={18} /> 目標を追加して、両立できるか確かめる
        </button>
      ) : (
        <ul className="goal-mini-list">
          {f.goals.slice(0, 4).map((r) => {
            const g = goalById.get(r.goalId)!;
            return (
              <li key={r.goalId}>
                <a className="goal-mini" href={href('sim', 'goals')}>
                  <span className="goal-mini-top">
                    <span className="goal-mini-name">{g.name}</span>
                    {r.completed ? <StatusTag tone="good">完了</StatusTag> : r.fits ? <StatusTag tone="good">両立</StatusTag> : <StatusTag tone="bad">要調整</StatusTag>}
                  </span>
                  <Meter value={r.progress} label={`${g.name}の進捗`} color={r.isMoney ? 'var(--c-commute)' : undefined} />
                  <span className="goal-mini-meta num">
                    {r.isMoney
                      ? `${fmtYen(r.saved, true)} / ${fmtYen(r.budget, true)}${r.monthlyNeed ? ` · 毎月${fmtYen(r.monthlyNeed, true)}` : ''}${r.deadline ? ` · ${fmtDate(r.deadline)}まで` : ''}`
                      : `進捗 ${g.progress}% · 週${fmtH(r.weeklyHours)}h${r.deadline ? ` · 期限 ${fmtDate(r.deadline)}` : ''}`}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {f.conflicts.length > 0 && (
        <div className="callout callout-warn">
          <Icon name="alert" size={18} />
          <div>
            {f.conflicts.map((c, i) => (
              <p key={i}>{c.message}</p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DeviationSummary() {
  const { data, current, today } = useStore();
  const compact = data.settings.compactMoney;
  const dev = useMemo(() => calculatePlanDeviation(data.actuals, current, data.goals, periodFor('week', today)), [data.actuals, current, data.goals, today]);
  const timeRows = dev.time.filter((r) => r.recorded);
  const moneyRows = dev.money.filter((r) => r.recorded);
  return (
    <section className="section">
      <SectionHead
        title="今週の計画と実績"
        sub={`${fmtShortDate(dev.period.start)}〜${fmtShortDate(dev.period.end)}`}
        action={
          <a className="section-link" href={href('log')}>
            記録する <Icon name="chevron" size={14} />
          </a>
        }
      />
      {dev.recordCount === 0 ? (
        <button type="button" className="empty-row" onClick={() => navigate('log')}>
          <Icon name="plus" size={18} /> 今週の実績を記録すると、計画との差がここに表示されます
        </button>
      ) : (
        <div className="panel stack-m">
          {timeRows.map((r) => (
            <DevRow key={r.key} label={TIME_LABELS[r.key]} color={CAT_COLOR[r.key]} planned={r.planned} actual={r.actual} format={(v) => `${fmtH(v)}h`} diff={fmtHours(round(r.diff, 2), 1, true)} />
          ))}
          {moneyRows.map((r) => (
            <DevRow key={r.key} label={EXPENSE_LABELS[r.key]} color={MONEY_COLORS.variable} planned={r.planned} actual={r.actual} format={(v) => fmtYen(v, compact)} diff={fmtYen(r.diff, compact, true)} />
          ))}
          {dev.tasks.count > 0 && (
            <p className="small">
              作業の見積もり: {dev.tasks.count}件で 見積もり {fmtH(dev.tasks.estimate)}h → 実際 {fmtH(dev.tasks.actual)}h
              {dev.tasks.ratio !== null && `（${dev.tasks.ratio.toFixed(2)}倍）`}
            </p>
          )}
          <p className="fineprint">計画は週の値です。記録のない項目は比較していません。</p>
        </div>
      )}
    </section>
  );
}

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

function ScenarioSummary() {
  const { data, current, today } = useStore();
  const compact = data.settings.compactMoney;
  const rows = useMemo(() => compareScenarios(data.scenarios, current, data.goals, data.actuals, today), [data.scenarios, current, data.goals, data.actuals, today]);
  return (
    <section className="section">
      <SectionHead
        title="保存したシナリオ"
        action={
          <a className="section-link" href={href('sim', 'compare')}>
            比較 <Icon name="chevron" size={14} />
          </a>
        }
      />
      {rows.length < 2 ? (
        <button type="button" className="empty-row" onClick={() => navigate('sim', 'compare')}>
          <Icon name="copy" size={18} /> 現在の計画を複製して、別の選択肢と比べる
        </button>
      ) : (
        <div className="scenario-strip">
          {rows.map((r) => (
            <a key={r.id} className="scenario-tile" href={href('sim', 'time', r.id === CURRENT_SCENARIO_ID ? {} : { s: r.id })}>
              <span className="scenario-tile-name">{r.name}</span>
              <span className="scenario-tile-stat">
                <span className="muted">自由時間</span>
                <span className="num">{r.timeShortage > 0 ? `−${fmtH(r.timeShortage)}` : fmtH(r.freeAfterGoals)}h</span>
              </span>
              <span className="scenario-tile-stat">
                <span className="muted">年間貯金</span>
                <span className="num">{fmtYen(r.annualSavings, compact, true)}</span>
              </span>
              <span className="scenario-tile-stat">
                <span className="muted">目標</span>
                <span className="num">
                  {r.goalsFit}/{r.goalsActive}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

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

function RecentRecords() {
  const { data } = useStore();
  const compact = data.settings.compactMoney;
  const recent = [...data.actuals].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const goalName = (id: string | null) => (id ? data.goals.find((g) => g.id === id)?.name ?? null : null);
  if (recent.length === 0) return null;
  return (
    <section className="section">
      <SectionHead
        title="最近の記録"
        action={
          <a className="section-link" href={href('log')}>
            実績 <Icon name="chevron" size={14} />
          </a>
        }
      />
      <ul className="list">
        {recent.map((a) => {
          const d = describeRecord(a, goalName, compact);
          return (
            <li key={a.id} className="list-row list-row-static">
              <span className="list-lead">
                <span className="swatch" style={{ background: d.color }} />
                <span>
                  <span className="list-title">{d.title}</span>
                  <span className="list-sub">
                    {fmtShortDate(a.date)}（{weekdayOf(a.date)}）
                  </span>
                </span>
              </span>
              <span className="num list-value">{d.value}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
