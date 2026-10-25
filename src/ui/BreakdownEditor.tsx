import { useState } from 'react';
import { BREAKDOWNS, itemsPatch, mergeItems } from '../data/breakdowns';
import { newId } from '../data/store';
import type { BreakdownKind, FinancialProfile, MoneyItem } from '../data/types';
import { ConfirmSheet, NumberField, SelectField, Sheet, TextField } from './controls';
import { fmtYen } from './format';
import { Icon } from './Icon';

/**
 * お金の内訳（収入・固定費・変動費・毎月の貯金や積立）をグループごとに入力する。
 * 合計は内訳から自動で計算し、合計の値にも同じ値を保存する。
 */
export function BreakdownEditor({ kind, fin, onChange, color, hint, compactMoney }: { kind: BreakdownKind; fin: FinancialProfile; onChange: (patch: Partial<FinancialProfile>) => void; color?: string; hint?: string; compactMoney?: boolean }) {
  const def = BREAKDOWNS[kind];
  const items = mergeItems(kind, fin);
  const total = items.reduce((s, i) => s + i.amount, 0);
  // 最初はグループを閉じて小計だけを見せる。まだ何も入力していなければ最初のグループを開く
  const [open, setOpen] = useState<Set<string>>(() => new Set(total === 0 ? [def.groups[0].id] : []));
  const [editing, setEditing] = useState<MoneyItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirm, setConfirm] = useState<MoneyItem | null>(null);

  const save = (next: MoneyItem[]) => onChange(itemsPatch(kind, next));
  const setAmount = (id: string, amount: number) => save(items.map((i) => (i.id === id ? { ...i, amount } : i)));
  const isPreset = (id: string) => def.presets.some((p) => p.id === id);
  const toggle = (g: string) =>
    setOpen((cur) => {
      const n = new Set(cur);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  return (
    <section className="bd" aria-label={`${def.title}の内訳`}>
      <div className="bd-head">
        <div>
          <p className="field-label">{def.title}</p>
          <p className="bd-total num">
            {fmtYen(total)}
            <span className="unit">/月 · 合計</span>
          </p>
        </div>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => {
            setIsNew(true);
            setEditing({ id: newId(`${kind.slice(0, 2)}-`), label: '', amount: 0, group: def.groups[def.groups.length - 1].id });
          }}
        >
          <Icon name="plus" size={16} /> 項目
        </button>
      </div>
      {hint && <p className="field-hint">{hint}</p>}

      <div className="bd-groups">
        {def.groups.map((g) => {
          const gi = items.filter((i) => i.group === g.id);
          const sub = gi.reduce((s, i) => s + i.amount, 0);
          const used = gi.filter((i) => i.amount > 0).length;
          const isOpen = open.has(g.id);
          return (
            <div key={g.id} className={`bd-group${isOpen ? ' is-open' : ''}`}>
              <button type="button" className="bd-group-head" aria-expanded={isOpen} onClick={() => toggle(g.id)}>
                <span className="bd-group-name">
                  {g.label}
                  <span className="bd-group-count">{used > 0 ? `${used} / ${gi.length}項目` : `${gi.length}項目`}</span>
                </span>
                <span className="bd-group-sub num">
                  {sub > 0 ? fmtYen(sub, compactMoney) : <span className="muted">0円</span>}
                  {total > 0 && sub > 0 && <span className="bd-share">{Math.round((sub / total) * 100)}%</span>}
                </span>
                <Icon name="chevron-down" size={18} className="bd-chevron" />
              </button>
              {isOpen && (
                <ul className="bd-items">
                  {gi.map((item) => {
                    const preset = def.presets.find((p) => p.id === item.id);
                    const max = Math.max(preset?.max ?? 100000, Math.ceil(item.amount / 10000) * 10000);
                    return (
                      <li key={item.id} className="bd-item">
                        <NumberField
                          label={item.label}
                          value={item.amount}
                          onChange={(v) => setAmount(item.id, v)}
                          min={0}
                          max={1e10}
                          step={500}
                          unit="円/月"
                          slider={{ min: 0, max, step: max > 100000 ? 1000 : 500 }}
                          color={color}
                          hint={preset?.hint}
                          aside={
                            !isPreset(item.id) ? (
                              <button
                                type="button"
                                className="bd-edit"
                                aria-label={`${item.label}の名前を変更・削除`}
                                onClick={() => {
                                  setIsNew(false);
                                  setEditing(item);
                                }}
                              >
                                <Icon name="edit" size={16} />
                              </button>
                            ) : undefined
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="fineprint">合計 = 各項目の合計。使わない項目は 0 円のままで大丈夫です。年払いのものは 12 で割って入力してください。</p>

      <ItemSheet
        kind={kind}
        item={editing}
        isNew={isNew}
        onClose={() => setEditing(null)}
        onSave={(it) => {
          save(isNew ? [...items, it] : items.map((i) => (i.id === it.id ? it : i)));
          setOpen((cur) => new Set([...cur, it.group!]));
          setEditing(null);
        }}
        onDelete={(it) => {
          setEditing(null);
          setConfirm(it);
        }}
      />
      <ConfirmSheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="項目を削除"
        danger
        confirmLabel="削除する"
        message={<p>「{confirm?.label}」（{fmtYen(confirm?.amount ?? 0, compactMoney)}/月）を削除します。合計からも差し引かれます。</p>}
        onConfirm={() => confirm && save(items.filter((i) => i.id !== confirm.id))}
      />
    </section>
  );
}

function ItemSheet({ kind, item, isNew, onClose, onSave, onDelete }: { kind: BreakdownKind; item: MoneyItem | null; isNew: boolean; onClose: () => void; onSave: (i: MoneyItem) => void; onDelete: (i: MoneyItem) => void }) {
  const def = BREAKDOWNS[kind];
  const [draft, setDraft] = useState<MoneyItem | null>(item);
  const [last, setLast] = useState(item);
  if (item !== last) {
    setLast(item);
    setDraft(item);
  }
  if (!draft) return null;
  const valid = draft.label.trim() !== '';
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={isNew ? `${def.title}の項目を追加` : '項目を編集'}
      footer={
        <div className="btn-row">
          {!isNew && (
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => onDelete(draft)}>
              <Icon name="trash" size={18} /> 削除
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onSave({ ...draft, label: draft.label.trim() })}>
            {isNew ? '追加する' : '保存'}
          </button>
        </div>
      }
    >
      <div className="stack-m">
        {isNew && (
          <div className="chips">
            {def.ideas.map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={draft.label === n} onClick={() => setDraft({ ...draft, label: n })}>
                {n}
              </button>
            ))}
          </div>
        )}
        <TextField label="項目名" value={draft.label} onChange={(label) => setDraft({ ...draft, label })} required maxLength={24} />
        <SelectField label="グループ" value={draft.group ?? def.groups[0].id} onChange={(group) => setDraft({ ...draft, group })} options={def.groups.map((g) => ({ value: g.id, label: g.label }))} />
        <NumberField label="金額" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} min={0} max={1e10} step={500} unit="円/月" slider={false} />
      </div>
    </Sheet>
  );
}
