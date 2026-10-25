import { useMemo, useState } from 'react';
import { newId, nowIso, useStore } from '../data/store';
import { TIME_CATEGORY_KEYS, type ActualRecord, type ExpenseCategory, type TaskActual, type TimeCategoryKey } from '../data/types';
import {
  EXPENSE_LABELS,
  TIME_LABELS,
  aggregateSeries,
  calculatePlanDeviation,
  calculateTaskAccuracy,
  isValidDate,
  periodFor,
  round,
  shiftPeriod,
  summarizeTrend,
  weeklyToPeriod,
  type Period,
  type PeriodKind,
} from '../engine';
import { ConfirmSheet, Empty, NumberField, SectionHead, Segmented, SelectField, Sheet, TextField } from '../ui/controls';
import { fmtDate, fmtH, fmtHours, fmtNum, fmtPct, fmtShortDate, fmtYen, weekdayOf } from '../ui/format';
import { Icon } from '../ui/Icon';
import { ScreenHead } from '../ui/ScreenHead';
import { CAT_COLOR, PeriodBars } from '../ui/viz';
import { DevRow, MONEY_COLORS, describeRecord } from '../ui/recordViews';

const KIND_OPTIONS: { value: PeriodKind; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
];

function periodLabel(p: Period, today: string): string {
  if (p.kind === 'day') return p.start === today ? `今日 ${fmtDate(p.start, false)}` : `${fmtDate(p.start, false)}（${weekdayOf(p.start)}）`;
  if (p.kind === 'week') return `${fmtShortDate(p.start)}〜${fmtShortDate(p.end)}`;
  return `${p.start.slice(0, 4)}年${+p.start.slice(5, 7)}月`;
}

