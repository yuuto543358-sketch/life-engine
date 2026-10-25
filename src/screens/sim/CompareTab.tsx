import { useMemo, useState } from 'react';
import { nowIso, useStore } from '../../data/store';
import { CURRENT_SCENARIO_ID, type Scenario } from '../../data/types';
import { compareScenarios, structuredCloneSafe, type ScenarioChange, type ScenarioSummary } from '../../engine';
import { ConfirmSheet, Empty, StatusTag } from '../../ui/controls';
import { fmtH, fmtMonths, fmtNum, fmtYen } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { NewScenarioSheet, RenameScenarioSheet } from '../../ui/ScenarioSheets';

interface Metric {
  key: string;
  label: string;
  unit: string;
  value: (s: ScenarioSummary) => number | null;
  format: (v: number) => string;
  /** 値が計算できないときの表示 */
  emptyText?: (s: ScenarioSummary) => string;
}

export function CompareTab({ activeId, onOpen }: { activeId: string; onOpen: (id: string) => void }) {
  const { data, today, current, update } = useStore();
  const compact = data.settings.compactMoney;
  const [selected, setSelected] = useState<string[]>(() => data.scenarios.slice(0, 4).map((s) => s.id));
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Scenario | null>(null);
  const [adopting, setAdopting] = useState<Scenario | null>(null);

  const scenarios = useMemo(() => data.scenarios.filter((s) => selected.includes(s.id)), [data.scenarios, selected]);
  const rows = useMemo(() => compareScenarios(scenarios, current, data.goals, data.actuals, today), [scenarios, current, data.goals, data.actuals, today]);
  const all = useMemo(() => compareScenarios(data.scenarios, current, data.goals, data.actuals, today), [data.scenarios, current, data.goals, data.actuals, today]);
  const base = all.find((r) => r.id === CURRENT_SCENARIO_ID)!;

  const metrics: Metric[] = [
    { key: 'free', label: '週の自由時間（目標に使った後）', unit: 'h/週', value: (s) => (s.timeShortage > 0 ? -s.timeShortage : s.freeAfterGoals), format: (v) => `${fmtH(v)}h` },
    { key: 'surplus', label: '月間収支', unit: '円/月', value: (s) => s.monthlySurplus, format: (v) => fmtYen(v, compact, true) },
    { key: 'annual', label: '年間の貯金の増加', unit: '円/年', value: (s) => s.annualSavings, format: (v) => fmtYen(v, compact, true) },
    {
      key: 'target',
      label: '貯金目標の達成まで',
      unit: 'か月',
      value: (s) => (s.targetSet ? s.monthsToTarget : null),
      format: (v) => fmtMonths(v),
      emptyText: (s) => (s.targetSet ? '届かない' : '目標なし'),
    },
    { key: 'budget', label: 'お金の不足', unit: '円/月', value: (s) => s.budgetShortage, format: (v) => (v > 0 ? fmtYen(v, compact) : 'なし') },
    { key: 'goals', label: '両立できる目標', unit: '件', value: (s) => s.goalsFit, format: (v) => `${fmtNum(v)}件` },
  ];

  if (data.scenarios.length < 2) {
    return (
      <>
        <Empty
          icon="layers"
          title="比べるシナリオを作りましょう"
          action={
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Icon name="copy" size={18} /> 現在の計画を複製
            </button>
          }
        >
          現在の計画を複製して「勉強優先」「貯金優先」などのシナリオを作ると、時間・お金・目標への影響を並べて比較できます。
        </Empty>
        <NewScenarioSheet open={creating} onClose={() => setCreating(false)} sourceId={CURRENT_SCENARIO_ID} onCreated={onOpen} />
      </>
    );
  }

  return (
    <div className="stack-l">
      <section aria-label="比較するシナリオ">
        <p className="section-note">比較するシナリオを選んでください（最大4件）。差は「現在の計画」との比較です。</p>
        <div className="chips">
          {data.scenarios.map((s) => {
            const on = selected.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className="chip"
                aria-pressed={on}
                disabled={!on && selected.length >= 4}
                onClick={() => setSelected(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
              >
                {on && <Icon name="check" size={14} />} {s.name}
              </button>
            );
          })}
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="muted">シナリオを1件以上選んでください。</p>
      ) : (
        <section className="compare" aria-label="比較結果">
          {metrics.map((m) => {
            const vals = rows.map((r) => m.value(r));
            const maxAbs = Math.max(1e-9, ...vals.map((v) => Math.abs(v ?? 0)));
            const baseVal = m.value(base);
            return (
              <div key={m.key} className="compare-metric">
                <h3 className="compare-label">{m.label}</h3>
                <ul className="compare-bars">
                  {rows.map((r, i) => {
                    const v = vals[i];
                    const diff = v !== null && baseVal !== null && r.id !== CURRENT_SCENARIO_ID ? v - baseVal : null;
                    return (
                      <li key={r.id} className="compare-bar-row">
                        <span className="compare-name">{r.name}</span>
                        <span className="compare-track">
                          {v !== null && <span className={`compare-fill${v < 0 ? ' is-neg' : ''}`} style={{ width: `${(Math.abs(v) / maxAbs) * 100}%` }} />}
                        </span>
                        <span className="compare-value num">
                          {v === null ? m.emptyText?.(r) ?? '—' : m.format(v)}
                          {diff !== null && Math.abs(diff) > 1e-9 && (
                            <span className="compare-diff">
                              {diff > 0 ? '+' : '−'}
                              {m.key === 'free' ? `${fmtH(Math.abs(diff))}h` : m.key === 'target' ? `${fmtNum(Math.abs(diff))}か月` : m.key === 'goals' ? `${fmtNum(Math.abs(diff))}件` : fmtYen(Math.abs(diff), compact)}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <p className="fineprint">値の良し悪しは判定しません。何を優先するかはあなたが決めてください。</p>
        </section>
      )}

      <section aria-label="シナリオの一覧">
        <div className="section-head">
          <h2 className="section-title">シナリオ</h2>
          <button type="button" className="btn btn-small btn-primary" onClick={() => setCreating(true)}>
            <Icon name="copy" size={16} /> 複製して作成
          </button>
        </div>
        <div className="stack-m">
          {all.map((r) => {
            const s = data.scenarios.find((x) => x.id === r.id)!;
            const isCurrent = s.id === CURRENT_SCENARIO_ID;
            return (
              <article key={s.id} className={`scenario-card${s.id === activeId ? ' is-active' : ''}`}>
                <header className="scenario-card-head">
                  <div>
                    <h3 className="scenario-card-title">
                      {s.name} {isCurrent && <span className="badge">基準</span>}
                    </h3>
                    {s.note && <p className="scenario-card-note">{s.note}</p>}
                  </div>
                  <div className="scenario-card-status">
                    {r.timeShortage > 0 && <StatusTag tone="bad">時間不足</StatusTag>}
                    {r.budgetShortage > 0 && <StatusTag tone="bad">お金不足</StatusTag>}
                    {r.timeShortage <= 0 && r.budgetShortage <= 0 && <StatusTag tone="good">成立</StatusTag>}
                  </div>
                </header>
                {!isCurrent && <ChangeList changes={r.changes} compact={compact} />}
                <div className="scenario-actions">
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => onOpen(s.id)}>
                    <Icon name="edit" size={16} /> 編集
                  </button>
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => setRenaming(s.id)}>
                    名前
                  </button>
                  {!isCurrent && (
                    <>
                      <button type="button" className="btn btn-small btn-ghost" onClick={() => setAdopting(s)}>
                        <Icon name="swap" size={16} /> 採用
                      </button>
                      <button type="button" className="btn btn-small btn-ghost btn-danger-text" aria-label={`${s.name}を削除`} onClick={() => setDeleting(s)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <NewScenarioSheet open={creating} onClose={() => setCreating(false)} sourceId={activeId} onCreated={(id) => setSelected((x) => (x.length < 4 ? [...x, id] : x))} />
      <RenameScenarioSheet open={!!renaming} onClose={() => setRenaming(null)} scenarioId={renaming ?? ''} />
      <ConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="シナリオを削除"
        danger
        confirmLabel="削除する"
        message={<p>「{deleting?.name}」を削除します。ほかのシナリオと現在の計画は変わりません。</p>}
        onConfirm={() => {
          const id = deleting!.id;
          setSelected((x) => x.filter((y) => y !== id));
          update((d) => ({ ...d, scenarios: d.scenarios.filter((s) => s.id !== id) }), { undo: `「${deleting!.name}」を削除しました` });
        }}
      />
      <ConfirmSheet
        open={!!adopting}
        onClose={() => setAdopting(null)}
        title="このシナリオを採用"
        confirmLabel="現在の計画にする"
        message={
          <p>
            「{adopting?.name}」の時間配分・お金・目標の計画を「現在の計画」にコピーします。いまの「現在の計画」の内容は上書きされます（直後なら元に戻せます）。「{adopting?.name}」自体はそのまま残ります。
          </p>
        }
        onConfirm={() => {
          const src = adopting!;
          update(
            (d) => ({
              ...d,
              scenarios: d.scenarios.map((s) =>
                s.id === CURRENT_SCENARIO_ID
                  ? { ...s, time: structuredCloneSafe(src.time), finance: structuredCloneSafe(src.finance), goalPlans: structuredCloneSafe(src.goalPlans), updatedAt: nowIso() }
                  : s,
              ),
            }),
            { undo: `「${src.name}」を現在の計画にしました` },
          );
        }}
      />
    </div>
  );
}

function ChangeList({ changes, compact }: { changes: ScenarioChange[]; compact: boolean }) {
  if (changes.length === 0) return <p className="muted small">現在の計画と同じ内容です。</p>;
  const fmt = (v: string | number, unit: ScenarioChange['unit']) => {
    if (typeof v === 'string') return v;
    if (unit === '円/月' || unit === '円') return fmtYen(v, compact);
    if (unit === '位') return `${v}位`;
    return `${fmtNum(v, 2)}${unit.replace('h/日', 'h').replace('h/週', 'h').replace('日/週', '日')}`;
  };
  const shown = changes.slice(0, 6);
  return (
    <div className="changes">
      <p className="changes-title">現在の計画から変更した項目（{changes.length}件）</p>
      <ul>
        {shown.map((c, i) => (
          <li key={i}>
            <span className="changes-label">{c.label}</span>
            <span className="num changes-values">
              {fmt(c.from, c.unit)} <Icon name="arrow" size={12} /> <strong>{fmt(c.to, c.unit)}</strong>
            </span>
          </li>
        ))}
      </ul>
      {changes.length > shown.length && <p className="muted small">ほか {changes.length - shown.length}件</p>}
    </div>
  );
}