/** 足跡（記録）と世界の観測（計画と実績の差・統計）。年代記の館の中で表示する */
export function ActualsScreen({ embedded }: { embedded?: boolean } = {}) {
  const { data, today, current } = useStore();
  const compact = data.settings.compactMoney;
  const [kind, setKind] = useState<PeriodKind>('week');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<ActualRecord | null>(null);
  const [isNew, setIsNew] = useState(false);
  const period = useMemo(() => shiftPeriod(periodFor(kind, today), offset), [kind, today, offset]);
  const dev = useMemo(() => calculatePlanDeviation(data.actuals, current, data.goals, period), [data.actuals, current, data.goals, period]);
  const allTasks = useMemo(() => calculateTaskAccuracy(data.actuals.filter((a): a is TaskActual => a.type === 'task')), [data.actuals]);
  const [trendCat, setTrendCat] = useState<TimeCategoryKey>('study');
  const series = useMemo(() => aggregateSeries(data.actuals, 'week', today, 8, { kind: 'time', category: trendCat }), [data.actuals, today, trendCat]);
  const trend = summarizeTrend(series);
  const weeklyPlan = current.time.items[trendCat].hoursPerDay * current.time.items[trendCat].daysPerWeek;
  const goalName = (id: string | null) => (id ? data.goals.find((g) => g.id === id)?.name ?? null : null);

  const inPeriod = data.actuals
    .filter((a) => a.date >= period.start && a.date <= period.end)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const timeRows = dev.time.filter((r) => r.recorded);
  const moneyRows = dev.money.filter((r) => r.recorded);
  const goalRows = dev.goals.filter((g) => g.hasRecords);
  const unrecorded = dev.time.filter((r) => !r.recorded && r.planned > 0).map((r) => TIME_LABELS[r.key]);

  const startNew = (type: ActualRecord['type'] = 'time') => {
    setIsNew(true);
    setEditing(newRecord(type, offset === 0 || kind !== 'day' ? today : period.start));
  };

  return (
    <>
      {embedded ? (
        <p className="screen-lead">足跡（実際に使った時間とお金）を残すと、計画とのずれが観測できます。</p>
      ) : (
        <ScreenHead eyebrow="世界の観測" title="計画と現実の差">
          <p className="screen-lead">実際に使った時間とお金を記録すると、計画とのずれが見えてきます。</p>
        </ScreenHead>
      )}

      <div className="period-bar">
        <Segmented
          label="集計の単位"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(k) => {
            setKind(k);
            setOffset(0);
          }}
        />
        <div className="period-nav">
          <button type="button" className="icon-btn" aria-label="前の期間" onClick={() => setOffset(offset - 1)}>
            <Icon name="chevron-left" size={20} />
          </button>
          <span className="period-label num" aria-live="polite">
            {periodLabel(period, today)}
          </span>
          <button type="button" className="icon-btn" aria-label="次の期間" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>
            <Icon name="chevron" size={20} />
          </button>
        </div>
      </div>

      <div className="quick-add" role="group" aria-label="記録を追加">
        {([
          ['time', 'clock', '時間'],
          ['expense', 'yen', '支出'],
          ['task', 'check', '作業'],
          ['progress', 'target', '進捗'],
        ] as const).map(([t, icon, label]) => (
          <button key={t} type="button" className="quick-add-btn" onClick={() => startNew(t)}>
            <Icon name={icon} size={20} />
            <span>{label}を記録</span>
          </button>
        ))}
      </div>

      {dev.recordCount === 0 ? (
        <Empty icon="log" title="この期間の記録はありません">
          上のボタンから記録すると、{kind === 'day' ? '1日' : kind === 'week' ? '1週間' : '1か月'}の計画値と比べた差を表示します。
        </Empty>
      ) : (
        <>
          <section className="section">
            <SectionHead title="計画との差" sub={`計画値は現在の計画を${kind === 'day' ? '1日' : kind === 'week' ? '1週' : '1か月'}あたりに換算`} />
            <div className="panel stack-m">
              {timeRows.map((r) => (
                <DevRow key={r.key} label={TIME_LABELS[r.key]} color={CAT_COLOR[r.key]} planned={r.planned} actual={r.actual} format={(v) => `${fmtH(v)}h`} diff={fmtHours(round(r.diff, 2), 1, true)} />
              ))}
              {moneyRows.map((r) => (
                <DevRow key={r.key} label={EXPENSE_LABELS[r.key]} color={MONEY_COLORS[r.key === 'fixed' ? 'fixed' : 'variable']} planned={r.planned} actual={r.actual} format={(v) => fmtYen(v, compact)} diff={fmtYen(r.diff, compact, true)} />
              ))}
              {dev.goalSpending > 0 && (
                <p className="small">
                  目標の費用として記録した支出: <span className="num">{fmtYen(dev.goalSpending, compact)}</span>
                </p>
              )}
              {unrecorded.length > 0 && <p className="fineprint">記録のない項目（{unrecorded.join('・')}）は、0時間とは見なさず比較から除いています。</p>}
            </div>
          </section>

          {goalRows.length > 0 && (
            <section className="section">
              <SectionHead title="目標ごとの実績" />
              <ul className="list">
                {goalRows.map((g) => (
                  <li key={g.goalId} className="list-row list-row-static">
                    <span>
                      <span className="list-title">{g.name}</span>
                      <span className="list-sub num">
                        計画 {fmtH(g.plannedHours)}h{g.spent > 0 ? ` · 支出 ${fmtYen(g.spent, compact)}` : ''}
                      </span>
                    </span>
                    <span className="num list-value">{fmtH(g.actualHours)}h</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="section">
        <SectionHead title="見積もりの精度" sub="作業の記録（見積もり時間と実際の時間）から計算" />
        {allTasks.count === 0 ? (
          <p className="muted small">「作業を記録」で見積もりと実際の時間を入れると、見積もりがどの程度ずれやすいかを表示します。</p>
        ) : (
          <div className="panel">
            <div className="accuracy">
              <div>
                <p className="hero-label">実際 ÷ 見積もり</p>
                <p className="hero-num">
                  <span className="num">{allTasks.ratio !== null ? allTasks.ratio.toFixed(2) : '—'}</span>
                  <span className="hero-unit">倍</span>
                </p>
              </div>
              <dl className="stats stats-2">
                <div className="stat">
                  <dt>記録した作業</dt>
                  <dd className="num">{allTasks.count}件</dd>
                </div>
                <div className="stat">
                  <dt>平均の誤差</dt>
                  <dd className="num">{fmtPct(allTasks.meanAbsPctError)}</dd>
                </div>
                <div className="stat">
                  <dt>±20%以内</dt>
                  <dd className="num">{fmtPct(allTasks.withinTolerancePct)}</dd>
                </div>
                <div className="stat">
                  <dt>合計の差</dt>
                  <dd className="num">{fmtHours(allTasks.diff, 1, true)}</dd>
                </div>
              </dl>
            </div>
            {allTasks.sufficient ? (
              <p className="small">
                これまでの {allTasks.count}件では、見積もり1時間あたり実際は約{fmtNum(allTasks.ratio ?? 0, 2)}時間かかっています。次の見積もりの参考にしてください。
              </p>
            ) : (
              <p className="callout callout-neutral small">
                <Icon name="info" size={16} /> まだ{allTasks.count}件のため、傾向とは言えません（5件以上で傾向を表示します）。
              </p>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <SectionHead title="週ごとの推移" sub="直近8週の記録の合計" />
        <div className="panel">
          <div className="chips chips-scroll">
            {TIME_CATEGORY_KEYS.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={trendCat === k} onClick={() => setTrendCat(k)}>
                <span className="swatch" style={{ background: CAT_COLOR[k] }} /> {TIME_LABELS[k]}
              </button>
            ))}
          </div>
          <PeriodBars points={series.map((s) => ({ label: fmtShortDate(s.period.start), value: s.value, count: s.count }))} planned={weeklyToPeriod(weeklyPlan, 'week')} format={(v) => `${fmtH(v)}h`} color={CAT_COLOR[trendCat]} />
          {trend.sufficient ? (
            <p className="small">
              記録のある週の平均は、直近4週 <span className="num">{fmtH(trend.recentAverage ?? 0)}h</span>、その前の4週 <span className="num">{fmtH(trend.earlierAverage ?? 0)}h</span>
              {trend.changePct !== null && `（${trend.changePct >= 0 ? '+' : ''}${fmtNum(trend.changePct, 0)}%）`}。計画は週 {fmtH(weeklyPlan)}h です。
            </p>
          ) : (
            <p className="small muted">記録のある週が {trend.periodsWithData}週分のため、傾向は表示しません（前半4週・後半4週にそれぞれ2週分以上の記録で表示）。</p>
          )}
        </div>
      </section>

      <section className="section">
        <SectionHead title="この期間の記録" sub={`${inPeriod.length}件`} />
        {inPeriod.length === 0 ? (
          <p className="muted small">記録はありません。</p>
        ) : (
          <ul className="list">
            {inPeriod.map((a) => {
              const d = describeRecord(a, goalName, compact);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className="list-row"
                    onClick={() => {
                      setIsNew(false);
                      setEditing(a);
                    }}
                  >
                    <span className="list-lead">
                      <span className="swatch" style={{ background: d.color }} />
                      <span>
                        <span className="list-title">{d.title}</span>
                        <span className="list-sub">
                          {fmtShortDate(a.date)}（{weekdayOf(a.date)}）{a.memo && a.type !== 'expense' ? ` · ${a.memo}` : ''}
                        </span>
                      </span>
                    </span>
                    <span className="num list-value">{d.value}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <RecordEditor record={editing} isNew={isNew} onClose={() => setEditing(null)} />
    </>
  );
}

/** 新しい足跡（記録）の下書き */
export function newRecord(type: ActualRecord['type'], date: string): ActualRecord {
  const base = { id: newId('a-'), date, goalId: null, memo: '', createdAt: nowIso() };
  return type === 'time'
    ? { ...base, type, category: 'study', hours: 1 }
    : type === 'expense'
      ? { ...base, type, expenseCategory: 'variable', amount: 0 }
      : type === 'task'
        ? { ...base, type, title: '', estimateHours: 1, actualHours: 1 }
        : { ...base, type, progress: 0 };
}

/** 足跡（記録）の追加・編集・削除。保存処理もここで行う（世界の中心と年代記の館で共通） */
export function RecordEditor({ record, isNew, onClose }: { record: ActualRecord | null; isNew: boolean; onClose: () => void }) {
  const { update } = useStore();
  return (
    <RecordSheet
      record={record}
      isNew={isNew}
      onClose={onClose}
      onSave={(r) => {
        update(
          (d) => {
            const exists = d.actuals.some((a) => a.id === r.id);
            let next = { ...d, actuals: exists ? d.actuals.map((a) => (a.id === r.id ? r : a)) : [...d.actuals, r] };
            // 進捗の記録は、それが最新の記録なら目標の進捗にも反映する
            if (r.type === 'progress' && r.goalId) {
              const latest = next.actuals.filter((a) => a.type === 'progress' && a.goalId === r.goalId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
              if (latest?.id === r.id) next = { ...next, goals: next.goals.map((g) => (g.id === r.goalId ? { ...g, progress: r.progress, updatedAt: nowIso() } : g)) };
            }
            return next;
          },
          { success: isNew ? '足跡を残しました' : '保存しました' },
        );
        onClose();
      }}
      onDelete={(r) => {
        update((d) => ({ ...d, actuals: d.actuals.filter((a) => a.id !== r.id) }), { undo: '記録を削除しました' });
        onClose();
      }}
    />
  );
}

function RecordSheet({ record, isNew, onClose, onSave, onDelete }: { record: ActualRecord | null; isNew: boolean; onClose: () => void; onSave: (r: ActualRecord) => void; onDelete: (r: ActualRecord) => void }) {
  const { data, current } = useStore();
  const [draft, setDraft] = useState<ActualRecord | null>(record);
  const [last, setLast] = useState(record);
  const [confirm, setConfirm] = useState(false);
  if (record !== last) {
    setLast(record);
    setDraft(record);
  }
  if (!draft) return null;
  const set = (p: Partial<ActualRecord>) => setDraft({ ...draft, ...p } as ActualRecord);
  const goalOptions = [{ value: '', label: 'なし' }, ...data.goals.map((g) => ({ value: g.id, label: g.name }))];
  const valid =
    isValidDate(draft.date) &&
    (draft.type !== 'expense' || draft.amount > 0) &&
    (draft.type !== 'progress' || !!draft.goalId) &&
    (draft.type !== 'time' || draft.hours > 0);

  const typeLabel = { time: '時間', expense: '支出', task: '作業', progress: '進捗' }[draft.type];
  return (
    <>
      <Sheet
        open={!!record}
        onClose={onClose}
        title={`${typeLabel}を${isNew ? '記録' : '編集'}`}
        footer={
          <div className="btn-row">
            {!isNew && (
              <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => setConfirm(true)}>
                <Icon name="trash" size={18} /> 削除
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSave(draft)}>
              {isNew ? '記録する' : '保存'}
            </button>
          </div>
        }
      >
        <div className="stack-m">
          {isNew && (
            <Segmented
              label="記録の種類"
              options={[
                { value: 'time', label: '時間' },
                { value: 'expense', label: '支出' },
                { value: 'task', label: '作業' },
                { value: 'progress', label: '進捗' },
              ]}
              value={draft.type}
              onChange={(type) => {
                const base = { id: draft.id, date: draft.date, goalId: draft.goalId, memo: draft.memo, createdAt: draft.createdAt };
                setDraft(
                  type === 'time'
                    ? { ...base, type, category: 'study', hours: 1 }
                    : type === 'expense'
                      ? { ...base, type, expenseCategory: 'variable', amount: 0 }
                      : type === 'task'
                        ? { ...base, type, title: '', estimateHours: 1, actualHours: 1 }
                        : { ...base, type, progress: data.goals.find((g) => g.id === draft.goalId)?.progress ?? 0 },
                );
              }}
            />
          )}
          <TextField label="日付" type="date" value={draft.date} onChange={(date) => set({ date })} />

          {draft.type === 'time' && (
            <>
              <SelectField label="項目" value={draft.category} onChange={(category) => set({ category })} options={TIME_CATEGORY_KEYS.map((k) => ({ value: k, label: TIME_LABELS[k] }))} />
              <NumberField
                label="実際の時間"
                value={draft.hours}
                onChange={(hours) => set({ hours })}
                min={0}
                max={24}
                step={0.25}
                unit="時間"
                slider={{ min: 0, max: 12, step: 0.25 }}
                color={CAT_COLOR[draft.category]}
                hint={`計画では1日あたり平均 ${fmtH(weeklyToPeriod(current.time.items[draft.category].hoursPerDay * current.time.items[draft.category].daysPerWeek, 'day'))}時間`}
              />
            </>
          )}
          {draft.type === 'expense' && (
            <>
              <Segmented<ExpenseCategory>
                label="支出の種類"
                options={(['variable', 'fixed', 'goal'] as const).map((k) => ({ value: k, label: EXPENSE_LABELS[k] }))}
                value={draft.expenseCategory}
                onChange={(expenseCategory) => set({ expenseCategory })}
              />
              <NumberField label="金額" value={draft.amount} onChange={(amount) => set({ amount })} min={0} max={1e10} step={100} unit="円" slider={false} hint={draft.amount <= 0 ? '1円以上を入力してください' : '目標の費用は、その目標の残りの予算から差し引かれます'} />
            </>
          )}
          {draft.type === 'task' && (
            <>
              <TextField label="作業名" value={draft.title} onChange={(title) => set({ title })} placeholder="例: 過去問を1回分解く" maxLength={60} />
              <NumberField label="見積もり時間" value={draft.estimateHours} onChange={(estimateHours) => set({ estimateHours })} min={0} max={1000} step={0.25} unit="時間" slider={{ min: 0, max: 8, step: 0.25 }} />
              <NumberField label="実際にかかった時間" value={draft.actualHours} onChange={(actualHours) => set({ actualHours })} min={0} max={1000} step={0.25} unit="時間" slider={{ min: 0, max: 8, step: 0.25 }} />
              <p className="formula num">
                差 {fmtHours(draft.actualHours - draft.estimateHours, 2, true)}
                {draft.estimateHours > 0 && `（見積もりの ${fmtNum((draft.actualHours / draft.estimateHours) * 100)}%）`}
              </p>
            </>
          )}
          {draft.type === 'progress' && (
            <NumberField label="進捗" value={draft.progress} onChange={(progress) => set({ progress })} min={0} max={100} step={1} unit="%" slider={{ min: 0, max: 100, step: 5 }} hint="最新の進捗の記録は、目標の進捗にも反映されます" />
          )}

          <SelectField
            label={draft.type === 'progress' ? '目標（必須）' : '関連する目標（任意）'}
            value={draft.goalId ?? ''}
            onChange={(v) => {
              const p: Partial<ActualRecord> = { goalId: v || null };
              if (draft.type === 'progress' && isNew) (p as { progress: number }).progress = data.goals.find((g) => g.id === v)?.progress ?? draft.progress;
              set(p);
            }}
            options={goalOptions}
          />
          <TextField label="メモ（任意）" value={draft.memo} onChange={(memo) => set({ memo })} multiline maxLength={300} />
        </div>
      </Sheet>
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} title="記録を削除" danger confirmLabel="削除する" message="この記録を削除します。" onConfirm={() => onDelete(draft)} />
    </>
  );
}
